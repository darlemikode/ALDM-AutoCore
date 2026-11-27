# ALDM AutoCore (barra de menú de macOS)

Controla tus ambientes y monitorea la salud de la API y la base sin abrir nada más.

## Compilar y abrir
```
cd ~/Documents/sistema-mecanico/tools/panel-mac
chmod +x build.sh
./build.sh
open "ALDM AutoCore.app"
```
Requiere macOS 13+ y las herramientas de línea de comandos (`xcode-select --install`).
La primera vez macOS pedirá permiso para notificaciones: acéptalo.

## Qué hace
Arriba siempre se ve el semáforo general (el peor estado de producción y Azure); los servidores de esta Mac apagados no cuentan como caída. Tres pestañas:

- **Dev** (esta Mac): interruptores de la API (:8000, con SQLite local o la base de Azure vía `backend/.env.azure`) y de la web admin (:5173); apps móviles con la API de esta Mac: Expo en el celular, simulador de iPhone (requiere Xcode) y APK de desarrollo.
- **QA** (esta Mac): servidor de pruebas en :8001 sobre una copia de la base local (`_qa_tmp/qa_copy.db`); "Actualizar copia" la vuelve a sacar de la base de desarrollo y "Correr pruebas" lanza las integrales y multitaller. No toca la base de desarrollo ni producción. Cuando exista un QA en Azure basta cambiar la `url` del ambiente "QA" en la configuración.
- **Prod** (solo monitoreo): estado de `app.aldmautocore.com` (latencia, errores 5xx, p95, base) y **Azure**: estado del App Service y de Azure SQL y, de la última hora minuto a minuto, CPU y memoria del servidor, peticiones, errores 5xx, tiempo de respuesta y CPU de la base, con su pico. Usa la CLI de Azure con tu sesión (`brew install azure-cli` y `az login`); consulta Azure Monitor, así que no despierta la base ni genera cobro. Se actualiza cada 5 min. También Expo contra producción y el APK de producción.

Avisa con una notificación de macOS cuando producción se cae, se degrada o se recupera (confirmado en 2 lecturas) y cuando Azure reporta un servicio abajo o picos. Los logs de los servidores locales quedan en `~/Library/Logs/PanelALDM/`. Las apps móviles y las compilaciones se abren en Terminal con los scripts de `mac/`.

## Configuración
`~/Library/Application Support/PanelALDM/config.json` (botón "Configuración…"; luego "Recargar"). Ahí agregas ambientes y la clave de monitoreo:

```
{ "nombre": "Producción", "url": "https://app.aldmautocore.com", "clave": "<SALUD_KEY>", "revisarBD": false, "cadaSegundos": 60 }
```

Los recursos de Azure y los umbrales de alerta van en `azure`:

```
"azure": { "grupo": "ALDM_AutoCore_GrpRs", "app": "aldm-autocore-app", "servidorSQL": "aldm-autocore-sqlsr", "baseSQL": "ALDM_AutoCore_DB", "cadaSegundos": 300, "alertaCPU": 80, "alertaMemoria": 85 }
```

## Servidor (para ver el detalle y recibir alertas)
En Azure → App Service → Configuración, define:
- `SALUD_KEY`: una clave larga al azar (esa misma va en `clave` del panel). Sin ella el panel solo sabe si el servidor responde.
- `ALERTA_WEBHOOK_URL`: webhook de n8n que recibe `{nivel, titulo, mensaje}` y manda el WhatsApp.
- `SALUD_VIGILAR_BD=1` (opcional): el vigilante interno también prueba la base.

Además, el flujo `.github/workflows/vigilancia.yml` revisa cada 10 min desde fuera y avisa si la API no responde por completo. Necesita los secrets `SALUD_KEY` y `ALERTA_WEBHOOK_URL` en el repositorio.

**Costo:** "Revisar base" y `SALUD_VIGILAR_BD` despiertan Azure SQL Serverless; por eso vienen apagados en producción.
