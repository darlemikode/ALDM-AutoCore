@echo off
REM DEV local: API en :8000 (SQLite, backend\.env) + web en :5173
start "API DEV :8000" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"
start "WEB DEV :5173" cmd /k "cd /d %~dp0web-admin && set VITE_API_TARGET=http://localhost:8000&& npm run dev -- --port 5173"
