import { useEffect } from "react";
import { suscribirActualizacionGlobal } from "./actualizacionesGlobales";

export function useActualizacionGlobal(tabla, cargarFn) {
  useEffect(() => {
    return suscribirActualizacionGlobal(tabla, () => cargarFn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabla]);
}
