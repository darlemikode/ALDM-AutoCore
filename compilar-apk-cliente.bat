@echo off
chcp 65001 >nul
title Compilar APK de Clientes - ALDM AutoCore
cd /d "%~dp0mobile-cliente"
if errorlevel 1 (echo No se encontro la carpeta mobile-cliente & pause & exit /b 1)
echo === Instalando dependencias (puede tardar un momento) ===
call npm install --legacy-peer-deps
if errorlevel 1 (echo Fallo npm install & pause & exit /b 1)
echo.
echo === Compilando APK de Clientes (10-20 min en la nube de Expo) ===
set EAS_NO_VCS=1
set EAS_SKIP_AUTO_FINGERPRINT=1
call eas build -p android --profile preview
echo.
echo Listo. Descarga el APK desde el enlace de arriba o en expo.dev ^> Builds.
pause
