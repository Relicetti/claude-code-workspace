@echo off
setlocal
set PORT=5173
set PROJDIR=D:\OneDrive\Claude Code\calculadora-parceria

echo Encerrando servidor anterior na porta %PORT% (se houver)...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do (
    taskkill /F /PID %%p >nul 2>&1
)

cd /d "%PROJDIR%"
start "Calculadora de Parceria - Servidor" cmd /k npm run dev

echo Aguardando o servidor iniciar...
timeout /t 5 /nobreak >nul

start "" http://localhost:%PORT%
exit
