#!/bin/bash
source "$(dirname "$0")/_comun.sh"
trap apagar EXIT INT TERM
servir_sitio
echo "Página en: http://localhost:8080  (Ctrl+C o cierra esta ventana para apagar)"
echo "Para ver otra vez la animación abre una ventana de incógnito."
sleep 1; open http://localhost:8080/index.html
wait
pausar
