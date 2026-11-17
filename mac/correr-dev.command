#!/bin/bash
source "$(dirname "$0")/_comun.sh"
preparar_backend
preparar_node web-admin
echo "Usuario: admin   Contraseña: admin1234"
levantar_dev 0.0.0.0 ""
pausar
