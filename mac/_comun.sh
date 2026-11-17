#!/bin/bash
# Funciones compartidas de los .command de Mac (equivalentes a los .bat de Windows).
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"   # Homebrew en Apple Silicon e Intel

pausar() { echo; read -n 1 -s -r -p "Presiona una tecla para cerrar..."; echo; }
fallar() { echo; echo "ERROR: $1"; pausar; exit 1; }
requiere() { command -v "$1" >/dev/null 2>&1 || fallar "Falta '$1'. $2"; }

ip_local() { ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true; }
pedir_ip() {
  IP="$(ip_local)"
  if [ -z "$IP" ]; then read -r -p "No pude detectar tu IP. Escríbela (ej. 192.168.1.50): " IP; fi
}

# Python >= 3.10 (el backend usa sintaxis nueva). 3.12 primero: es la que tiene paquetes ya compilados.
buscar_python() {
  PY=""
  for p in python3.12 python3.11 python3.10 python3.13 python3; do
    if command -v "$p" >/dev/null 2>&1 && "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then PY="$p"; return; fi
  done
  fallar "Necesitas Python 3.10 o mayor. Instala Homebrew (https://brew.sh) y luego:  brew install python@3.12"
}

preparar_backend() {
  buscar_python
  if [ ! -d backend/venv ]; then echo "Creando entorno Python ($PY)..."; "$PY" -m venv backend/venv || fallar "No se pudo crear el entorno Python."; fi
  if [ ! -f backend/.env ] && [ -f backend/.env.example ]; then
    cp backend/.env.example backend/.env
    echo "Se creó backend/.env desde .env.example (valores de desarrollo)."
  fi
  echo "Instalando dependencias del backend..."
  if ! backend/venv/bin/python -m pip install -q -r backend/requirements.txt; then
    echo "Falló la instalación completa; reintentando sin pyodbc (solo hace falta para SQL Server/Azure)..."
    grep -iv '^pyodbc' backend/requirements.txt > backend/venv/requirements-sin-pyodbc.txt
    backend/venv/bin/python -m pip install -q -r backend/venv/requirements-sin-pyodbc.txt || fallar "No se pudieron instalar las dependencias del backend."
  fi
}

preparar_node() {  # preparar_node <carpeta> [flags de npm]
  requiere node "Instala Node con:  brew install node"
  if [ ! -d "$1/node_modules" ]; then echo "Instalando dependencias de $1..."; (cd "$1" && npm install $2) || fallar "Falló npm install en $1."; fi
}

PIDS=()
apagar() { for p in "${PIDS[@]}"; do pkill -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; done; }

# levantar_dev <host> [archivo .env]  -> API :8000 + WEB :5173 (Ctrl+C apaga todo)
levantar_dev() {
  local host="$1" envf="$2"
  trap apagar EXIT INT TERM
  ( cd backend && ENV_FILE="$envf" exec venv/bin/python -m uvicorn app.main:app --reload --host "$host" --port 8000 ) &
  PIDS+=($!)
  ( sleep 8; open http://localhost:5173 ) &
  echo "API en :8000 y web en :5173. Ctrl+C para apagar los dos."
  ( cd web-admin && VITE_API_TARGET=http://localhost:8000 exec npm run dev -- --port 5173 )
}

# probar_app <carpeta> <dev|azure> [ios]   (con "ios" abre el simulador de iPhone; requiere Xcode)
probar_app() {
  local carpeta="$1" modo="$2" destino="$3"
  if [ "$destino" = "ios" ]; then
    xcrun simctl help >/dev/null 2>&1 || fallar "Para el simulador de iPhone instala Xcode desde la App Store, ábrelo una vez y acepta la licencia."
  fi
  [ -d "$carpeta" ] || fallar "No se encontró la carpeta $carpeta"
  preparar_node "$carpeta" "--legacy-peer-deps"
  cd "$carpeta" || exit 1
  if [ "$modo" = "dev" ]; then
    if [ "$destino" = "ios" ]; then IP="localhost"; else pedir_ip; fi
    export API_URL="http://$IP:8000/api" WS_URL="ws://$IP:8000"
    echo; echo "=== DEV LOCAL: la app usará $API_URL (backend de tu Mac, nada de Azure) ==="
    echo "Antes ejecuta correr-dev.command para tener el backend en el puerto 8000."
  else
    unset API_URL WS_URL
    echo; echo "=== AZURE: la app usará la API y la base de PRODUCCIÓN. Cuidado con lo que guardes ==="
  fi
  if [ "$destino" = "ios" ]; then
    echo "Abriendo en el simulador de iPhone (la primera vez instala Expo Go en el simulador)."; echo
    npx expo start --clear --ios
  else
    echo "Celular y Mac en la misma wifi. Escanea el QR con Expo Go; presiona r para recargar."; echo
    npx expo start --clear
  fi
  pausar
}

# compilar_apk_eas <carpeta> <dev|prod>  (alternativa en la nube de Expo; ya no la usa el panel)
compilar_apk_eas() {
  local carpeta="$1" modo="$2"
  [ -d "$carpeta" ] || fallar "No se encontró la carpeta $carpeta"
  requiere node "Instala Node con:  brew install node"
  cd "$carpeta" || exit 1
  echo "=== Instalando dependencias ==="
  npm install --legacy-peer-deps || fallar "Falló npm install."
  local EAS="eas"; command -v eas >/dev/null 2>&1 || EAS="npx --yes eas-cli"
  export EAS_NO_VCS=1 EAS_SKIP_AUTO_FINGERPRINT=1
  if [ "$modo" = "dev" ]; then
    pedir_ip
    echo "{\"apiUrl\":\"http://$IP:8000/api\",\"wsUrl\":\"ws://$IP:8000\"}" > api-dev.json
    echo "=== APK DEV: apuntará a http://$IP:8000/api (backend de tu Mac). Solo funciona en la misma wifi con correr-dev.command encendido ==="
    echo "=== Compilando (10-20 min en la nube de Expo) ==="
    $EAS build -p android --profile dev
    rm -f api-dev.json
  else
    echo "=== Compilando APK (10-20 min en la nube de Expo) ==="
    $EAS build -p android --profile preview
  fi
  echo; echo "Listo. Descarga el APK desde el enlace de arriba o en expo.dev > Builds."
  pausar
}

asegurar_cloudflared() {
  command -v cloudflared >/dev/null 2>&1 && return
  requiere brew "Instala Homebrew desde https://brew.sh y vuelve a abrir este archivo."
  echo "Instalando cloudflared (una sola vez)..."
  brew install cloudflared || fallar "No se pudo instalar cloudflared."
}

servir_sitio() {  # sirve sitio-web en :8080 (segundo plano)
  buscar_python
  ( cd sitio-web && exec "$PY" -m http.server 8080 --bind 127.0.0.1 ) >/dev/null 2>&1 &
  PIDS+=($!)
}

# ---------- Emulador de Android (sin Android Studio) ----------
ruta_android() {
  local sdk
  for sdk in "$ANDROID_HOME" /opt/homebrew/share/android-commandlinetools /usr/local/share/android-commandlinetools "$HOME/Library/Android/sdk"; do
    if [ -n "$sdk" ] && [ -x "$sdk/emulator/emulator" ]; then ANDROID_SDK="$sdk"; break; fi
  done
  [ -n "$ANDROID_SDK" ] || return 1
  export ANDROID_HOME="$ANDROID_SDK" ANDROID_SDK_ROOT="$ANDROID_SDK"
  export PATH="$ANDROID_SDK/emulator:$ANDROID_SDK/platform-tools:$ANDROID_SDK/cmdline-tools/latest/bin:$PATH"
}

# encender_emulador -> deja un emulador encendido y listo (usa uno ya abierto o un celular conectado si lo hay)
encender_emulador() {
  ruta_android || fallar "Falta el emulador de Android. Instálalo una vez abriendo mac/instalar-emulador-android.command"
  command -v adb >/dev/null 2>&1 || fallar "Falta adb. Abre mac/instalar-emulador-android.command"
  if ! adb devices | grep -qw device; then
    # Se prefiere el dispositivo "aldm" (lo crea instalar-emulador-android.command); otros pueden venir de
    # Android Studio y no tener su imagen de sistema en este SDK.
    local AVD LISTA; LISTA="$(emulator -list-avds 2>/dev/null | grep -v '^INFO')"
    if echo "$LISTA" | grep -qx aldm; then AVD="aldm"; else AVD="$(echo "$LISTA" | head -1)"; fi
    [ -n "$AVD" ] || fallar "No hay ningún dispositivo virtual. Abre mac/instalar-emulador-android.command"
    local LOG="$HOME/Library/Logs/PanelALDM/emulador.log"; mkdir -p "$(dirname "$LOG")"
    # El teclado de la Mac escribe directo en el emulador (hw.keyboard=yes), sin teclado en pantalla.
    local CFG="$HOME/.android/avd/$AVD.avd/config.ini"
    if [ -f "$CFG" ]; then
      if grep -q '^hw.keyboard=' "$CFG"; then sed -i '' 's/^hw.keyboard=.*/hw.keyboard=yes/' "$CFG"; else echo 'hw.keyboard=yes' >> "$CFG"; fi
    fi
    echo "Encendiendo el emulador ($AVD)..."
    nohup emulator -avd "$AVD" >"$LOG" 2>&1 &
    local PID=$!
    disown
    local i=0
    until adb devices | grep -qw device; do
      if ! kill -0 "$PID" 2>/dev/null; then
        echo; tail -8 "$LOG"
        fallar "El emulador '$AVD' no pudo encender (detalle arriba). Si no es 'aldm', abre mac/instalar-emulador-android.command para crear uno que sí funcione."
      fi
      sleep 2; i=$((i+1)); [ $i -gt 90 ] && fallar "El emulador tardó demasiado en aparecer. Revisa $LOG"
    done
  fi
  echo "Esperando a que Android termine de arrancar..."
  local n=0
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    sleep 2; n=$((n+1)); [ $n -gt 150 ] && fallar "El emulador tardó demasiado en arrancar."
  done
  # No mostrar el teclado en pantalla cuando se escribe con el teclado de la Mac
  adb shell settings put secure show_ime_with_hard_keyboard 0 >/dev/null 2>&1
}

# emular_android <carpeta> <dev|prod> -> enciende el emulador e instala el último APK compilado en EAS de esa app
emular_android() {
  local carpeta="$1" modo="$2" perfil="preview"
  [ "$modo" = "dev" ] && perfil="dev"
  [ -d "$carpeta" ] || fallar "No se encontró la carpeta $carpeta"
  requiere node "Instala Node con:  brew install node"
  encender_emulador
  cd "$carpeta" || exit 1
  local EAS="eas"; command -v eas >/dev/null 2>&1 || EAS="npx --yes eas-cli"
  export EAS_NO_VCS=1
  echo "Buscando el último APK ($perfil) compilado en Expo..."
  local URL
  URL="$($EAS build:list --platform android --build-profile "$perfil" --status finished --limit 1 --json --non-interactive 2>/dev/null \
        | python3 -c 'import json,sys; d=json.load(sys.stdin); a=(d[0].get("artifacts") or {}) if d else {}; print(a.get("applicationArchiveUrl") or a.get("buildUrl") or "")' 2>/dev/null)"
  [ -n "$URL" ] || fallar "No encontré un APK ($perfil) terminado de esta app. Compílalo primero con el botón APK (y revisa que tengas sesión: npx eas-cli login)."
  local CACHE="$HOME/Library/Caches/PanelALDM"; mkdir -p "$CACHE"
  local APK="$CACHE/$(basename "$carpeta")-$perfil-$(basename "${URL%%\?*}")"
  if [ ! -s "$APK" ]; then
    echo "Descargando el APK..."
    curl -fL --progress-bar -o "$APK" "$URL" || { rm -f "$APK"; fallar "No se pudo descargar el APK."; }
  fi
  echo "Instalando en el emulador..."
  adb install -r "$APK" || fallar "No se pudo instalar el APK."
  local PKG
  PKG="$(python3 -c 'import json; print(json.load(open("app.json"))["expo"]["android"]["package"])' 2>/dev/null)"
  if [ -n "$PKG" ]; then adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; fi
  echo; echo "Listo: la app quedó instalada en el emulador."
  [ "$modo" = "dev" ] && echo "Este APK usa la API de tu Mac: enciende la API en el panel (pestaña Dev)."
  pausar
}

# ---------- Compilación local (sin Expo/EAS): Java + Android SDK en esta Mac ----------
preparar_java() {
  local j
  for j in "$(/usr/libexec/java_home -v 17 2>/dev/null)" /opt/homebrew/opt/openjdk@17 /Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home; do
    if [ -n "$j" ] && [ -x "$j/bin/java" ]; then export JAVA_HOME="$j"; export PATH="$JAVA_HOME/bin:$PATH"; return 0; fi
  done
  fallar "Falta Java 17. Abre una vez mac/instalar-android-local.command"
}

preparar_android_local() {
  ruta_android || fallar "Falta el SDK de Android. Abre una vez mac/instalar-android-local.command"
  preparar_java
  requiere node "Instala Node con:  brew install node"
}

# Prepara la carpeta de la app: dependencias, proyecto nativo (si no existe) y variables de la API.
# <modo>: dev = API de esta Mac (IP de tu wifi, para celulares reales) | emu = API de esta Mac vista desde el emulador | prod = Azure
preparar_app_local() {
  local carpeta="$1" modo="$2"
  [ -d "$carpeta" ] || fallar "No se encontró la carpeta $carpeta"
  preparar_android_local
  preparar_node "$carpeta" "--legacy-peer-deps"
  cd "$carpeta" || exit 1
  if [ ! -d android ]; then
    echo "Generando el proyecto nativo de Android (una sola vez)..."
    npx expo prebuild --platform android --no-install || fallar "Falló expo prebuild."
  fi
  chmod +x android/gradlew 2>/dev/null   # el proyecto viene de Windows: sin este permiso Gradle no arranca (EACCES)
  echo "sdk.dir=$ANDROID_SDK" > android/local.properties
  unset API_URL WS_URL
  case "$modo" in
    dev) pedir_ip; export API_URL="http://$IP:8000/api" WS_URL="ws://$IP:8000"
         echo "=== API de tu Mac: $API_URL (celular y Mac en la misma wifi, con la API encendida) ===" ;;
    emu) export API_URL="http://10.0.2.2:8000/api" WS_URL="ws://10.0.2.2:8000"
         echo "=== API de tu Mac vista desde el emulador: $API_URL ===" ;;
    *)   echo "=== API de PRODUCCIÓN (Azure) ===" ;;
  esac
}

APK_SALIDA="android/app/build/outputs/apk/release/app-release.apk"

# apk_local <carpeta> <dev|prod> -> compila el APK en esta Mac y lo deja en Descargas
apk_local() {
  local carpeta="$1" modo="$2"
  preparar_app_local "$carpeta" "$modo"
  echo "Compilando el APK en esta Mac (la primera vez descarga piezas de Android y tarda 10-20 min; después, 1-3 min)..."
  ( cd android && ./gradlew assembleRelease --no-daemon -q ) || fallar "Falló la compilación (revisa el detalle de arriba)."
  [ -f "$APK_SALIDA" ] || fallar "No se generó el APK."
  local DEST="$HOME/Downloads/ALDM-$(basename "$carpeta")-$modo.apk"
  cp "$APK_SALIDA" "$DEST"
  echo; echo "Listo: $DEST"
  open -R "$DEST"
  pausar
}

# android_vivo <carpeta> -> emulador + app instalada + cambios de código en tiempo real (Metro). Ctrl+C para terminar.
android_vivo() {
  local carpeta="$1"
  preparar_app_local "$carpeta" emu
  encender_emulador
  echo "Compilando e instalando la app en el emulador (la primera vez tarda varios minutos)..."
  echo "Cuando abra, guarda cualquier archivo de $carpeta/src y se actualiza solo en el emulador."
  echo "Para recargar a mano: presiona r aquí. Para terminar: Ctrl+C."; echo
  local SERIE NOMBRE
  SERIE="$(adb devices | awk '/emulator-/{print $1; exit}')"
  # Expo identifica el emulador por el nombre de su dispositivo virtual (p. ej. aldm), no por el serial de adb
  NOMBRE="$(adb -s "$SERIE" emu avd name 2>/dev/null | head -1 | tr -d '\r')"
  npx expo run:android ${NOMBRE:+--device "$NOMBRE"}
  pausar
}

# instalar_apk_emulador <carpeta> <dev|prod> -> instala en el emulador el APK compilado localmente (lo compila si falta)
instalar_apk_emulador() {
  local carpeta="$1" modo="$2" DEST="$HOME/Downloads/ALDM-$(basename "$1")-$2.apk"
  if [ ! -f "$DEST" ]; then
    echo "Aún no hay APK ($modo) de esta app; se compila primero."
    ( apk_local "$carpeta" "$modo" ) || exit 1
    cd "$RAIZ" || exit 1
  fi
  preparar_android_local
  encender_emulador
  echo "Instalando $DEST en el emulador..."
  adb install -r "$DEST" || fallar "No se pudo instalar el APK."
  cd "$RAIZ/$carpeta" 2>/dev/null || true
  local PKG; PKG="$(python3 -c 'import json; print(json.load(open("app.json"))["expo"]["android"]["package"])' 2>/dev/null)"
  [ -n "$PKG" ] && adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  echo; echo "Listo: la app quedó instalada en el emulador."
  pausar
}
