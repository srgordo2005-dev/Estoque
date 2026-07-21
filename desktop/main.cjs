const { app, BrowserWindow, Tray, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let helperProcess = null;
let mainWindow = null;
let tray = null;
let forceQuit = false;

function startHelper() {
    console.log("Starting local-helper process silently...");
    const helperPath = path.join(__dirname, 'local-helper.js');
    
    // Spawn Node silently in background with no window
    helperProcess = spawn('node', [helperPath], {
        cwd: __dirname,
        env: { ...process.env },
        stdio: 'ignore', // Hides output/console window completely
        windowsHide: true // Hides the console window on Windows
    });

    helperProcess.on('error', (err) => {
        console.error('Failed to start helper process:', err);
    });
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

    // When closing, intercept and just hide the window (runs in tray)
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
                if (helperProcess) {
                    helperProcess.kill();
                }
                app.quit();
            } 
        }
    ]);

    tray.setToolTip('HashStock · Servidor Ativo');
    tray.setContextMenu(contextMenu);

    // Double click tray icon opens the window
    tray.on('double-click', () => {
        createWindow();
    });
}

app.whenReady().then(() => {
    startHelper();
    createTray();
    createWindow();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
