# Agente de WhatsApp con n8n

Un solo número de WhatsApp atiende a **clientes** y al **personal** del taller.
El flujo identifica quién escribe por su teléfono y usa un agente distinto para cada caso:

| Quién escribe | Cómo se reconoce | Qué puede hacer |
|---|---|---|
| Cliente | Su teléfono está en su ficha (teléfono 1 o 2) | Ver estado y saldo de sus órdenes, recibir su nota en PDF, solicitar cita |
| Personal | Teléfono capturado en **Usuarios** (usuario activo del taller) | Resumen del día, buscar órdenes, refacciones con poco stock, citas por confirmar — según los permisos de su rol |
| Desconocido | Ninguno de los anteriores | Solo los datos de contacto del taller |

La IA nunca elige de quién son los datos: el teléfono lo toma n8n del mensaje recibido y el
servidor solo devuelve lo de ese teléfono y de ese taller.

## 1. En el sistema
1. Configuración → **Integraciones** → *Generar llave*. Cópiala (solo se muestra una vez).
2. Usuarios: captura el teléfono (10 dígitos) de quien usará el asistente interno.

## 2. En Meta (WhatsApp Business Cloud API)
1. Crea una app en developers.facebook.com con el producto **WhatsApp** y agrega/verifica tu número.
2. Copia el **Phone number ID**, genera un **token permanente** (usuario del sistema con permiso `whatsapp_business_messaging`) y anota el **App ID / App Secret**.

## 3. En n8n Cloud
1. *Import from file* → `ALDM_agente_whatsapp.json`.
2. Crea estas credenciales y asígnalas a los nodos que las piden:
   - **ALDM API Key** (Header Auth): Name `X-API-Key`, Value = la llave del paso 1.
   - **Meta WhatsApp Token** (Header Auth): Name `Authorization`, Value `Bearer <token permanente>`.
   - **WhatsApp Trigger (Meta)** (WhatsApp OAuth API): App ID y App Secret.
   - **Anthropic**: tu API key de Claude (en el nodo elige el modelo que quieras).
3. Nodo **Config**: cambia `base_url` por la dirección de tu sistema en Azure (sin `/` al final).
4. Activa el workflow. n8n registra solo el webhook en Meta (el trigger).

## Notas
- Las respuestas van dentro de la ventana de 24 h que abre el cliente al escribir, así que no se necesitan plantillas.
- Si el cliente pide la nota de una orden que no es suya, el servidor responde 404 y el flujo le avisa que un asesor se la enviará.
- Para revocar el acceso: Integraciones → *Revocar* (deja de funcionar al instante).
- Endpoints usados: `/api/integracion/identificar`, `/taller`, `/cliente/ordenes`, `/cliente/ordenes/{id}/nota`, `/cliente/citas`, `/personal/resumen`, `/personal/ordenes`, `/personal/bajo-stock`, `/personal/citas` (todos con encabezado `X-API-Key`).
