#!/bin/bash
# Instala una sola vez lo necesario para compilar APK en esta Mac, sin Expo/EAS: Java 17 y el SDK de Android.
source "$(dirname "$0")/_comun.sh"
requiere brew "Instala Homebrew desde https://brew.sh y vuelve a abrir este archivo."
echo "=== Instalando Java 17 y las herramientas de Android ==="
brew install --cask temurin@17 android-commandlinetools android-platform-tools || fallar "Falló la instalación con Homebrew."
ruta_android || { echo "(Falta el emulador: se instalará ahora)"; sdkmanager "emulator" >/dev/null 2>&1; ruta_android; }
ruta_android || fallar "No se encontró el SDK de Android."
preparar_java
echo; echo "=== Aceptando licencias de Android ==="
yes | sdkmanager --licenses >/dev/null 2>&1
sdkmanager "platform-tools" "build-tools;35.0.0" "platforms;android-35" || fallar "Falló sdkmanager."
echo; echo "Listo. El primer APK descargará piezas adicionales automáticamente."
pausar
