#!/bin/bash
# Instala una sola vez el emulador de Android por línea de comandos (sin Android Studio). Descarga 2-3 GB.
source "$(dirname "$0")/_comun.sh"
requiere brew "Instala Homebrew desde https://brew.sh y vuelve a abrir este archivo."
echo "=== Instalando Java y las herramientas de Android ==="
brew install --cask temurin android-commandlinetools android-platform-tools || fallar "Falló la instalación con Homebrew."
IMAGEN="system-images;android-35;google_apis;arm64-v8a"
[ "$(uname -m)" = "arm64" ] || IMAGEN="system-images;android-35;google_apis;x86_64"
echo; echo "=== Descargando el emulador y la imagen de Android (te pedirá aceptar las licencias de Google) ==="
sdkmanager "platform-tools" "emulator" "platforms;android-35" "$IMAGEN" || fallar "Falló sdkmanager."
ruta_android || fallar "No se encontró el emulador después de instalarlo."
if emulator -list-avds 2>/dev/null | grep -qx aldm; then
  echo "El dispositivo virtual 'aldm' ya existe."
else
  echo; echo "=== Creando el dispositivo virtual 'aldm' (Pixel 7) ==="
  echo no | avdmanager create avd -n aldm -k "$IMAGEN" -d pixel_7 || fallar "No se pudo crear el dispositivo virtual."
fi
echo; echo "Listo. Ya puedes usar el botón Android del panel."
pausar
