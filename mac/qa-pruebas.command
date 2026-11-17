#!/bin/bash
# Corre las pruebas integrales y multitaller contra el servidor QA (puerto 8001, copia de la base).
source "$(dirname "$0")/_comun.sh"
lsof -nP -iTCP:8001 -sTCP:LISTEN -t >/dev/null 2>&1 || fallar "El servidor QA no está encendido. Enciéndelo en el panel (pestaña QA) y vuelve a intentar."
read -r -s -p "Contraseña de admin en la copia QA [admin1234]: " CLAVE; echo
CLAVE="${CLAVE:-admin1234}"
cd backend || exit 1
echo; echo "=== Pruebas integrales ==="
venv/bin/python tests/pruebas_integrales.py --usuario admin --password "$CLAVE"
echo; echo "=== Pruebas multitaller ==="
venv/bin/python tests/pruebas_multitaller.py --usuario admin --password "$CLAVE"
pausar
