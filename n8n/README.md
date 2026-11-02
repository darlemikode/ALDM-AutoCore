# Agente de WhatsApp (n8n) — un solo flujo para todos los talleres

**El taller no configura nada.** ALDM monta este flujo UNA vez; cualquier taller cuyo paquete incluya el módulo
«Agente WhatsApp (IA)» queda atendido automáticamente. Al contratarlo, el taller ve su **enlace y QR de WhatsApp**
en Configuración → Integraciones (se generan solos con su código de taller).

## Cómo reconoce el taller
Todos escriben al **mismo número de WhatsApp de ALDM**. El flujo llama primero a
`GET /api/integracion/plataforma/resolver?telefono=…&texto=…`, que decide con qué taller habla esa persona:

1. El mensaje trae el código del taller (por el QR/enlace: «Hola, quiero ayuda de X. Código: ABC123») → se vincula.
2. Ya estaba vinculado → sigue con su taller.
3. Su teléfono está registrado en un solo taller con el módulo → se vincula solo.
4. Está en varios → se le pide elegir; en ninguno → se le pide el código del taller.

Después, todas las consultas llevan `X-Taller: <código>` + `X-Plataforma-Key`, y el servidor acota los datos a ese taller y a ese teléfono
(cliente: solo sus órdenes; personal: según su rol). Si el taller no tiene el módulo, está suspendido o vencido, el servidor responde 403/402.
Cada mensaje atendido suma 1 a «interacciones WhatsApp» del taller (150 incluidas, $6 de excedente).

## Configuración única (solo ALDM)
**1. Servidor (Azure → App Service → Configuración → Variables de entorno)**
- `AGENTE_PLATAFORMA_KEY` = una cadena larga y aleatoria (ej. 48+ caracteres). Es la contraseña entre n8n y el sistema.
- `AGENTE_WHATSAPP_NUMERO` = número de WhatsApp del agente, solo dígitos con lada de país (ej. `5214771234567`).

**2. Meta (WhatsApp Business Cloud API)** — con el número de ALDM
- Crea la app con el producto **WhatsApp**, agrega/verifica el número y copia **Phone number ID**, **token permanente** y **App ID / App Secret**.

**3. n8n Cloud**
- *Import from file* → `ALDM_agente_whatsapp.json`.
- Credenciales (y asígnalas a los nodos):
  - **ALDM Plataforma** (Header Auth): Name `X-Plataforma-Key`, Value = el mismo `AGENTE_PLATAFORMA_KEY`.
  - **Meta WhatsApp Token** (Header Auth): Name `Authorization`, Value `Bearer <token permanente>`.
  - **WhatsApp Trigger (Meta)**: App ID y App Secret.
  - **Anthropic**: API key de Claude.
- Nodo **Config**: `base_url` ya apunta a `https://app.aldmautocore.com` (cámbialo si tu dominio es otro, sin `/` al final).
- Activa el workflow.

Con eso queda para todos los talleres. Un taller nuevo con el módulo solo debe imprimir su QR.

## Notas
- Las respuestas van dentro de la ventana de 24 h que abre el cliente al escribir; no se necesitan plantillas.
- Las llaves por taller (`X-API-Key`, Integraciones → Avanzado) siguen funcionando para quien quiera su propio flujo.
- Para pausar a un taller: quita el módulo de su paquete o suspéndelo; deja de responder al instante.
- Cada persona queda vinculada a un solo taller a la vez; para cambiar, escribe otro «Código: XXXX».
