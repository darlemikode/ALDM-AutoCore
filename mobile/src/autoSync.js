// Orquesta lo que pasa cuando la app vuelve a tener servidor después de
// haber estado en modo local: sube lo pendiente (reusando la sesión real
// que ya estaba guardada, sin volver a pedir usuario/contraseña) y luego
// jala el catálogo actualizado. Se arranca una sola vez desde App.js.
import { suscribirModoLocal } from "./localMode";
import { getToken, esTokenLocal } from "./api";
import { subirPendientesConToken, contarPendientesTotal } from "./subirPendientes";
import { sincronizarAhora } from "./sync";

let enCurso = false;
const observadores = new Set();

// Pantallas (p. ej. Más) pueden suscribirse para mostrar un aviso mientras
// se sube/sincroniza, o para enterarse de errores que necesitan atención.
export function suscribirAutoSync(fn) {
  observadores.add(fn);
  return () => observadores.delete(fn);
}

function avisar(evento) {
  observadores.forEach((fn) => {
    try {
      fn(evento);
    } catch {
      // un observador roto no debe tumbar la sincronización
    }
  });
}

async function alRecuperarConexion() {
  if (enCurso) return;
  enCurso = true;
  avisar({ tipo: "inicio" });
  try {
    const token = await getToken();
    if (token && !esTokenLocal(token)) {
      const totalPendiente = await contarPendientesTotal();
      if (totalPendiente > 0) {
        const reporte = await subirPendientesConToken(token);
        avisar({ tipo: "subida", reporte });
      }
    }
    // Aunque no hubiera nada pendiente que subir, conviene refrescar el
    // catálogo — pudo haber cambiado en el servidor mientras esta app
    // estaba sin conexión.
    const resultado = await sincronizarAhora();
    avisar({ tipo: "sincronizacion", resultado });
  } catch (err) {
    avisar({ tipo: "error", mensaje: err.message });
  } finally {
    enCurso = false;
    avisar({ tipo: "fin" });
  }
}

let iniciado = false;
export function iniciarAutoSincronizacion() {
  if (iniciado) return;
  iniciado = true;
  suscribirModoLocal((modoLocal) => {
    if (!modoLocal) alRecuperarConexion();
  });
}
