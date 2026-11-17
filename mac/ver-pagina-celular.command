#!/bin/bash
source "$(dirname "$0")/_comun.sh"
asegurar_cloudflared
trap apagar EXIT INT TERM
servir_sitio
sleep 2
echo "============================================================"
echo " Busca abajo la línea con  https://xxxx.trycloudflare.com"
echo " y ábrela en el navegador de tu celular. Cierra esta ventana para apagar el enlace."
echo "============================================================"
cloudflared tunnel --url http://localhost:8080
pausar
