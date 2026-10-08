@echo off
REM Prueba REMOTA de la web (otro equipo / otra red). Todo corre en TU PC con la base local (SQLite).
REM Un tunel gratuito de Cloudflare publica solo la web :5173 (que ya reenvia /api al backend local).
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
if not exist backend\venv (
  python -m venv backend\venv
)
call backend\venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt
if not exist web-admin\node_modules (
  pushd web-admin
  call npm install
  popd
)
start "API DEV :8000" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
start "WEB DEV :5173" cmd /k "cd /d %~dp0web-admin && set VITE_API_TARGET=http://localhost:8000&& npm run dev -- --port 5173"
timeout /t 8 >nul
echo.
echo Busca abajo el enlace https://xxxx.trycloudflare.com y abrelo en el otro equipo.
echo Usuario: admin   Contrasena: admin1234  ^(cambiala: el enlace es publico mientras este abierto^)
echo.
cloudflared tunnel --url http://localhost:5173
pause
