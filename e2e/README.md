# Pruebas de punta a punta (Playwright)

Prueban el **panel web** (web-admin) contra el **backend real**, como lo usaría
una persona: iniciar sesión, activar un taller nuevo, elegir/cambiar de taller,
aislamiento de datos entre talleres, avisos y bloqueo por suscripción, módulos
según el paquete, QR del taller y permisos por rol.

Siempre corren sobre una **base de datos de pruebas** (`_qa_tmp/e2e.db`, se
borra en cada corrida); nunca sobre la real.

## Una sola vez

```
cd e2e
npm install
npm run instalar-navegador
```

## Correr

Que Playwright levante todo solo (backend en el 8001 + web en el 5174):

```
npm run test:levantar
```

Con el navegador visible (para ver qué hace):

```
npx cross-env E2E_LEVANTAR=1 playwright test --headed
```

Una sola prueba o un grupo:

```
npx cross-env E2E_LEVANTAR=1 playwright test tests/02-activacion.spec.js
npx cross-env E2E_LEVANTAR=1 playwright test -g "suscripción"
```

Reporte con capturas, video y traza de las que fallen:

```
npm run reporte
```

### Usar servidores que ya tienes corriendo

```
set WEB_URL=http://localhost:5173
set API_URL=http://localhost:8001/api
set E2E_PASSWORD=<contraseña del admin de ESA base de pruebas>
npm test
```

Por seguridad se niega a correr contra el puerto 8000 (el servidor normal).

## Qué se prueba

| Archivo | Qué revisa |
|---|---|
| `01-login` | contraseña incorrecta, entrar y salir, usuario desactivado, recuperar contraseña (también en celular) |
| `02-activacion` | "¿Primera vez? Activa tu taller": código incorrecto, crear el administrador, el código ya no sirve otra vez |
| `03-multitaller` | usuario con 2 talleres elige y cambia de taller; usuario de 1 taller entra directo; menú en celular |
| `04-clientes-aislamiento` | un cliente dado de alta en un taller no aparece en otro |
| `05-suscripcion` | aviso por vencer, gracia = solo consulta, vencida = bloqueado, renovar; menú según el paquete |
| `06-qr-permisos` | QR del taller en Datos del taller; un Asesor no ve Proveedores, Catálogos ni Roles |

Cada prueba crea sus propios talleres y usuarios (vía la API del súper
administrador), así que no dependen unas de otras.
