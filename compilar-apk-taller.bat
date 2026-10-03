@echo off
chcp 65001 >nul
title Compilar APK Taller - ALDM AutoCore
cd /d "%~dp0mobile"
if errorlevel 1 (echo No se encontro la carpeta mobile & pause & exit /b 1)
echo === Instalando dependencias ===
call npm install --legacy-peer-deps
if errorlevel 1 (echo Fallo npm install & pause & exit /b 1)
echo.
echo === Compilando APK del taller (10-20 min en la nube de Expo) ===
set EAS_NO_VCS=1
call eas build -p android --profile preview
echo.
echo Listo. Descarga el APK desde el enlace de arriba o en expo.dev ^> Builds.
pause
