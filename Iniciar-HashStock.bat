@echo off
title HashStock Helper Server
echo ==============================================
echo  Iniciando o HashStock Local Helper Server...
echo ==============================================
echo.
cd /d "C:\\Users\\Felip\\.gemini\\antigravity\\scratch\\Estoque-main"
start /min cmd /c "npm run helper"
echo Servidor iniciado em segundo plano (minimizado).
echo Abrindo o app web no navegador...
start https://estoque-zeta-one.vercel.app/
timeout /t 2 >nul
exit
