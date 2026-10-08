@echo off
chcp 65001 >nul
title Compilar APK Superadmin DEV - ALDM AutoCore
cd /d "%~dp0mobile-superadmin"
if errorlevel 1 (echo No se encontro la carpeta mobile-superadmin & pause & exit /b 1)
echo === Instalando dependencias (puede tardar un momento) ===
call npm install --legacy-peer-deps
if errorlevel 1 (echo Fallo npm install & pause & exit /b 1)
set IP=
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up'} | Select-Object -First 1).IPv4Address.IPAddress"`) do set IP=%%i
if "%IP%"=="" set /p IP=No pude detectar tu IP. Escribela (ej. 192.168.1.50):
echo {"apiUrl":"http://%IP%:8000/api","wsUrl":"ws://%IP%:8000"}> api-dev.json
echo.
echo === APK DEV: apuntara a http://%IP%:8000/api (backend de tu PC, nada de Azure) ===
echo Solo funciona con el celular en la misma wifi y correr-dev.bat encendido.
echo Instalar este APK reemplaza al de Azure (misma app); para volver a Azure compila con compilar-apk-superadmin.bat
echo === Compilando (10-20 min en la nube de Expo) ===
set EAS_NO_VCS=1
set EAS_SKIP_AUTO_FINGERPRINT=1
call eas build -p android --profile dev
del api-dev.json >nul 2>&1
echo.
echo Listo. Descarga el APK desde el enlace de arriba o en expo.dev ^> Builds.
pause
