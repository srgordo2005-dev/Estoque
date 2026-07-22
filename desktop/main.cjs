const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let forceQuit = false;

async function startHelperNatively() {
    console.log("Starting local-helper natively inside Electron...");
    try {
        // Dynamically import the ES Module helper
        await import('./local-helper.js');
        console.log("Local helper started successfully!");
    } catch (err) {
        console.error("Failed to load local-helper natively:", err);
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
    createWindow();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
