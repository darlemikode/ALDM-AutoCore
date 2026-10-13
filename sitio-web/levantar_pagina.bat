@echo off
setlocal
cd /d "%~dp0"

set PUERTO=8080

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo No se encontro Python instalado. Instalalo desde https://www.python.org/downloads/ y vuelve a intentar.
    pause
    exit /b 1
)

echo Levantando sitio-web en http://localhost:%PUERTO%
start "" http://localhost:%PUERTO%
python -m http.server %PUERTO%

pause
