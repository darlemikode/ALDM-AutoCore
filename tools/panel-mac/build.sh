#!/bin/bash
# Compila el panel y arma "ALDM Panel.app" (barra de menú, sin ícono en el Dock).
set -e
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v swift >/dev/null || { echo "Falta Swift. Instala las herramientas con:  xcode-select --install"; exit 1; }
swift build -c release
BIN="$(swift build -c release --show-bin-path)/PanelALDM"
APP="ALDM Panel.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/PanelALDM"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>ALDM Panel</string>
  <key>CFBundleIdentifier</key><string>com.aldm.panel</string>
  <key>CFBundleExecutable</key><string>PanelALDM</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --sign - "$APP" >/dev/null 2>&1 || true
echo
echo "Listo: $(pwd)/$APP"
echo "Ábrelo con:  open \"$(pwd)/$APP\"   (aparece en la barra de menú, arriba a la derecha)"
