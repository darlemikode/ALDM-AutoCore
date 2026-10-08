import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useUI } from "../context/UIContext";
import { sincronizarAhora, obtenerUltimaSincronizacion, formatearFechaSync } from "../sync";
import IconoModulo from "../components/IconoModulo";

/**
 * Guarda una copia local de clientes, vehículos, órdenes y refacciones en
 * el navegador (IndexedDB) para poder consultarlas aunque se caiga el
 * internet. La sincronización es manual: solo se actualiza cuando se
 * presiona el botón de aquí abajo.
 */
export default function Sincronizacion() {
  const { notify } = useUI();
  const [ultimaSync, setUltimaSync] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimoConteo, setUltimoConteo] = useState(null);

  useEffect(() => {
    obtenerUltimaSincronizacion().then(setUltimaSync);
  }, []);

  async function manejarSincronizar() {
    setSincronizando(true);
    try {
      const resultado = await sincronizarAhora();
      setUltimaSync(resultado.fecha);
      setUltimoConteo(resultado.conteo);
      notify("Sincronización completa.", "success");
    } catch (err) {
      notify(err.message || "No se pudo sincronizar. Revisa tu conexión.", "error");
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-titulo">
          <div>
            <h1><IconoModulo ruta="/sincronizacion" /> Sincronización</h1>
            <div className="subtitle">Guarda una copia local en este navegador para poder consultarla sin internet</div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 480 }}>
        <div className="field">
          <label>Última sincronización</label>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{formatearFechaSync(ultimaSync)}</div>
        </div>

        <button className="btn btn-primary" onClick={manejarSincronizar} disabled={sincronizando} style={{ marginTop: 8 }}>
          {sincronizando ? "Sincronizando…" : "Sincronizar ahora"}
        </button>

        {ultimoConteo && (
          <div className="subtitle" style={{ marginTop: 14 }}>
            Se guardaron localmente: {ultimoConteo.clientes} clientes · {ultimoConteo.vehiculos} vehículos ·{" "}
            {ultimoConteo.servicios} órdenes · {ultimoConteo.refacciones} refacciones
          </div>
        )}
      </div>
    </>
  );
}
