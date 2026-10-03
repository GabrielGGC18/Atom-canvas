@echo off
rem ATOM Canvas - launcher Windows.
rem Cria .venv na primeira execucao, instala dependencias e abre o navegador.
setlocal EnableExtensions
cd /d "%~dp0"
set "SCRIPT=%~1"
if "%SCRIPT%"=="" set "SCRIPT=server.py --open"
set "VPY=.venv\Scripts\python.exe"
set "CHECK=import aiohttp, winpty"
if /i "%SCRIPT%"=="desktop.py" set "CHECK=import aiohttp, winpty, webview"

if exist "%VPY%" goto deps

rem Procura o Python: PATH (py / python) e, se nao estiver no PATH, os locais
rem padrao do instalador oficial (por usuario e para todos os usuarios).
set "PY="
where py >nul 2>nul && py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && python --version >nul 2>nul && set "PY=python"
if not defined PY call :try "%LOCALAPPDATA%\Programs\Python\Launcher\py.exe" -3
if not defined PY call :try "%SystemRoot%\py.exe" -3
if not defined PY for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do call :try "%%~fD\python.exe"
if not defined PY for /d %%D in ("%ProgramFiles%\Python3*") do call :try "%%~fD\python.exe"
if not defined PY goto nopython

echo Criando ambiente virtual .venv com %PY% ...
%PY% -m venv .venv || goto fail

:deps
rem Reinstala se faltar algo (ex.: instalacao anterior interrompida).
"%VPY%" -c "%CHECK%" >nul 2>nul && goto run
echo Instalando dependencias (pode levar um minuto)...
"%VPY%" -m pip install -q --upgrade pip
"%VPY%" -m pip install -q -r requirements.txt || goto fail

:run
"%VPY%" %SCRIPT%
if errorlevel 1 goto fail
exit /b 0

rem :try <exe> [args] - usa o candidato se existir e rodar Python 3.10+.
:try
if defined PY exit /b 0
if not exist "%~1" exit /b 0
"%~1" %2 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>nul || exit /b 0
set PY="%~1" %2
exit /b 0

:nopython
echo.
echo   Python 3.10+ nao encontrado. Instale em https://www.python.org/downloads/
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
