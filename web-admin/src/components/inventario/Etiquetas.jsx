import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { contiene } from "../../lib/texto";
import { Icono } from "../Icono";
import { useUI } from "../../context/UIContext";
import { useAuth } from "../../context/AuthContext";
import PdfModal from "./PdfModal";
import { nombreProducto, pdfUrl, ubicacionTexto } from "./pdf";

const FORMATOS = [
  { v: "50x25", t: "Rollo térmico 50 × 25 mm" },
  { v: "60x40", t: "Rollo térmico 60 × 40 mm" },
  { v: "carta", t: "Hoja carta (30 etiquetas, tipo Avery 5160)" },
];

/** Generador de códigos de barras y etiquetas. */
export default function Etiquetas({ filas, preseleccion, onCambio }) {
  const { notify } = useUI();
  const { hasPermission } = useAuth();
  const [q, setQ] = useState("");
  const [copias, setCopias] = useState({}); // { id: n } — con n > 0 está seleccionado
  const [formato, setFormato] = useState("50x25");
  const [precio, setPrecio] = useState(true);
  const [pdf, setPdf] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => { if (preseleccion) setCopias((p) => ({ ...p, [preseleccion]: p[preseleccion] || 1 })); }, [preseleccion]);

  const visibles = useMemo(() => filas.filter((r) => !q.trim() || contiene(`${nombreProducto(r)} ${r.codigo_barras || ""} ${r.numero_parte || ""} ${ubicacionTexto(r)}`, q)), [filas, q]);
  const elegidos = Object.entries(copias).filter(([, n]) => n > 0);
  const totalEtiquetas = elegidos.reduce((s, [, n]) => s + Number(n), 0);
  const sinCodigo = filas.filter((r) => !r.codigo_barras).length;

  const poner = (id, n) => setCopias((p) => ({ ...p, [id]: Math.max(0, Math.min(200, Number(n) || 0)) }));
  const alternar = (id) => setCopias((p) => ({ ...p, [id]: p[id] > 0 ? 0 : 1 }));
  const seleccionarVisibles = () => setCopias((p) => { const n = { ...p }; visibles.forEach((r) => { n[r.id_inventario_refaccion] = n[r.id_inventario_refaccion] || 1; }); return n; });
  // Una etiqueta por pieza en stock (útil al recibir mercancía nueva)
  const unaPorPieza = () => setCopias((p) => { const n = { ...p }; visibles.forEach((r) => { n[r.id_inventario_refaccion] = Math.min(200, Math.max(r.cantidad || 0, 0)); }); return n; });

  async function asignarCodigos() {
    setTrabajando(true);
    try {
      const r = await api.post("/inventario/generar-codigos", {});
      notify(`Se asignó código a ${r.generados} producto(s).`, "success");
      onCambio?.();
    } catch (err) { notify(err.message, "error"); }
    setTrabajando(false);
  }

  async function generar() {
    if (!elegidos.length) return;
    setTrabajando(true);
    try {
      const url = await pdfUrl("/inventario/etiquetas.pdf", {
        method: "POST",
        body: { items: elegidos.map(([id, n]) => ({ id_inventario_refaccion: Number(id), copias: Number(n) })), formato, mostrar_precio: precio },
      });
      setPdf({ url });
      onCambio?.(); // por si se asignaron códigos al generar
    } catch (err) { notify(err.message, "error"); }
    setTrabajando(false);
  }

  return (
    <div className="panel">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input className="search-input" style={{ flex: 1, minWidth: 220 }} placeholder="Buscar producto, código o ubicación…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={formato} onChange={(e) => setFormato(e.target.value)}>{FORMATOS.map((f) => <option key={f.v} value={f.v}>{f.t}</option>)}</select>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={precio} onChange={(e) => setPrecio(e.target.checked)} /> Mostrar precio</label>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={seleccionarVisibles}>Elegir visibles</button>
        <button className="btn btn-secondary btn-sm" onClick={unaPorPieza}>1 etiqueta por pieza en stock</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setCopias({})}>Limpiar</button>
        {sinCodigo > 0 && hasPermission("inventario.editar") && (
          <button className="btn btn-secondary btn-sm" onClick={asignarCodigos} disabled={trabajando}><Icono nombre="hash" size={14} /> Asignar código a {sinCodigo} producto(s) sin código</button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" disabled={!totalEtiquetas || trabajando} onClick={generar}><Icono nombre="printer" size={16} /> {trabajando ? "Generando…" : `Generar ${totalEtiquetas} etiqueta(s)`}</button>
      </div>
      <div className="et-lista">
        {visibles.length === 0 && <div className="empty-state">Sin productos.</div>}
        {visibles.map((r) => {
          const n = copias[r.id_inventario_refaccion] || 0;
          return (
            <div key={r.id_inventario_refaccion} className={`et-fila ${n > 0 ? "et-activa" : ""}`}>
              <input type="checkbox" checked={n > 0} onChange={() => alternar(r.id_inventario_refaccion)} />
              <div className="pv-linea-nombre" onClick={() => alternar(r.id_inventario_refaccion)} style={{ cursor: "pointer" }}>
                <b>{nombreProducto(r)}</b>
                <small>{r.codigo_barras || "Sin código (se asigna al generar)"}{ubicacionTexto(r) ? ` · ${ubicacionTexto(r)}` : ""}</small>
              </div>
              <input className="pv-precio" type="number" min="0" max="200" value={n || ""} placeholder="0" onChange={(e) => poner(r.id_inventario_refaccion, e.target.value)} title="Copias" />
            </div>
          );
        })}
      </div>
      {pdf && <PdfModal url={pdf.url} titulo="Etiquetas con código de barras" nombre="etiquetas.pdf" onClose={() => setPdf(null)} />}
    </div>
  );
}
