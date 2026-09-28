# Sistema Mecánico — versión web + mobile

Reconstrucción completa del ERP de escritorio **SistemaMecanico2020** (C# WinForms)
como sistema moderno: API en Python/FastAPI, panel de administración web en React,
y app móvil en React Native (Expo).

## Estructura del proyecto

```
sistema-mecanico/
├── backend/          API REST (FastAPI + PostgreSQL + JWT)
├── web-admin/         Panel de administración (React + Vite)
├── mobile/            App móvil (Expo / React Native)
└── docker-compose.yml Levanta Postgres + backend con un comando
```

## Qué se migró y qué mejoró respecto al sistema original

Todos los módulos del sistema de escritorio están presentes: Clientes, Vehículos,
Servicios (órdenes de trabajo), Refacciones, Proveedores, Herramientas y todos
los catálogos (países/estados/ciudades, marcas, colores, etc.).

Mejoras estructurales intencionales:

- **`refacciones`** ahora es un catálogo de inventario real (ya no depende de un
  vehículo); su uso se registra al agregarla a una orden de servicio, y el stock
  se descuenta/regresa automáticamente.
- **`tipos_servicio`** es un catálogo nuevo (antes no existía, y el sistema original
  guardaba el tipo de servicio sin un catálogo formal).
- **`servicios_costos`** ya no es una tabla: el subtotal, IVA y total siempre se
  calculan a partir de los conceptos de la orden, así nunca se desincronizan.
- **`servicios_sin_cobrar`** se sustituyó por `servicios_abonos`: cada pago parcial
  queda registrado y el saldo pendiente se calcula automáticamente.

## Cuenta única cliente ↔ vehículo

Cada cliente recibe una cuenta única al darse de alta (`numero_cuenta`, ej.
`CTE-000001`), autogenerada e inmutable. Cada vehículo se "casa" 1 a 1 con la
cuenta de su dueño (`CTE-000001-01`, `CTE-000001-02`, ...), también autogenerada.
Un vehículo no se puede reasignar a otro cliente por API (evita romper la
cuenta); si se transfiere de dueño, se da de baja el vehículo y se registra
de nuevo bajo el nuevo cliente. Ambos números aparecen en el panel web, la
app móvil y en el recibo PDF de cada orden.

## Roles y permisos

Ya no son dos roles fijos — es un sistema de permisos real, pensado para la
jerarquía de un taller mecánico. Se siembran automáticamente 3 roles base
(no se pueden borrar, pero sí editar sus permisos):

| Rol | Puede hacer |
|---|---|
| **Dueño** | Todo — los 34 permisos del sistema, incluyendo administrar usuarios y roles. |
| **Hijo** | Administra catálogos por completo (ver/crear/editar/eliminar), y puede ver/crear/editar clientes, vehículos, órdenes de servicio, refacciones, herramientas y proveedores. No puede eliminar esos registros ni tocar usuarios/roles. |
| **Ayudante** | Solo puede ver clientes/vehículos/refacciones (para armar una orden) y ver/crear/editar órdenes de servicio (incluye cerrar/cancelar, agregar conceptos y abonos). Nada más. |

Además puedes crear **roles personalizados** desde **Roles y permisos** en
el panel (marcando permiso por permiso, agrupados por módulo: clientes,
vehículos, servicios, refacciones, herramientas, proveedores, catálogos,
usuarios, roles) para cualquier otro puesto que no encaje en los tres de
arriba.

Quien tenga el permiso `usuarios.ver`/`usuarios.crear`/etc. gestiona
usuarios desde **Usuarios** en el panel web (por defecto, solo el Dueño).
Cualquier usuario puede cambiar su propia contraseña desde el sidebar.

## Recuperación de contraseña

No hay un proveedor de correo/SMS conectado (se necesitarían credenciales de
un servicio como SendGrid o Twilio), así que el flujo es **mediado por el
administrador** en vez de un enlace mágico automático:

1. Desde el login, la persona da clic en "¿Olvidaste tu contraseña?" y
   escribe su usuario, correo o teléfono (`POST /api/auth/recuperar-password`,
   público). La respuesta es genérica siempre (exista o no la cuenta), para
   no revelar qué usuarios existen.
2. La solicitud queda guardada y visible para el admin en **Usuarios**, con
   un badge de notificación 🔔 en el sidebar y una tarjeta en el Panel.
3. El admin da clic en "Generar contraseña temporal", se la muestra en
   pantalla, y se la comunica él mismo a la persona (llamada, WhatsApp, en
   persona). La persona debe cambiarla en cuanto entre.
4. Opcional: si defines `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` /
   `SMTP_FROM` en tu `.env`, el admin *además* recibe un correo avisando de
   la solicitud (ver `.env.example`). Sin esas variables, todo sigue
   funcionando igual, solo sin ese correo adicional.

## Acceso biométrico (app móvil)

Después del primer inicio de sesión con usuario/contraseña, la app pregunta
si quieres activar huella/Face ID (también se puede activar o apagar después
en **Más → Entrar con huella / Face ID**). Si está activada, la próxima vez
que abras la app se te pide biometría antes de restaurar la sesión — el
token de sesión vive en el almacenamiento seguro cifrado del teléfono
(`expo-secure-store`), no en almacenamiento plano. Si la biometría falla o
la cancelas, puedes cerrar sesión y volver a entrar con tu contraseña.

## Códigos postales (Sepomex) — autollenado de dirección

Al capturar el CP de un cliente, el formulario consulta
`GET /api/codigos-postales/{cp}` y llena solo estado, municipio, ciudad y
sugiere las colonias (asentamientos) de ese CP.

**Alcance actual — prueba piloto:** el catálogo cargado por ahora es
**solo el municipio de León, Guanajuato** (1,277 registros, 207 códigos
postales), tomado del archivo real de Sepomex/Correos de México que se
subió al proyecto. Prueba con cualquier CP de León, ej. `37000`, `37010`,
`37020`.

**Para cargar el catálogo nacional completo** (~159,000 registros, los
32 estados) más adelante:
1. Reemplaza `backend/app/data/codigos_postales_leon.csv` por el CSV
   completo (mismas columnas: `cp,asentamiento,tipo_asentamiento,
   municipio,estado,ciudad,zona`).
2. Corre `python -m app.seed_codigos_postales --reemplazar` dentro del
   contenedor/entorno del backend.

El archivo XML original de Sepomex que se procesó no se incluye en el
repo (pesa 64 MB); si necesitas reprocesarlo desde cero, el formato es el
estándar de Sepomex (`d_codigo`, `d_asenta`, `d_tipo_asenta`, `D_mnpio`,
`d_estado`, `d_ciudad`, `d_zona`, con namespace `NewDataSet`).

## Panel con gráficas

El dashboard del panel web incluye tres gráficas (librería `recharts`):
tendencia de órdenes e ingresos de los últimos 6 meses, distribución de
órdenes por estado, y las refacciones con menor stock. Los datos vienen de
tres endpoints nuevos en el backend: `GET /api/dashboard/servicios-mensuales`,
`GET /api/dashboard/servicios-por-estado` y
`GET /api/dashboard/refacciones-bajo-stock-top`.

## Paleta visual

Gris de acero + azul petróleo, consistente entre el panel web y la app móvil:

| Token | Uso | Color |
|---|---|---|
| `ink-900` | texto fuerte / sidebar | `#1b2226` |
| `paper-0` | fondo principal | `#eef1f2` |
| `petrol-500` | acento principal (botones, activos) | `#166478` |
| `petrol-600` | hover / acento oscuro | `#0e4a58` |
| `teal-600` | estado "pagado / ok" (verde) | `#2f7d5b` |
| `red-600` | estado "alerta / stock bajo" | `#c4432f` |

## 1. Backend (FastAPI)

Soporta tres bases de datos — elige la que más te convenga cambiando
`DATABASE_URL` en tu `.env` (ver `.env.example` para las tres opciones
completas):

| Opción | Cuándo usarla | Requiere |
|---|---|---|
| **SQLite** (default) | Probar el sistema rápido, un solo usuario | Nada extra |
| **SQL Server** | Ya tienes SQL Server instalado en tu máquina (como en este caso) | `pip install -r requirements-mssql.txt` + ODBC Driver |
| **PostgreSQL** | Producción con varios usuarios a la vez, o prefieres Docker | `pip install -r requirements-postgres.txt`, o Docker |

### Sin Docker, con SQL Server (tu caso)

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # en Windows
pip install -r requirements.txt
pip install -r requirements-mssql.txt

copy .env.example .env
```

Edita `.env` y descomenta la línea de `DATABASE_URL` de SQL Server que
corresponda (autenticación de Windows, o usuario/contraseña) — están
comentadas con ejemplos completos, con explicación de "named instance"
(`SQLEXPRESS`) si aplica.

**Antes de arrancar**, crea la base de datos vacía en SQL Server (con SQL
Server Management Studio o Azure Data Studio): clic derecho en "Databases" →
"New Database" → nómbrala `sistema_mecanico`. El sistema crea las tablas
solo la primera vez que arranca.

Si no tienes el "ODBC Driver for SQL Server" (revisa si ya lo tienes
buscando "ODBC" en el menú de inicio → "Administrador de orígenes de datos
ODBC"), descárgalo gratis de Microsoft — el link exacto está en
`requirements-mssql.txt`.

Por último:

```bash
uvicorn app.main:app --reload --host 0.0.0.0
```

Debe decir `Uvicorn running on http://0.0.0.0:8000`. Abre
`http://localhost:8000/docs` para confirmar que responde.

> **`--host 0.0.0.0` es obligatorio si vas a usar las apps móviles** (la del
> taller y/o la de clientes) desde un teléfono: sin esto, el servidor solo
> escucha en tu propia computadora y el teléfono nunca lo alcanza aunque
> pongas bien la IP en `app.json`. Si Windows te muestra una alerta del
> Firewall al arrancar, dale "Permitir acceso" (si no, bloquea las
> conexiones desde el teléfono aunque el servidor sí esté escuchando).

### Con Docker (alternativa, usa PostgreSQL)

```bash
docker compose up --build
```

Esto levanta Postgres y la API en `http://localhost:8000`.

### Sin Docker, con SQLite (la opción más simple, sin instalar nada más)

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # en Windows: venv\Scripts\activate ; en Mac/Linux: source venv/bin/activate
pip install -r requirements.txt

copy .env.example .env         # no hace falta editarlo, SQLite es el default

uvicorn app.main:app --reload --host 0.0.0.0
```

En cualquiera de las tres opciones, al iniciar por primera vez la API crea
automáticamente las tablas y siembra:
- Un usuario administrador: **usuario `admin`, contraseña `admin1234`**
  (cámbiala editando `ADMIN_USERNAME` / `ADMIN_PASSWORD` en tu `.env` antes
  del primer arranque).
- Catálogo geográfico mínimo (México, los 32 estados) y tipos de servicio
  comunes de un taller.

## 2. Panel de administración web (React)

```bash
cd web-admin
npm install
npm run dev
```

Abre `http://localhost:5173`. Ya está configurado para redirigir las llamadas
`/api/*` al backend en `localhost:8000` (ver `vite.config.js`), así que no
necesitas configurar nada más en desarrollo.

Para producción: `npm run build` genera la carpeta `dist/`, que puedes servir
con cualquier hosting estático (Nginx, Vercel, Netlify, etc.) — solo ajusta el
proxy de `/api` a la URL real de tu backend.

## 3. App móvil (Expo / React Native)

```bash
cd mobile
npm install
npx expo start
```

Escanea el código QR con la app **Expo Go** en tu teléfono (Android o iOS),
o presiona `a` / `i` en la terminal para abrir un emulador.

**Importante:** edita `mobile/app.json` → `expo.extra.apiUrl` y pon la IP de
tu computadora en la red local (no `localhost`, porque el teléfono no la ve),
por ejemplo:

```json
"apiUrl": "http://192.168.1.100:8000/api"
```

**Esa misma IP y puerto van en las 3 apps** (`mobile/app.json`,
`mobile-cliente/app.json` y, si aplica, el proxy de `web-admin`) — es un
único backend con una única base de datos; si alguna app queda apuntando a
una IP distinta, esa app se ve "desconectada" de las demás aunque el
servidor esté corriendo bien. El teléfono y la computadora deben estar en
la misma red Wi-Fi/LAN, y la IP puede cambiar si tu router se la reasigna
(revísala de nuevo con `ipconfig` si dejó de funcionar).

La app móvil cubre: panel con KPIs, clientes y su historial, órdenes de
servicio (agregar conceptos, cerrar, registrar abonos), consulta de stock de
refacciones, y en el tab **Más**: proveedores (con sus productos y deudas) y
herramientas. Los catálogos generales (países, marcas, tipos de servicio,
etc.) quedaron solo en el panel web, por ser configuración que se hace una
vez y rara vez desde el celular.

## Cuenta inicial (rol Dueño)

| Usuario | Contraseña |
|---|---|
| `admin` | `admin1234` |

Cámbiala desde el propio panel en cuanto entres (sidebar → "Cambiar
contraseña"), o crea más usuarios asignándoles el rol que necesites desde
**Usuarios** (solo visible para quien tenga permiso `usuarios.ver`, el Dueño
por defecto).

## Próximos pasos sugeridos

- Subir fotos de herramientas/vehículos a un bucket (S3, Cloudinary) en vez de
  solo guardar una ruta de texto.
- Configurar HTTPS y restringir `CORS` a los dominios reales antes de producción.
- Migraciones con Alembic en vez de `create_all` — útil en cuanto haya datos
  reales en producción y se necesite versionar cambios de esquema.
