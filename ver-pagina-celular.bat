@echo off
REM Ver la PAGINA DE PUBLICIDAD (sitio-web) desde el CELULAR.
REM Levanta la pagina en tu PC y la publica con un tunel temporal de Cloudflare:
REM te da un enlace https://xxxx.trycloudflare.com que abres en el celular (wifi o datos).
REM No toca Azure. Al cerrar esta ventana el enlace deja de funcionar.
cd /d %~dp0
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo Instalando cloudflared ^(una sola vez^)...
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  echo.
  echo Cierra esta ventana y vuelve a abrir este .bat para que reconozca cloudflared.
  pause
  exit /b
)
set PY=
if exist "%~dp0backend\venv\Scripts\python.exe" set PY="%~dp0backend\venv\Scripts\python.exe"
if not defined PY (
  where python >nul 2>&1 && set PY=python
)
if not defined PY (
  echo No se encontro Python. Instala Python o crea backend\venv con correr-dev.bat.
  pause
  exit /b
)
start "PAGINA :8080" /min cmd /c "cd /d %~dp0sitio-web && %PY% -m http.server 8080 --bind 127.0.0.1"
timeout /t 3 >nul
echo.
echo ============================================================
echo  Busca abajo la linea con  https://xxxx.trycloudflare.com
echo  y abre ese enlace en el navegador de tu celular.
echo  Tip: para ver otra vez la animacion usa una pestana de incognito.
echo  Cierra esta ventana para apagar el enlace.
echo ============================================================
echo.
cloudflared tunnel --url http://localhost:8080
taskkill /fi "WINDOWTITLE eq PAGINA :8080*" /f >nul 2>&1
pause
