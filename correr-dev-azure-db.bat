@echo off
REM DESARROLLO local (API :8000 + web :5173) conectado a la BASE DE AZURE (backend\.env.azure).
REM Cuidado: son los datos reales. Para datos de prueba usa correr-dev.bat (SQLite local).
cd /d %~dp0
call backend\venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt
if not exist web-admin\node_modules (
  pushd web-admin
  call npm install
  popd
)
echo La base de Azure puede tardar ~1 minuto en despertar la primera vez.
start "API DEV-AZURE :8000" cmd /k "cd /d %~dp0backend && set ENV_FILE=.env.azure&& venv\Scripts\activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
start "WEB DEV :5173" cmd /k "cd /d %~dp0web-admin && set VITE_API_TARGET=http://localhost:8000&& npm run dev -- --port 5173"
timeout /t 10 >nul
start http://localhost:5173
pause
