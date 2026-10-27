import { useEffect, useState } from "react";
import { api } from "../../api";
import { Icono } from "../Icono";
import { useUI } from "../../context/UIContext";
import { useAuth } from "../../context/AuthContext";
import PdfModal from "./PdfModal";
import { dinero, pdfUrl } from "./pdf";

export default function VentasMostrador({ refrescar, onCambio }) {
  const { notify, confirmDialog } = useUI();
  const { hasPermission } = useAuth();
  const [ventas, setVentas] = useState(null);
  const [q, setQ] = useState("");
  const [pdf, setPdf] = useState(null);

  async function cargar() {
    try { setVentas(await api.get(`/inventario/ventas?limite=200${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`)); }
    catch (err) { notify(err.message, "error"); setVentas([]); }
  }
  useEffect(() => { cargar(); }, [refrescar]);

  async function ver(v, tipo) {
    try { setPdf({ url: await pdfUrl(`/inventario/ventas/${v.id_venta}/${tipo}.pdf`), titulo: `${tipo === "ticket" ? "Ticket" : "Nota de venta"} #${v.folio}`, nombre: `${tipo}-${v.folio}.pdf` }); }
    catch (err) { notify(err.message, "error"); }
  }
  async function cancelar(v) {
    if (!(await confirmDialog(`¿Cancelar la venta #${v.folio}? Las piezas regresan al inventario.`, { danger: true, confirmar: "Sí, cancelar" }))) return;
    try { await api.post(`/inventario/ventas/${v.id_venta}/cancelar`, {}); notify("Venta cancelada y stock devuelto.", "success"); cargar(); onCambio?.(); }
    catch (err) { notify(err.message, "error"); }
  }

  const hoy = new Date().toDateString();
  const validas = (ventas || []).filter((v) => v.estatus !== "Cancelada");
  const deHoy = validas.filter((v) => v.fecha && new Date(v.fecha + (v.fecha.endsWith("Z") ? "" : "Z")).toDateString() === hoy);
  const fechaTxt = (f) => (f ? new Date(f + (f.endsWith("Z") ? "" : "Z")).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—");

  return (
    <div className="panel">
      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input className="search-input" style={{ flex: 1, minWidth: 200 }} placeholder="Buscar por folio…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()} />
        <button className="btn btn-secondary" onClick={cargar}>Buscar</button>
        <span className="badge badge-teal">Hoy: {deHoy.length} venta(s) · {dinero(deHoy.reduce((s, v) => s + v.total, 0))}</span>
      </div>
      {ventas === null ? <div className="loading-text">Cargando…</div> : ventas.length === 0 ? <div className="empty-state">Aún no hay ventas de mostrador.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%" }}>
            <thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Piezas</th><th>Pago</th><th style={{ textAlign: "right" }}>Total</th><th>Estatus</th><th /></tr></thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.id_venta} style={v.estatus === "Cancelada" ? { opacity: 0.55 } : undefined}>
                  <td><b>#{v.folio}</b></td>
                  <td>{fechaTxt(v.fecha)}</td>
                  <td>{v.cliente_nombre || "Público en general"}</td>
                  <td title={v.detalles.map((d) => `${d.cantidad}× ${d.descripcion}`).join("\n")}>{v.detalles.reduce((s, d) => s + d.cantidad, 0)}</td>
                  <td>{v.metodo_pago}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{dinero(v.total)}</td>
                  <td><span className={`badge ${v.estatus === "Cancelada" ? "badge-red" : "badge-teal"}`}>{v.estatus}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn-icono" title="Ticket" onClick={() => ver(v, "ticket")}><Icono nombre="printer" size={18} /></button>
                    <button className="btn-icono" title="Nota de venta" onClick={() => ver(v, "nota")}><Icono nombre="document" size={18} /></button>
                    {v.estatus !== "Cancelada" && hasPermission("inventario.eliminar") && <button className="btn-icono btn-icono-peligro" title="Cancelar venta" onClick={() => cancelar(v)}><Icono nombre="ban" size={18} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pdf && <PdfModal url={pdf.url} titulo={pdf.titulo} nombre={pdf.nombre} onClose={() => setPdf(null)} />}
    </div>
  );
}
