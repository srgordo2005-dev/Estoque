const { app, BrowserWindow, Tray, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let forceQuit = false;

// 1. Single Instance Lock: impede que o aplicativo seja executado várias vezes em segundo plano
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log("Uma instância do HashStock já está em execução. Abrindo apenas o painel Web...");
    shell.openExternal('https://estoque-zeta-one.vercel.app/');
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        console.log("Tentativa de abrir 2ª instância detectada. Focando aplicativo existente...");
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        } else {
            shell.openExternal('https://estoque-zeta-one.vercel.app/');
        }
    });
}

// Verification to prevent duplicate local servers on port 3001
async function isServerRunning() {
    try {
        const res = await fetch('http://localhost:3001/api/version');
        return res.ok;
    } catch (e) {
        return false;
    }
}

async function startHelperNatively() {
    const running = await isServerRunning();
    if (running) {
        console.log("✅ Servidor local (local-helper) já está online na porta 3001. Não abrirá outro servidor!");
        return;
    }
    console.log("Iniciando local-helper nativamente dentro do Electron...");
    try {
        require('./local-helper.js');
        console.log("Local helper iniciado com sucesso!");
    } catch (err) {
        console.error("Falha ao carregar local-helper:", err);
        try {
            const errorMsg = `[${new Date().toISOString()}] Error: ${err.message}\nStack: ${err.stack}\n\n`;
            fs.appendFileSync(path.join(app.getPath('userData'), 'helper_crash.log'), errorMsg);
        } catch (e) {}
    }
}

function createWindow() {
    if (mainWindow) {
        mainWindow.show();
        return;
    }

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "HashStock · Monitor de Fazenda",
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadURL('https://estoque-zeta-one.vercel.app/');

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http:') || url.startsWith('https:')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.on('close', (event) => {
        if (!forceQuit) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'icon.png');
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Abrir Painel HashStock', 
            click: () => {
                createWindow();
            } 
        },
        { type: 'separator' },
        { 
            label: 'Sair e Encerrar Servidor', 
            click: () => {
                forceQuit = true;
                app.quit();
            } 
        }
    ]);

    tray.setToolTip('HashStock · Servidor Ativo');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        createWindow();
    });
}

app.whenReady().then(async () => {
    await startHelperNatively();
    createTray();
    
    // Abrir painel no navegador padrão de forma limpa
    shell.openExternal('https://estoque-zeta-one.vercel.app/');
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
