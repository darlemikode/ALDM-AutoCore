import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { contiene, norm } from "../../lib/texto";
import { Icono } from "../Icono";
import { useUI } from "../../context/UIContext";
import ModalPortal from "../ModalPortal";
import EscanerCamara from "./EscanerCamara";
import PdfModal from "./PdfModal";
import { dinero, nombreProducto, pdfUrl, ubicacionTexto } from "./pdf";

const PAGOS = ["Efectivo", "Tarjeta", "Transferencia"];

/** Busca por lo que lee el lector: código de barras exacto o número de parte. */
export function buscarCodigo(filas, texto) {
  const t = norm(texto);
  if (!t) return null;
  return filas.find((r) => norm(r.codigo_barras) === t) || filas.find((r) => r.numero_parte && norm(r.numero_parte) === t) || null;
}

/** Punto de venta de mostrador: escanea o busca, arma el ticket y cobra. */
export default function PuntoVenta({ filas, fotos, onVendida, marcasVehiculo = [], modelosVehiculo = [] }) {
  const { notify } = useUI();
  const [q, setQ] = useState("");
  const [carrito, setCarrito] = useState([]); // { id, nombre, codigo, precio, cantidad, stock, ubic }
  const [cliente, setCliente] = useState("");
  const [pago, setPago] = useState("Efectivo");
  const [descuento, setDescuento] = useState("");
  const [recibido, setRecibido] = useState("");
  const [notas, setNotas] = useState("");
  const [fMarca, setFMarca] = useState("");
  const [fModelo, setFModelo] = useState("");
  const [fRefaccion, setFRefaccion] = useState("");
  const [camara, setCamara] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [hecha, setHecha] = useState(null); // venta recién cobrada
  const [pdf, setPdf] = useState(null);
  const entrada = useRef(null);

  useEffect(() => { entrada.current?.focus(); }, [hecha]);

  function agregar(r) {
    if ((r.cantidad || 0) <= 0) { notify(`"${nombreProducto(r)}" está agotado.`, "error"); return; }
    setCarrito((prev) => {
      const i = prev.findIndex((l) => l.id === r.id_inventario_refaccion);
      if (i >= 0) {
        if (prev[i].cantidad >= r.cantidad) { notify(`Solo hay ${r.cantidad} en stock de "${nombreProducto(r)}".`, "error"); return prev; }
        return prev.map((l, k) => (k === i ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [...prev, { id: r.id_inventario_refaccion, nombre: nombreProducto(r), codigo: r.codigo_barras, precio: r.preciocliente || 0, cantidad: 1, stock: r.cantidad, ubic: ubicacionTexto(r) }];
    });
  }

  function alEscanear(texto) {
    const hallado = buscarCodigo(filas, texto);
    if (hallado) { agregar(hallado); setQ(""); return true; }
    return false;
  }

  const resultados = useMemo(() => {
    if (!q.trim()) return [];
    return filas.filter((r) => contiene(`${nombreProducto(r)} ${r.codigo_barras || ""} ${r.numero_parte || ""} ${r.refaccion?.categoria || ""}`, q)).slice(0, 30);
  }, [filas, q]);

  function teclas(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const texto = q.trim();
    if (!texto) return;
    if (alEscanear(texto)) return;
    if (resultados.length === 1) { agregar(resultados[0]); setQ(""); return; }
    notify(resultados.length ? "Hay varios resultados: elige uno de la lista." : `No hay ningún producto con "${texto}".`, "error");
  }

  const cambiarCant = (id, delta) => setCarrito((prev) => prev.flatMap((l) => {
    if (l.id !== id) return [l];
    const n = l.cantidad + delta;
    if (n <= 0) return [];
    if (n > l.stock) { notify(`Solo hay ${l.stock} en stock.`, "error"); return [l]; }
    return [{ ...l, cantidad: n }];
  }));
  const cambiarPrecio = (id, v) => setCarrito((prev) => prev.map((l) => (l.id === id ? { ...l, precio: v === "" ? "" : Number(v) } : l)));
  const quitar = (id) => setCarrito((prev) => prev.filter((l) => l.id !== id));

  const subtotal = carrito.reduce((s, l) => s + (Number(l.precio) || 0) * l.cantidad, 0);
  const desc = Math.min(Math.max(Number(descuento) || 0, 0), subtotal);
  const total = Math.round((subtotal - desc) * 100) / 100;
  const cambio = pago === "Efectivo" && recibido !== "" ? Number(recibido) - total : null;
  const faltaEfectivo = pago === "Efectivo" && recibido !== "" && Number(recibido) + 1e-9 < total;

  function limpiar() {
    setCarrito([]); setCliente(""); setDescuento(""); setRecibido(""); setNotas(""); setPago("Efectivo"); setQ("");
  }

  async function cobrar() {
    if (!carrito.length || faltaEfectivo) return;
    setGuardando(true);
    try {
      const venta = await api.post("/inventario/ventas", {
        lineas: carrito.map((l) => ({ id_inventario_refaccion: l.id, cantidad: l.cantidad, precio_unitario: Number(l.precio) || 0 })),
        cliente_nombre: cliente || null, metodo_pago: pago, descuento: desc,
        recibido: pago === "Efectivo" && recibido !== "" ? Number(recibido) : null, notas: notas || null,
      });
      setHecha(venta);
      limpiar();
      onVendida?.();
    } catch (err) { notify(err.message, "error"); }
    setGuardando(false);
  }

  async function verPdf(tipo) {
    try {
      const url = await pdfUrl(`/inventario/ventas/${hecha.id_venta}/${tipo}.pdf`);
      setPdf({ url, titulo: tipo === "ticket" ? `Ticket #${hecha.folio}` : `Nota de venta #${hecha.folio}`, nombre: `${tipo}-${hecha.folio}.pdf` });
    } catch (err) { notify(err.message, "error"); }
  }

  const hayFiltro = !!(fMarca || fModelo || fRefaccion);
  const pasaFiltro = (r) => {
    if (fRefaccion && String(r.id_refaccion) !== fRefaccion) return false;
    if (fMarca || fModelo) {
      return (r.compatibilidades || []).some((c) =>
        (!fMarca || String(c.id_marca_vehiculo) === fMarca) && (!fModelo || !c.id_modelo_vehiculo || String(c.id_modelo_vehiculo) === fModelo));
    }
    return true;
  };
  const baseLista = q.trim() ? resultados : filas.filter((r) => (r.cantidad || 0) > 0);
  const sugeridos = hayFiltro || q.trim() ? baseLista.filter(pasaFiltro).slice(0, 60) : baseLista.slice(0, 12);
  const refaccionesOpc = [...new Map(filas.map((r) => [r.id_refaccion, r.refaccion?.nombre_refaccion || "—"])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="pv">
      <div className="pv-izq panel">
        <div className="pv-escaner">
          <Icono nombre="hash" size={20} />
          <input
            ref={entrada} className="search-input pv-input" value={q} autoFocus
            onChange={(e) => setQ(e.target.value)} onKeyDown={teclas}
            placeholder="Escanea el código de barras o busca por nombre, marca, número de parte…"
          />
          <button type="button" className="btn btn-secondary" onClick={() => setCamara(true)} title="Escanear con la cámara"><Icono nombre="camera" size={18} /> Cámara</button>
        </div>
        <div className="pv-filtros">
          <select value={fMarca} onChange={(e) => { setFMarca(e.target.value); setFModelo(""); }}>
            <option value="">Marca (vehículo)</option>
            {marcasVehiculo.map((m) => <option key={m.id_marca_vehiculo} value={m.id_marca_vehiculo}>{m.nombre_marca}</option>)}
          </select>
          <select value={fModelo} disabled={!fMarca} onChange={(e) => setFModelo(e.target.value)}>
            <option value="">Modelo</option>
            {modelosVehiculo.filter((mo) => String(mo.id_marca_vehiculo) === fMarca).map((mo) => <option key={mo.id_modelo_vehiculo} value={mo.id_modelo_vehiculo}>{mo.nombre_modelo}</option>)}
          </select>
          <select value={fRefaccion} onChange={(e) => setFRefaccion(e.target.value)}>
            <option value="">Refacción</option>
            {refaccionesOpc.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
          {hayFiltro && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setFMarca(""); setFModelo(""); setFRefaccion(""); }}>Limpiar</button>}
        </div>
        <div className="pv-lista">
          {sugeridos.length === 0 && <div className="empty-state">{q ? "Sin resultados." : "No hay productos con stock."}</div>}
          {sugeridos.map((r) => (
            <button type="button" key={r.id_inventario_refaccion} className="pv-prod" onClick={() => { agregar(r); entrada.current?.focus(); }}>
              <span className="pv-prod-foto">{fotos?.[r.id_inventario_refaccion] ? <img loading="lazy" src={fotos[r.id_inventario_refaccion]} alt="" /> : <Icono nombre="cube" size={22} />}</span>
              <span className="pv-prod-info">
                <b>{nombreProducto(r)}</b>
                <small>{[r.codigo_barras, ubicacionTexto(r)].filter(Boolean).join(" · ") || r.refaccion?.categoria || ""}</small>
              </span>
              <span className="pv-prod-precio">
                {dinero(r.preciocliente)}
                <small className={(r.cantidad || 0) <= (r.umbral_rojo ?? 1) ? "pv-bajo" : ""}>{r.cantidad} {r.unidad || "pza"}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="pv-der panel">
        <h3 className="pv-titulo">Venta de mostrador</h3>
        <div className="pv-carrito">
          {carrito.length === 0 && <div className="empty-state">Escanea o elige un producto para empezar.</div>}
          {carrito.map((l) => (
            <div key={l.id} className="pv-linea">
              <div className="pv-linea-nombre">
                <b>{l.nombre}</b>
                <small>{[l.codigo, l.ubic].filter(Boolean).join(" · ")}</small>
              </div>
              <div className="pv-cant">
                <button type="button" onClick={() => cambiarCant(l.id, -1)} aria-label="Menos">−</button>
                <span>{l.cantidad}</span>
                <button type="button" onClick={() => cambiarCant(l.id, 1)} aria-label="Más">+</button>
              </div>
              <input className="pv-precio" type="number" min="0" step="0.01" value={l.precio} onChange={(e) => cambiarPrecio(l.id, e.target.value)} title="Precio unitario" />
              <div className="pv-importe">{dinero((Number(l.precio) || 0) * l.cantidad)}</div>
              <button type="button" className="btn-icono btn-icono-peligro" title="Quitar" onClick={() => quitar(l.id)}><Icono nombre="close" size={16} /></button>
            </div>
          ))}
        </div>

        <div className="pv-pago">
          <div className="pv-fila">
            <input className="search-input" placeholder="Cliente (opcional)" value={cliente} onChange={(e) => setCliente(e.target.value)} />
            <select value={pago} onChange={(e) => setPago(e.target.value)}>{PAGOS.map((p) => <option key={p}>{p}</option>)}</select>
          </div>
          <div className="pv-fila">
            <input className="search-input" type="number" min="0" step="0.01" placeholder="Descuento $" value={descuento} onChange={(e) => setDescuento(e.target.value)} />
            {pago === "Efectivo" && <input className="search-input" type="number" min="0" step="0.01" placeholder="Efectivo recibido $" value={recibido} onChange={(e) => setRecibido(e.target.value)} />}
          </div>
          <input className="search-input" placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
          <div className="pv-totales">
            <div><span>Subtotal</span><span>{dinero(subtotal)}</span></div>
            {desc > 0 && <div><span>Descuento</span><span>−{dinero(desc)}</span></div>}
            {cambio !== null && <div className={faltaEfectivo ? "pv-bajo" : ""}><span>{faltaEfectivo ? "Falta" : "Cambio"}</span><span>{dinero(Math.abs(cambio))}</span></div>}
            <div className="pv-total"><span>TOTAL</span><span>{dinero(total)}</span></div>
          </div>
          <div className="pv-fila">
            <button type="button" className="btn btn-secondary" onClick={limpiar} disabled={!carrito.length}>Vaciar</button>
            <button type="button" className="btn btn-primary pv-cobrar" onClick={cobrar} disabled={!carrito.length || guardando || faltaEfectivo}>
              <Icono nombre="cash" size={18} /> {guardando ? "Cobrando…" : `Cobrar ${dinero(total)}`}
            </button>
          </div>
        </div>
      </div>

      {camara && <EscanerCamara onClose={() => setCamara(false)} onCodigo={(c) => { setCamara(false); if (!alEscanear(c)) notify(`No hay ningún producto con el código "${c}".`, "error"); }} />}

      {hecha && !pdf && (
        <ModalPortal>
          <div className="modal-backdrop">
            <div className="modal" style={{ maxWidth: 420, textAlign: "center" }}>
              <h2 style={{ fontSize: 20 }}>Venta #{hecha.folio} cobrada</h2>
              <div style={{ fontSize: 34, fontWeight: 800, margin: "6px 0" }}>{dinero(hecha.total)}</div>
              {hecha.cambio > 0 && <div style={{ fontSize: 18, color: "var(--teal-600)", fontWeight: 700 }}>Cambio {dinero(hecha.cambio)}</div>}
              <div className="modal-actions" style={{ justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => verPdf("ticket")}><Icono nombre="printer" size={16} /> Ticket</button>
                <button className="btn btn-secondary" onClick={() => verPdf("nota")}>Nota de venta</button>
                <button className="btn btn-secondary" onClick={() => setHecha(null)}>Nueva venta</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {pdf && <PdfModal url={pdf.url} titulo={pdf.titulo} nombre={pdf.nombre} onClose={() => setPdf(null)} />}
    </div>
  );
}
