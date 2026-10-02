@echo off
rem ATOM Canvas - launcher Windows.
rem Cria .venv na primeira execucao, instala dependencias e abre o navegador.
setlocal
cd /d "%~dp0"
set "SCRIPT=%~1"
if "%SCRIPT%"=="" set "SCRIPT=server.py --open"
set "VPY=.venv\Scripts\python.exe"

if exist "%VPY%" goto deps

set "PY="
where py >nul 2>nul && py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY python --version >nul 2>nul && set "PY=python"
if not defined PY goto nopython

echo Criando ambiente virtual .venv ...
%PY% -m venv .venv || goto fail

:deps
rem Reinstala se faltar algo (ex.: instalacao anterior interrompida).
"%VPY%" -c "import aiohttp, winpty" >nul 2>nul && goto run
echo Instalando dependencias (pode levar um minuto)...
"%VPY%" -m pip install -q --upgrade pip
"%VPY%" -m pip install -q -r requirements.txt || goto fail

:run
"%VPY%" %SCRIPT%
if errorlevel 1 goto fail
exit /b 0

:nopython
echo.
echo   Python 3 nao encontrado. Instale em https://www.python.org/downloads/
echo   (marque "Add python.exe to PATH" na instalacao) e rode de novo.
echo.
pause
exit /b 1

:fail
echo.
echo   O ATOM Canvas nao iniciou. Veja a mensagem acima.
echo.
pause
exit /b 1
