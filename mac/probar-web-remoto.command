#!/bin/bash
source "$(dirname "$0")/_comun.sh"
asegurar_cloudflared
preparar_backend
preparar_node web-admin
trap apagar EXIT INT TERM
( cd backend && ENV_FILE="" exec venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 ) &
PIDS+=($!)
( cd web-admin && VITE_API_TARGET=http://localhost:8000 exec npm run dev -- --port 5173 ) &
PIDS+=($!)
sleep 8
echo; echo "Busca abajo el enlace https://xxxx.trycloudflare.com y ábrelo en el otro equipo."
echo "Usuario: admin   Contraseña: admin1234  (cámbiala: el enlace es público mientras esté abierto)"; echo
cloudflared tunnel --url http://localhost:5173
pausar
