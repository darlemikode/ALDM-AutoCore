import { useRef, useState } from "react";
import { api } from "../../api";
import { Icono } from "../Icono";
import { useUI } from "../../context/UIContext";
import EscanerCamara from "./EscanerCamara";
import { buscarCodigo } from "./PuntoVenta";
import { nombreProducto, ubicacionTexto } from "./pdf";

/** Recibir mercancía: cada escaneo suma piezas al stock (o se captura la cantidad). */
export default function EntradaMercancia({ filas, onCambio }) {
  const { notify } = useUI();
  const [codigo, setCodigo] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [registro, setRegistro] = useState([]); // lo recibido en esta sesión
  const [camara, setCamara] = useState(false);
  const entrada = useRef(null);

  async function recibir(texto) {
    const r = buscarCodigo(filas, texto);
    if (!r) { notify(`No hay ningún producto con el código "${texto}". Da de alta el producto primero.`, "error"); return; }
    const n = Math.max(1, Number(cantidad) || 1);
    try {
      const act = await api.post(`/inventario/${r.id_inventario_refaccion}/entrada`, { cantidad: n });
      setRegistro((prev) => {
        const i = prev.findIndex((x) => x.id === r.id_inventario_refaccion);
        const fila = { id: r.id_inventario_refaccion, nombre: nombreProducto(r), recibido: (i >= 0 ? prev[i].recibido : 0) + n, stock: act.cantidad, ubic: ubicacionTexto(r) };
        return i >= 0 ? prev.map((x, k) => (k === i ? fila : x)) : [fila, ...prev];
      });
      onCambio?.();
    } catch (err) { notify(err.message, "error"); }
  }

  function teclas(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const t = codigo.trim();
    if (t) { recibir(t); setCodigo(""); }
  }

  return (
    <div className="panel" style={{ maxWidth: 820 }}>
      <p className="field-hint" style={{ marginTop: 0 }}>Escanea cada pieza (o escribe el código) y se suma al inventario. Cambia la cantidad si recibes cajas completas.</p>
      <div className="pv-escaner">
        <Icono nombre="hash" size={20} />
        <input ref={entrada} className="search-input pv-input" autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)} onKeyDown={teclas} placeholder="Escanea el código de barras…" />
        <input className="search-input" type="number" min="1" style={{ width: 90 }} value={cantidad} onChange={(e) => setCantidad(e.target.value)} title="Piezas por escaneo" />
        <button type="button" className="btn btn-secondary" onClick={() => setCamara(true)}><Icono nombre="camera" size={18} /> Cámara</button>
      </div>
      <div style={{ marginTop: 14 }}>
        {registro.length === 0 ? <div className="empty-state">Aún no has recibido nada en esta sesión.</div> : registro.map((x) => (
          <div key={x.id} className="pv-linea" style={{ gridTemplateColumns: "1fr auto auto" }}>
            <div className="pv-linea-nombre"><b>{x.nombre}</b><small>{x.ubic}</small></div>
            <span className="badge badge-teal">+{x.recibido}</span>
            <span style={{ minWidth: 80, textAlign: "right" }}>Stock: <b>{x.stock}</b></span>
          </div>
        ))}
      </div>
      {camara && <EscanerCamara onClose={() => setCamara(false)} onCodigo={(c) => { setCamara(false); recibir(c); }} />}
    </div>
  );
}
