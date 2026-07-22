const winstaller = require('electron-winstaller');
const path = require('path');

console.log("Compilando instalador HashStock-Setup.exe...");

winstaller.createWindowsInstaller({
    appDirectory: path.join(__dirname, 'dist', 'HashStock-win32-x64'),
    outputDirectory: path.join(__dirname, 'dist', 'installer'),
    authors: 'HashStock',
    exe: 'HashStock.exe',
    setupExe: 'HashStock-Setup.exe',
    setupIcon: path.join(__dirname, 'icon.ico'),
    noMsi: true,
    title: 'HashStock Installer'
}).then(() => {
    console.log("SUCESSO: Instalador compilado na pasta: desktop/dist/installer/HashStock-Setup.exe");
}).catch((err) => {
    console.error("ERRO ao criar instalador:", err.message);
});
