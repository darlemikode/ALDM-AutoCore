#!/bin/bash
source "$(dirname "$0")/_comun.sh"
[ -f backend/.env.azure ] || fallar "No existe backend/.env.azure (la conexión a la base de Azure; no se sube a git). Cópialo desde tu otra computadora."
preparar_backend
backend/venv/bin/python -c "import pyodbc" 2>/dev/null || fallar "Falta el driver de SQL Server. Corre:  brew install unixodbc  y luego  backend/venv/bin/python -m pip install pyodbc"
preparar_node web-admin
echo "CUIDADO: son los datos reales de Azure. La base puede tardar ~1 minuto en despertar."
levantar_dev 127.0.0.1 ".env.azure"
pausar
