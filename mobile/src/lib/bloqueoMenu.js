// Evita que un toque "de más" abra el menú lateral justo al cerrar un selector
// (Picker) o cualquier ventana: el segundo toque del usuario caía sobre ☰.
let abiertos = 0;
let ultimoCierre = 0;

export function modalAbierto() { abiertos += 1; }
export function modalCerrado() { abiertos = Math.max(0, abiertos - 1); ultimoCierre = Date.now(); }
export function menuBloqueado() { return abiertos > 0 || Date.now() - ultimoCierre < 900; }
