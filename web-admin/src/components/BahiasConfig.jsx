import { useEffect, useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import { IconoAuto } from "./Icono";

/** Alta y orden de las bahías del taller (elevadores / cajones) — se usan en el tablero del taller y en cada orden. */
export default function BahiasConfig() {
  const { notify, confirmDialog } = useUI();
  const [bahias, setBahias] = useState([]);
  const [nueva, setNueva] = useState("");
  const [edita, setEdita] = useState({}); // id_bahia -> nombre en edición
  const [ocupado, setOcupado] = useState(false);

  const cargar = () => api.get("/bahias/").then(setBahias).catch(() => setBahias([]));
  useEffect(() => { cargar(); }, []);

  async function agregar(e) {
    e.preventDefault();
    const nombre = nueva.trim();
    if (!nombre) return;
    setOcupado(true);
    try {
      await api.post("/bahias/", { nombre, orden: 0, activo: true });
      setNueva("");
      await cargar();
    } catch (err) { notify(err.message, "error"); } finally { setOcupado(false); }
  }

  async function guardar(b, cambios) {
    try {
      await api.put(`/bahias/${b.id_bahia}`, { nombre: b.nombre, orden: b.orden, activo: b.activo, ...cambios });
      setEdita((x) => { const { [b.id_bahia]: _, ...resto } = x; return resto; });
      await cargar();
    } catch (err) { notify(err.message, "error"); }
  }

  async function mover(i, d) {
    const j = i + d;
    if (j < 0 || j >= bahias.length) return;
    const a = bahias[i], b = bahias[j];
    try {
      await api.put(`/bahias/${a.id_bahia}`, { nombre: a.nombre, orden: j + 1, activo: a.activo });
      await api.put(`/bahias/${b.id_bahia}`, { nombre: b.nombre, orden: i + 1, activo: b.activo });
      await cargar();
    } catch (err) { notify(err.message, "error"); }
  }

  async function eliminar(b) {
    if (!(await confirmDialog(`¿Eliminar "${b.nombre}"? Las órdenes quedarán sin bahía.`, { title: "Eliminar bahía", danger: true }))) return;
    try { await api.del(`/bahias/${b.id_bahia}`); await cargar(); } catch (err) { notify(err.message, "error"); }
  }

  return (
    <section className="cfg-card">
      <div className="cfg-card-header">
        <span className="cfg-card-icono"><IconoAuto valor="🔧" size={18} /></span>
        <div>
          <h2>Bahías del taller</h2>
          <div className="cfg-card-desc">Elevadores o cajones donde se trabaja cada vehículo. Se asignan desde la orden y se ven en el tablero del taller.</div>
        </div>
      </div>
      <ul className="bahias-cfg">
        {bahias.map((b, i) => (
          <li key={b.id_bahia} className={b.activo ? "" : "inactiva"}>
            <span className="bahias-cfg-orden">
              <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">▲</button>
              <button type="button" onClick={() => mover(i, 1)} disabled={i === bahias.length - 1} aria-label="Bajar">▼</button>
            </span>
            {edita[b.id_bahia] !== undefined ? (
              <input autoFocus value={edita[b.id_bahia]} maxLength={60}
                onChange={(e) => setEdita({ ...edita, [b.id_bahia]: e.target.value })}
                onBlur={() => (edita[b.id_bahia].trim() && edita[b.id_bahia].trim() !== b.nombre ? guardar(b, { nombre: edita[b.id_bahia].trim() }) : setEdita((x) => { const { [b.id_bahia]: _, ...r } = x; return r; }))}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEdita((x) => { const { [b.id_bahia]: _, ...r } = x; return r; }); }} />
            ) : (
              <button type="button" className="bahias-cfg-nombre" onClick={() => setEdita({ ...edita, [b.id_bahia]: b.nombre })} title="Cambiar nombre">{b.nombre}</button>
            )}
            {b.ocupada_por && <small className="bahias-cfg-ocupada">Ocupada · orden #{b.ocupada_por}</small>}
            <label className="bahias-cfg-activa"><input type="checkbox" checked={b.activo} onChange={(e) => guardar(b, { activo: e.target.checked })} /> Activa</label>
            <button type="button" className="bahias-cfg-x" onClick={() => eliminar(b)} aria-label={`Eliminar ${b.nombre}`} title="Eliminar">×</button>
          </li>
        ))}
        {bahias.length === 0 && <li className="bahias-cfg-vacio">Aún no hay bahías. Agrega la primera (por ejemplo "Bahía 1" o "Elevador A").</li>}
      </ul>
      <form className="bahias-cfg-nueva" onSubmit={agregar}>
        <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder='Nueva bahía, ej. "Elevador A"' maxLength={60} />
        <button className="btn btn-primary btn-sm" disabled={ocupado || !nueva.trim()}>Agregar</button>
      </form>
    </section>
  );
}
