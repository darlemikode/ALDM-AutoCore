import { useEffect } from "react";
import ModalPortal from "./ModalPortal";
import MapaUbicacion from "./MapaUbicacion";

/** Mapa en pantalla grande: se coloca el pin con calma y se corrigen los datos de la dirección al lado. */
export default function MapaAmpliado({ form, setForm, onMover, mensaje, colonias = [], onCerrar }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  useEffect(() => {
    const tecla = (e) => { if (e.key === "Escape") { e.stopPropagation(); onCerrar(); } };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [onCerrar]);

  return (
    <ModalPortal>
      <div className="dom-amp-fondo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
        <div className="dom-amp" role="dialog" aria-label="Mapa ampliado">
          <header>
            <div><b>Ubicación exacta</b><small>Haz clic o arrastra el mapa para dejar el pin en la puerta del domicilio.</small></div>
            <button type="button" className="dom-amp-x" onClick={onCerrar} aria-label="Cerrar">✕</button>
          </header>
          <div className="dom-amp-cuerpo">
            <div className="dom-amp-mapa">
              <MapaUbicacion lat={form.lat} lng={form.lng} alto="100%" zoomInicial={18} onMover={onMover} />
            </div>
            <aside className="dom-amp-panel dom-form">
              <h4>Dirección del pin</h4>
              {mensaje && <p className={`dom-estado ${mensaje.tipo}`} role="status">{mensaje.tipo === "cargando" ? "⏳ " : mensaje.tipo === "ok" ? "✓ " : "⚠ "}{mensaje.texto}</p>}
              <div className="dom-fila dom-f-calle">
                <label>Calle<input value={form.calle} onChange={set("calle")} maxLength={150} /></label>
                <label>Número<input value={form.numero} onChange={set("numero")} maxLength={30} placeholder="123" /></label>
              </div>
              <label>Colonia
                <input value={form.colonia} onChange={set("colonia")} maxLength={100} list="dom-colonias-amp" autoComplete="off" />
                <datalist id="dom-colonias-amp">{colonias.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
              <div className="dom-fila">
                <label>C.P.<input value={form.cp} onChange={(e) => setForm((f) => ({ ...f, cp: e.target.value.replace(/\D/g, "").slice(0, 5) }))} inputMode="numeric" maxLength={5} /></label>
                <label>Ciudad<input value={form.ciudad} onChange={set("ciudad")} maxLength={100} /></label>
              </div>
              <label>Estado<input value={form.estado} onChange={set("estado")} maxLength={100} /></label>
              <label>Referencias<textarea rows={3} value={form.referencias} onChange={set("referencias")} maxLength={400} placeholder="Fachada, portón, entre qué calles…" /></label>
              <p className="dom-ayuda">Coordenadas: {form.lat}, {form.lng}</p>
              <button type="button" className="btn btn-primary" onClick={onCerrar}>Listo, usar esta ubicación</button>
            </aside>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
