@echo off
title App Super Admin - DEV LOCAL (tu PC, sin Azure)
chcp 65001 >nul
cd /d "%~dp0mobile-superadmin"
if errorlevel 1 (echo No se encontro la carpeta mobile-superadmin & pause & exit /b 1)
if not exist node_modules (
  echo === Instalando dependencias ===
  call npm install --legacy-peer-deps
  if errorlevel 1 (echo Fallo npm install & pause & exit /b 1)
)
set IP=
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up'} | Select-Object -First 1).IPv4Address.IPAddress"`) do set IP=%%i
if "%IP%"=="" set /p IP=No pude detectar tu IP. Escribela (ej. 192.168.1.50):
set API_URL=http://%IP%:8000/api
set WS_URL=ws://%IP%:8000
echo.
echo === DEV LOCAL: la app usara %API_URL% (backend de tu PC, nada de Azure) ===
echo Antes ejecuta correr-dev.bat para tener el backend en el puerto 8000.
echo Celular y PC en la misma wifi. Escanea el QR con Expo Go; presiona r para recargar.
echo.
call npx expo start --clear
pause
