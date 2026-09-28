// Hook chiquito para que cualquier pantalla se refresque sola cuando otro
// dispositivo (web, taller o cliente) cambia esa misma tabla. Úsalo junto
// con (no en vez de) el refresco al enfocar la pantalla que ya tenías.
import { useEffect } from "react";
import { suscribirActualizacionGlobal } from "./actualizacionesGlobales";

export function useActualizacionGlobal(tabla, cargarFn) {
  useEffect(() => {
    return suscribirActualizacionGlobal(tabla, () => cargarFn());
  }, [tabla, cargarFn]);
}
