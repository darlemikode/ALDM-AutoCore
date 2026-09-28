# Mi Taller — App de clientes

App aparte de la del taller (`../mobile`), para que tus clientes vean el
estatus de su servicio en tiempo real, platiquen contigo por chat, y
agenden citas.

## Cómo funciona el acceso

Los clientes **no se registran solos**. El flujo es:

1. En el panel web (o la app del taller), en **Clientes**, le das clic a
   "Invitar a la app" al cliente que quieras. Te muestra un código de 6
   dígitos.
2. Se lo comunicas tú (llamada, WhatsApp) junto con el teléfono o correo
   con el que está registrado.
3. El cliente abre esta app, va a la pestaña "Activar cuenta", pone su
   teléfono/correo + el código + una contraseña que él elija, y ya puede
   entrar.

## Instalación

```bash
cd mobile-cliente
npm install
```

Antes de correr, edita `app.json` → `expo.extra`:
- `apiUrl`: la misma IP que usa la app del taller, ej. `http://192.168.1.100:8000/api`
- `wsUrl`: la misma IP pero con `ws://` en vez de `http://`, ej. `ws://192.168.1.100:8000`

Debe ser **exactamente la misma IP y puerto** que `mobile/app.json` — las dos
apps y la web hablan con el mismo backend/base de datos; si esta queda
apuntando a otra IP, esta app se ve "sin datos" aunque el taller sí los
tenga. El backend debe arrancarse con `uvicorn app.main:app --reload --host
0.0.0.0` (ver el README raíz) para que el teléfono lo alcance.

```bash
npx expo start
```

## Qué incluye

- **Mis servicios**: lista de sus órdenes, con la etapa actual visible de un vistazo.
- **Detalle de servicio**: línea de tiempo en vivo (WebSocket — se actualiza
  sola, sin recargar), diagnóstico, y el botón rojo **"🚨 Avisar al
  mecánico"** para un aviso urgente.
- **Chat en vivo**: por cada orden, conectado por WebSocket — los mensajes
  aparecen al instante en ambos lados (cliente y taller).
- **Mis vehículos**: lectura simple de lo que tiene registrado.
- **Agendar**: propone una cita (vehículo, tipo de servicio, descripción);
  **el taller la tiene que confirmar o rechazar** desde su panel — nada se
  agenda solo.

## Pendiente / próximos pasos

- Notificaciones push cuando llega un mensaje o cambia el estatus estando
  la app cerrada (hoy solo funciona con la app abierta, vía WebSocket).
- Subir fotos desde el chat (hoy el chat es solo texto).
- Historial de servicios cerrados con recibo descargable.
