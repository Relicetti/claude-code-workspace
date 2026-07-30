@echo off
REM ===================================================================
REM  G-Shock Viewer - atalho pra Windows (clique duas vezes)
REM  Instala tudo, acha o relogio e mapeia o protocolo automaticamente.
REM ===================================================================
setlocal
cd /d "%~dp0bridge"

echo.
echo === G-Shock Viewer ===
echo.

REM Descobre se e "python" ou "py"
where python >nul 2>nul && (set PY=python) || (set PY=py)

if not exist ".venv\" (
  echo [1/3] Preparando o ambiente (so na primeira vez)...
  %PY% -m venv .venv
)
call .venv\Scripts\activate.bat

echo [2/3] Instalando o necessario...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt

echo.
echo [3/3] Procurando o relogio...
echo Deixe o relogio em modo CONNECT (procurar smartphone).
echo.
python scan.py > "%TEMP%\gshock_scan.txt"
type "%TEMP%\gshock_scan.txt"

REM Pega o endereco da linha "ADDR=..." que o scan.py imprime
set ADDR=
for /f "tokens=2 delims==" %%a in ('findstr /b /c:"ADDR=" "%TEMP%\gshock_scan.txt" 2^>nul') do set ADDR=%%a
set ADDR=%ADDR: =%

if "%ADDR%"=="" (
  echo.
  echo Nao consegui identificar o relogio automaticamente.
  echo Olhe a lista acima, copie o ENDERECO do CASIO GBD-H2000 e cole aqui:
  set /p ADDR="ENDERECO: "
)

echo.
echo === Mapeando o protocolo (90s) ===
echo AGORA MEXA NO RELOGIO: modo batimentos, de passos, inicie/pare uma atividade.
echo.
python recon.py --address %ADDR%

echo.
echo ===================================================================
echo  Pronto! O resultado foi salvo em: bridge\logs\
echo  Abra o arquivo recon-*.log mais recente e mande o conteudo pro chat.
echo ===================================================================
echo.
pause
