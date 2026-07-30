@echo off
REM ===================================================================
REM  G-Shock - achar o relogio e mapear o protocolo (TUDO EM UM)
REM  Salve este arquivo e o gshock.py na MESMA pasta (ex: Area de
REM  Trabalho) e clique duas vezes AQUI.
REM ===================================================================
cd /d "%~dp0"
title G-Shock Viewer

where python >nul 2>nul && (set PY=python) || (set PY=py)
where %PY% >nul 2>nul || (
  echo.
  echo Python nao encontrado. Instale em https://www.python.org/downloads/
  echo e marque "Add Python to PATH" durante a instalacao.
  echo.
  pause
  exit /b
)

echo Instalando o necessario (so na primeira vez)...
%PY% -m pip install --quiet --upgrade pip
%PY% -m pip install --quiet bleak

echo.
%PY% "%~dp0status.py"
