@echo off
REM Cria o atalho "G-Shock Viewer" na Area de Trabalho, com icone.
REM Clique duas vezes neste arquivo UMA vez.
setlocal
set "PASTA=%~dp0"
if "%PASTA:~-1%"=="\" set "PASTA=%PASTA:~0,-1%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut((Join-Path $d 'G-Shock Viewer.lnk')); $s.TargetPath=(Join-Path '%PASTA%' 'rodar-no-windows.bat'); $s.WorkingDirectory='%PASTA%'; $s.IconLocation=(Join-Path '%PASTA%' 'icon.ico'); $s.Description='Le os dados do Casio GBD-H2000'; $s.Save(); Write-Host ('Atalho criado em: ' + $d)"

echo.
echo Pronto! Procure o atalho "G-Shock Viewer" na sua Area de Trabalho.
echo.
pause
