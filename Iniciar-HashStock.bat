@echo off
title HashStock Local Server & Dev App
echo ==============================================
echo  Iniciando o HashStock Local Helper & App...
echo ==============================================
echo.
cd /d "C:\Users\Felip\.gemini\antigravity\scratch\Estoque-main"
start /min cmd /c "npm run helper"
start /min cmd /c "npm run dev -- --host 0.0.0.0 --port 5173"
echo Servidores iniciados em segundo plano.
echo Abrindo o HashStock no navegador...
timeout /t 2 >nul
start http://localhost:5173/
exit
