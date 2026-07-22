const { app, BrowserWindow, Tray, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let forceQuit = false;

async function startHelperNatively() {
    console.log("Starting local-helper natively inside Electron...");
    try {
        // Require the CommonJS helper (perfect for ASAR packaging)
        require('./local-helper.js');
        console.log("Local helper started successfully!");
    } catch (err) {
        console.error("Failed to load local-helper natively:", err);
        try {
            const errorMsg = `[${new Date().toISOString()}] Error: ${err.message}\nStack: ${err.stack}\n\n`;
            // Write to app data folder
            fs.appendFileSync(path.join(app.getPath('userData'), 'helper_crash.log'), errorMsg);
            // Write to desktop/workspace folder if accessible
            fs.appendFileSync('C:\\\\Users\\\\Felip\\\\.gemini\\\\antigravity\\\\scratch\\\\Estoque-main\\\\desktop\\\\helper_crash.log', errorMsg);
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

    // Intercept window.open to launch system default browser instead of Electron child window
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http:') || url.startsWith('https:')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    // Hide window on close instead of exiting
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
    setTimeout(checkForUpdates, 3000);
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
    
    // Abrir painel no navegador padrão do usuário de forma automática
    shell.openExternal('https://estoque-zeta-one.vercel.app/');
    
    // Verificar atualizações após a inicialização
    setTimeout(checkForUpdates, 3000);
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});


const pkgInfo = require('./package.json');

async function checkForUpdates() {
    console.log("Verificando atualizações...");
    try {
        const res = await fetch('https://estoque-zeta-one.vercel.app/version.json');
        if (!res.ok) return;
        const latest = await res.json();
        
        const currentVersion = pkgInfo.version;
        const latestVersion = latest.version;

        if (compareVersions(latestVersion, currentVersion) > 0) {
            const { response } = await dialog.showMessageBox(mainWindow, {
                type: 'question',
                buttons: ['Atualizar Agora', 'Mais Tarde'],
                defaultId: 0,
                title: 'Atualização Disponível',
                message: `Uma nova versão do HashStock (${latestVersion}) está disponível!`,
                detail: 'Deseja abrir o link para baixar o instalador da nova versão?'
            });
            
            if (response === 0) {
                shell.openExternal(latest.url);
                app.quit();
            }
        }
    } catch (err) {
        console.error("Erro na verificação de atualizações:", err.message);
    }
}

function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (parts1[i] > parts2[i]) return 1;
        if (parts1[i] < parts2[i]) return -1;
    }
    return 0;
}
