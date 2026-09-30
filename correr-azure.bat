@echo off
REM Local contra Azure SQL: API en :8001 (backend\.env.azure) + web en :5174
start "API AZURE :8001" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && set ENV_FILE=.env.azure&& uvicorn app.main:app --port 8001"
start "WEB AZURE :5174" cmd /k "cd /d %~dp0web-admin && set VITE_API_TARGET=http://localhost:8001&& npm run dev -- --port 5174"
