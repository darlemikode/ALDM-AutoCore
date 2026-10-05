<<<<<<< Updated upstream
@echo off
REM DEV 100% local: API :8000 (SQLite, backend\.env) + web :5173. Nada de la nube.
cd /d %~dp0
if not exist backend\venv (
  echo Creando entorno Python...
  python -m venv backend\venv
)
echo Instalando dependencias del backend...
call backend\venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt
if not exist web-admin\node_modules (
  echo Instalando dependencias de la web...
  pushd web-admin
  call npm install
  popd
)
start "API DEV :8000" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
start "WEB DEV :5173" cmd /k "cd /d %~dp0web-admin && set VITE_API_TARGET=http://localhost:8000&& npm run dev -- --port 5173"
timeout /t 8 >nul
start http://localhost:5173
echo Usuario: admin   Contrasena: admin1234
pause
=======
@echo off
REM DEV 100% local: API :8000 (SQLite, backend\.env) + web :5173. Nada de la nube.
cd /d %~dp0
if not exist backend\venv (
  echo Creando entorno Python...
  python -m venv backend\venv
)
echo Instalando dependencias del backend...
call backend\venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt
if not exist web-admin\node_modules (
  echo Instalando dependencias de la web...
  pushd web-admin
  call npm install
  popd
)
start "API DEV :8000" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
start "WEB DEV :5173" cmd /k "cd /d %~dp0web-admin && set VITE_API_TARGET=http://localhost:8000&& npm run dev -- --port 5173"
timeout /t 8 >nul
start http://localhost:5173
echo Usuario: admin   Contrasena: admin1234
pause
>>>>>>> Stashed changes
