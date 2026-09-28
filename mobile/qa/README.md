# Patrón de pruebas QA — App del taller (mobile)

Un solo comando, desde `mobile/`:

```
npm run qa
```

Requiere Node 22.5+ (usa `node:sqlite`) y, opcionalmente, Python 3 para las dos validaciones contra el backend y la web. No necesita celular, emulador, servidor ni internet: ejecuta **el código real de la app** (`src/api.js` → `src/apiLocal.js` → `src/db.js`) en Node, con SQLite real en memoria.

## Qué corre

| # | Archivo | Qué valida |
|---|---|---|
| 1 | `e2e.mjs` | 96 pruebas de flujos completos: catálogos precargados, códigos postales, cliente → vehículo → orden, llenado de la orden, abonos, finalizar/cobrar, reabrir/cancelar, garantías, etapas, inventario por vehículo (descuento, consolidación, stock nunca negativo), fotos, chat, inspección, panel, cotizaciones, proveedores, catálogos. **Se repite 3 veces** para detectar fallas intermitentes (`QA_REPETIR=5 npm run qa` para más). |
| 2 | `cobertura.mjs` | Cada llamada `api.*` de pantallas y componentes tiene equivalente en modo local. |
| 3 | `estaticas.mjs` | Toda navegación apunta a una pantalla registrada, y los estilos de **todas** las pantallas se calculan en tema claro y oscuro sin colores faltantes. También reporta contrastes bajos. |
| 4 | `contrato_api.py` | Cada endpoint que usa la app existe en el backend FastAPI real (`backend/app/routers`). |
| 5 | `paridad_web.py` | Cada campo de los formularios del panel web existe en la pantalla equivalente de la app. |

El resultado completo queda en `qa/ultimo-reporte.txt`.

## Cómo funciona

- `registrar.mjs` + `hooks.mjs`: hacen que Node cargue el código como lo hace Metro (imports sin extensión, `.js` como módulo ES) y sustituyen los módulos nativos por los de `mocks/`.
- `mocks/sqlite.mjs`: `expo-sqlite` implementado sobre `node:sqlite` (misma API async: `runAsync`, `getAllAsync`, `withTransactionAsync`…).
- Los demás mocks (`expo-file-system`, `expo-secure-store`, AsyncStorage, `react-native`, `expo-constants`) son mínimos.

## Cómo agregar pruebas

En `e2e.mjs`:

```js
seccion("X. Mi módulo");
const r = await api.post("/mi-endpoint/", { ... });   // misma llamada que hace la pantalla
ok(r.campo === esperado, "descripción de lo que se valida", detalleSiFalla);
await falla(() => api.put(...), "debe rechazar esto", "texto del error");
```

Reglas del patrón:
1. **Probar con la misma llamada y el mismo cuerpo que manda la pantalla**, no con atajos.
2. **Cuando el backend tiene una regla, la prueba la copia del código del backend** (no de un comentario) y el modo local debe cumplirla. Ejemplos: stock nunca negativo, consolidar refacciones repetidas, IVA configurable.
3. Cada bug que se encuentra deja su prueba, para que no regrese.
4. Si una pantalla nueva llama un endpoint nuevo, `cobertura.mjs` y `contrato_api.py` fallan hasta que exista en el modo local y en el backend.
5. Si se agrega una página o un campo en la web, se registra en `MAPA` de `paridad_web.py`.

## Bugs que ya atrapó este patrón

- No se podía finalizar la orden en modo local (faltaba `/servicios/{id}/finalizar`).
- Una orden pagada que se reabría seguía como "pagada" y el panel no contaba su saldo.
- El anticipo con tarjeta se guardaba como efectivo.
- `GET /fotos/` en local devolvía un objeto: la galería tronaba con `fotos.map`.
- La siembra de catálogos insertaba `id` NULL (`NOT NULL constraint failed: colecciones.id`).
- Conexiones SQLite paralelas: `NativeDatabase.prepareAsync … NullPointerException`.
- Productos y deudas de proveedor se descartaban en local; el panel mostraba deuda $0.
- `/ciudades/?id_estado=` ignoraba el filtro.
- Ids de conceptos con `Date.now()` podían repetirse (falla intermitente al editar/quitar).
- Inventario local no seguía al backend (stock general, tope en 0, consolidación).
- *Estatus inicial* en Nueva orden: el backend no lo acepta (`ServicioIn` no tiene `status`); se quitó.
