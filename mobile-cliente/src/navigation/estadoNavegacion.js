// Guarda en memoria dónde estaba la persona dentro de la app. Al cambiar de
// tema la interfaz se vuelve a montar (key={tema} en App.js) y, sin esto, el
// NavigationContainer arrancaría de cero y mandaría a la pantalla principal.
let estado;
export const estadoGuardado = () => estado;
export const guardarEstado = (s) => { estado = s; };
export const olvidarNavegacion = () => { estado = undefined; };
