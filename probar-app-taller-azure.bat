@echo off
title App Taller - AZURE (produccion)
chcp 65001 >nul
cd /d "%~dp0mobile"
if errorlevel 1 (echo No se encontro la carpeta mobile & pause & exit /b 1)
if not exist node_modules (
  echo === Instalando dependencias ===
  call npm install --legacy-peer-deps
  if errorlevel 1 (echo Fallo npm install & pause & exit /b 1)
)
echo.
echo === AZURE: la app usara la API y la base de datos de PRODUCCION. Cuidado con lo que guardes ===
echo Escanea el QR con Expo Go; presiona r para recargar.
echo.
set API_URL=
call npx expo start --clear
pause
