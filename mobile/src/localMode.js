// Interruptor central del modo de almacenamiento.
//
// Antes esto era fijo: había que cambiar esta línea a mano y volver a
// generar el APK para pasar de local a real o viceversa. Ahora es
// automático — la app siempre intenta hablar primero con el servidor
// real; en cuanto conexion.js detecta que no hay respuesta, se enciende
// MODO_LOCAL solo (todo se guarda en la base local del celular, ver
// db.js/apiLocal.js) y en cuanto vuelve a haber servidor se apaga solo y
// se suben los cambios pendientes (ver autoSync.js). Nadie necesita tocar
// este archivo para eso — se deja aquí solo el estado y la forma de
// escucharlo.
// Las pruebas QA (e2e.mjs/cobertura.mjs) validan justo la implementación
// de este modo local sin depender de si hay o no un backend real
// escuchando en la máquina donde corre `npm run qa` — por eso pueden forzarlo
// con esta variable de entorno (ver qa/correr.mjs). Fuera de pruebas nunca
// está definida, así que el comportamiento normal (dinámico) no cambia.
const FORZADO = typeof process !== "undefined" && process.env?.ALDM_FORZAR_MODO_LOCAL === "1";

export let MODO_LOCAL = FORZADO;

const escuchas = new Set();

// Las pantallas que muestran algo distinto según el modo (p. ej. "Subir
// pendientes" en Más, o el aviso de "trabajando sin conexión") se
// suscriben aquí para volver a pintarse cuando el modo cambia — un import
// normal de MODO_LOCAL solo refleja el valor que tenía al momento de
// renderizar, no los cambios después.
export function suscribirModoLocal(fn) {
  escuchas.add(fn);
  return () => escuchas.delete(fn);
}

// Solo debe llamarla conexion.js (o pruebas). No se exporta como parte de
// la API pública que usan las pantallas.
export function _establecerModoLocal(valor) {
  return; // todo en línea: el modo local queda deshabilitado
  if (FORZADO) return; // pruebas QA: se queda en local, no se deja apagar por conexion.js
  if (valor === MODO_LOCAL) return;
  MODO_LOCAL = valor;
  escuchas.forEach((fn) => {
    try {
      fn(MODO_LOCAL);
    } catch {
      // una pantalla rota al reaccionar no debe tumbar el cambio de modo
    }
  });
}
