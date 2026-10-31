import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getToken } from "../api";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import BuscadorSelect from "../components/BuscadorSelect";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";
import ModalPortal from "../components/ModalPortal";
import "./notaRapida.css";

const fmt = (n) => (Number(n) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const num = (v) => (v === "" || v == null ? 0 : Number(v) || 0);
let consecutivo = 0;

// Nota rápida ⚡: cliente y vehículo opcionales, conceptos, total y a imprimir o enviar.
// Por dentro crea la orden, descuenta inventario, cobra y la cierra en un solo paso.
export default function NotaRapida() {
  const { notify } = useUI();
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [refacciones, setRefacciones] = useState([]);
  const [idCliente, setIdCliente] = useState("");
  const [idVehiculo, setIdVehiculo] = useState("");
  const [lineas, setLineas] = useState([]);
  const [iva, setIva] = useState(false);
  const [pago, setPago] = useState("efectivo");
  const [recibido, setRecibido] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [notificar, setNotificar] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const [telefono, setTelefono] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [nueva, setNueva] = useState(null); // { nombre, categoria, precio, guardando, error } = alta rápida de refacción
  const puedeCrearRef = hasPermission("refacciones.crear");

  useEffect(() => {
    api.get("/clientes/?solo_activos=true").then(setClientes).catch(() => {});
    api.get("/vehiculos/").then(setVehiculos).catch(() => {});
    api.get("/refacciones/").then(setRefacciones).catch(() => {});
    api.get("/refacciones-categorias/").then(setCategorias).catch(() => {});
  }, []);

  const cliente = clientes.find((c) => c.id_cliente === Number(idCliente));
  const nombreVeh = (v) => `${v.marca?.nombre_marca || ""} ${v.modelo?.nombre_modelo || ""}`.trim() || v.numero_cuenta;
  const opcionesCliente = useMemo(() => clientes.map((c) => ({
    value: c.id_cliente, label: `${c.nombre_cliente} ${c.paterno_cliente || ""}`.trim(), sub: [c.numero_cuenta, c.telefono1].filter(Boolean).join(" · "),
  })), [clientes]);
  const opcionesVehiculo = useMemo(() => vehiculos
    .filter((v) => !idCliente || v.id_cliente === Number(idCliente))
    .map((v) => ({ value: v.id_vehiculo, label: nombreVeh(v), sub: [v.placas_vehiculo, !idCliente && v.cliente?.nombre_cliente].filter(Boolean).join(" · ") })),
  [vehiculos, idCliente]);
  const opcionesRef = useMemo(() => refacciones.map((r) => ({
    value: r.id_refaccion, label: r.nombre_refaccion,
    sub: [fmt(r.preciocliente_refaccion || r.preciopropio_refaccion || 0), `stock ${r.cantidad_refaccion ?? 0}`].join(" · "),
  })), [refacciones]);

  function elegirCliente(id) { setIdCliente(id); setIdVehiculo(""); }
  function elegirVehiculo(id) {
    setIdVehiculo(id);
    const v = vehiculos.find((x) => x.id_vehiculo === Number(id));
    if (v && !idCliente) setIdCliente(v.id_cliente);
  }

  function agregarRef(id) {
    const r = refacciones.find((x) => x.id_refaccion === Number(id));
    if (!r) return;
    setLineas((prev) => {
      const ya = prev.find((l) => l.id_refaccion === r.id_refaccion);
      if (ya) return prev.map((l) => (l === ya ? { ...l, cantidad: num(l.cantidad) + 1 } : l));
      return [...prev, { k: ++consecutivo, id_refaccion: r.id_refaccion, descripcion: r.nombre_refaccion, stock: r.cantidad_refaccion ?? 0, cantidad: 1, precio: String(r.preciocliente_refaccion || r.preciopropio_refaccion || "") }];
    });
  }
  const nombresCat = useMemo(() => {
    const set = new Set(categorias.map((c) => c.nombre_categoria));
    refacciones.forEach((r) => r.categoria && set.add(r.categoria));
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [categorias, refacciones]);

  async function crearRefaccion() {
    const nombre = nueva.nombre.trim();
    const categoria = nueva.categoria.trim();
    const precio = num(nueva.precio);
    const falla = !nombre ? "Escribe el nombre." : !categoria ? "Elige o escribe la categoría." : precio <= 0 ? "Captura el precio de venta." : "";
    if (falla) { setNueva({ ...nueva, error: falla }); return; }
    const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const repetida = refacciones.find((r) => norm(r.nombre_refaccion) === norm(nombre) && norm(r.categoria) === norm(categoria));
    if (repetida) { agregarRef(repetida.id_refaccion); setNueva(null); return; }
    setNueva({ ...nueva, guardando: true, error: "" });
    try {
      // La categoría nueva se da de alta sola, para que no haya que ir al catálogo
      if (!nombresCat.some((c) => norm(c) === norm(categoria))) {
        try { const c = await api.post("/refacciones-categorias/", { nombre_categoria: categoria }); setCategorias((p) => [...p, c]); } catch { /* la refacción guarda el texto igual */ }
      }
      const r = await api.post("/refacciones/", { nombre_refaccion: nombre, categoria, preciocliente_refaccion: precio });
      setRefacciones((p) => [...p, r]);
      setLineas((prev) => [...prev, { k: ++consecutivo, id_refaccion: r.id_refaccion, descripcion: r.nombre_refaccion, stock: r.cantidad_refaccion ?? 0, cantidad: 1, precio: String(precio) }]);
      setNueva(null);
      notify(`«${r.nombre_refaccion}» se agregó al catálogo y a la nota.`, "success");
    } catch (e) {
      setNueva({ ...nueva, guardando: false, error: e.message });
    }
  }

  const agregarMO = () => setLineas((prev) => [...prev, { k: ++consecutivo, id_refaccion: null, descripcion: "", cantidad: 1, precio: "" }]);
  const cambiar = (k, campo, valor) => setLineas((prev) => prev.map((l) => (l.k === k ? { ...l, [campo]: valor } : l)));
  const quitar = (k) => setLineas((prev) => prev.filter((l) => l.k !== k));

  const subtotal = lineas.reduce((s, l) => s + num(l.cantidad) * num(l.precio), 0);
  const montoIva = iva ? subtotal * 0.16 : 0;
  const total = subtotal + montoIva;
  const cambio = pago === "efectivo" && recibido !== "" ? Math.max(num(recibido) - total, 0) : 0;
  const faltan = pago === "efectivo" && recibido !== "" ? Math.max(total - num(recibido), 0) : 0;

  function validar() {
    if (lineas.length === 0) return "Agrega al menos un concepto.";
    for (const l of lineas) {
      if (!l.id_refaccion && !String(l.descripcion).trim()) return "Escribe la descripción de la mano de obra.";
      if (num(l.precio) <= 0) return `«${l.descripcion || "Un concepto"}» no tiene precio.`;
      if (num(l.cantidad) < 1) return `«${l.descripcion}» necesita cantidad.`;
    }
    if (faltan > 0.005) return `Faltan ${fmt(faltan)} para cubrir el total.`;
    return "";
  }

  async function generar() {
    const msg = validar();
    setError(msg);
    if (msg) return;
    setGuardando(true);
    try {
      const res = await api.post("/servicios/rapida", {
        id_cliente: idCliente ? Number(idCliente) : null,
        id_vehiculo: idVehiculo ? Number(idVehiculo) : null,
        lineas: lineas.map((l) => ({ id_refaccion: l.id_refaccion, descripcion: l.descripcion, cantidad: Math.max(1, Math.round(num(l.cantidad))), precio_unitario: num(l.precio) })),
        aplicar_iva: iva, tipo_pago: pago,
        monto_recibido: pago === "efectivo" && recibido !== "" ? num(recibido) : null,
        comentarios: comentarios.trim() || null,
        notificar_cliente: !!cliente && notificar,
      });
      (res.servicio.alertas_stock || []).forEach((a) => notify(`${a.nivel === "critico" ? "Stock crítico" : "Stock bajo"}: «${a.nombre_refaccion}», quedan ${a.cantidad_actual}`, a.nivel === "critico" ? "error" : "info"));
      setTelefono(cliente?.telefono1 || "");
      setResultado(res);
    } catch (e) {
      setError(e.message);
      notify(e.message, "error");
    } finally {
      setGuardando(false);
    }
  }

  function reiniciar() {
    setIdCliente(""); setIdVehiculo(""); setLineas([]); setIva(false); setPago("efectivo"); setRecibido("");
    setComentarios(""); setNotificar(true); setError(""); setResultado(null); setTelefono("");
    api.get("/refacciones/").then(setRefacciones).catch(() => {}); // el stock cambió
  }

  const idOrden = resultado?.servicio?.id_servicio;
  const nombrePdf = () => {
    const cli = [cliente?.nombre_cliente, cliente?.paterno_cliente].filter(Boolean).join(" ") || `rápida ${idOrden}`;
    return `${["Nota", cli].join(" - ").replace(/[\\/:*?"<>|]/g, "")}.pdf`;
  };
  async function bajarPdf() {
    const res = await fetch(`/api/servicios/${idOrden}/nota-remision`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || "No se pudo generar la nota.");
    }
    return res.blob();
  }

  async function imprimir() {
    setOcupado(true);
    try {
      const url = URL.createObjectURL(await bajarPdf());
      const marco = document.createElement("iframe");
      marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      marco.src = url;
      marco.onload = () => {
        try { marco.contentWindow.focus(); marco.contentWindow.print(); } catch (e) { window.open(url, "_blank"); }
        setTimeout(() => { marco.remove(); URL.revokeObjectURL(url); }, 60000);
      };
      document.body.appendChild(marco);
    } catch (e) { notify(e.message, "error"); } finally { setOcupado(false); }
  }

  async function descargar() {
    setOcupado(true);
    try {
      const url = URL.createObjectURL(await bajarPdf());
      const a = document.createElement("a");
      a.href = url; a.download = nombrePdf(); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { notify(e.message, "error"); } finally { setOcupado(false); }
  }

  async function whatsapp() {
    const digitos = String(telefono || "").replace(/\D/g, "").slice(-10);
    if (digitos.length !== 10) { notify("Escribe un teléfono de 10 dígitos para enviar por WhatsApp.", "error"); return; }
    const texto = `Hola${cliente ? ` ${cliente.nombre_cliente}` : ""}, te comparto tu nota. ¡Gracias por tu confianza!${user?.taller ? `\n— ${user.taller}` : ""}`;
    setOcupado(true);
    try {
      const blob = await bajarPdf();
      const archivo = new File([blob], nombrePdf(), { type: "application/pdf" });
      const esMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      if (esMovil && navigator.canShare?.({ files: [archivo] })) {
        try { await navigator.share({ files: [archivo], text: texto }); return; } catch (err) { if (err?.name === "AbortError") return; }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = archivo.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      const destino = esMovil ? `https://wa.me/52${digitos}?` : `https://web.whatsapp.com/send?phone=52${digitos}&`;
      window.open(`${destino}text=${encodeURIComponent(texto)}`, "_blank", "noopener");
      notify(`Nota descargada como «${archivo.name}». Adjúntala en el chat de WhatsApp.`, "success");
    } catch (e) { notify(e.message, "error"); } finally { setOcupado(false); }
  }

  const modalNueva = nueva && (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !nueva.guardando && setNueva(null)}>
        <div className="modal nr-modal">
          <h2>Refacción nueva</h2>
          <div className="subtitle">Se guarda en el catálogo y se agrega a la nota.</div>
          <div className="field"><label>Nombre</label>
            <input autoFocus value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} /></div>
          <div className="field"><label>Categoría</label>
            <input list="nr-categorias" value={nueva.categoria} onChange={(e) => setNueva({ ...nueva, categoria: e.target.value })} placeholder="Elige una o escribe una nueva" />
            <datalist id="nr-categorias">{nombresCat.map((c) => <option key={c} value={c} />)}</datalist></div>
          <div className="field"><label>Precio de venta</label>
            <input type="number" min="0" step="any" value={nueva.precio} onChange={(e) => setNueva({ ...nueva, precio: e.target.value })} placeholder="0.00"
              onKeyDown={(e) => e.key === "Enter" && crearRefaccion()} /></div>
          {nueva.error && <div className="error-text">{nueva.error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setNueva(null)} disabled={nueva.guardando}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={crearRefaccion} disabled={nueva.guardando}>{nueva.guardando ? "Guardando…" : "Guardar y agregar"}</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );

  if (resultado) {
    const c = resultado.cambio || 0;
    return (
      <div className="nr-pagina">
        <div className="page-header"><div className="page-header-titulo"><h1><IconoModulo ruta="/nota-rapida" /> Nota lista</h1></div></div>
        <div className="panel nr-exito">
          <div className="nr-check" aria-hidden="true"><Icono nombre="check" size={34} /></div>
          <h2>Nota #{idOrden} generada</h2>
          <div className="nr-total-grande">{fmt(resultado.servicio.costos.total)}</div>
          {c > 0.005 && <div className="nr-cambio">Cambio a entregar: <b>{fmt(c)}</b></div>}
          <div className="nr-acciones">
            <button type="button" className="btn btn-primary" onClick={imprimir} disabled={ocupado}><Icono nombre="printer" size={18} /> Imprimir</button>
            <button type="button" className="btn btn-exito" onClick={whatsapp} disabled={ocupado}><Icono nombre="chatbubble" size={18} /> Enviar por WhatsApp</button>
            <button type="button" className="btn btn-secondary" onClick={descargar} disabled={ocupado}>Descargar PDF</button>
          </div>
          {!cliente?.telefono1 && (
            <div className="field nr-tel">
              <label>Teléfono para WhatsApp (10 dígitos)</label>
              <input inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Ej. 4771234567" />
            </div>
          )}
          <div className="nr-pie">
            <button type="button" className="btn btn-secondary" onClick={reiniciar}>⚡ Otra nota rápida</button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(`/servicios/${idOrden}`)}>Ver la orden</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nr-pagina">
      {modalNueva}
      <div className="page-header">
        <div className="page-header-titulo">
          <div>
            <h1><IconoModulo ruta="/nota-rapida" /> Nota rápida</h1>
            <div className="subtitle">Conceptos, total y a imprimir o enviar. <Link to="/servicios">¿Necesitas la orden completa?</Link></div>
          </div>
        </div>
      </div>

      <div className="nr-cols">
        <div className="nr-izq">
          <section className="panel nr-bloque">
            <h2>Cliente y vehículo <small>opcional</small></h2>
            <div className="nr-dos">
              <BuscadorSelect label="Cliente" opciones={opcionesCliente} value={idCliente} onChange={elegirCliente} placeholder="Sin cliente — buscar…" />
              <BuscadorSelect label="Vehículo" opciones={opcionesVehiculo} value={idVehiculo} onChange={elegirVehiculo} placeholder="Sin vehículo — buscar…" />
            </div>
          </section>

          <section className="panel nr-bloque">
            <h2>Conceptos</h2>
            <div className="nr-agregar">
              <BuscadorSelect label="Refacción del catálogo" opciones={opcionesRef} value="" onChange={agregarRef} placeholder="Buscar refacción para agregar…"
                onCrear={puedeCrearRef ? (t) => setNueva({ nombre: t, categoria: "", precio: "", guardando: false, error: "" }) : null} textoCrear="Agregar al catálogo" />
              <button type="button" className="btn btn-secondary" onClick={agregarMO}>＋ Mano de obra</button>
            </div>
            {lineas.length === 0 ? (
              <div className="nr-vacio">Agrega una refacción del catálogo o mano de obra.</div>
            ) : (
              <ul className="nr-lineas">
                {lineas.map((l) => (
                  <li key={l.k} className="nr-linea">
                    <div className="nr-linea-desc">
                      {l.id_refaccion ? <b>{l.descripcion}</b> : <input value={l.descripcion} onChange={(e) => cambiar(l.k, "descripcion", e.target.value)} placeholder="Mano de obra: ¿qué se hizo?" aria-label="Descripción" />}
                      {l.id_refaccion && num(l.cantidad) > l.stock && <small className="nr-aviso">Stock disponible: {l.stock}</small>}
                    </div>
                    <label className="nr-num"><span>Cant.</span><input type="number" min="1" step="1" value={l.cantidad} onChange={(e) => cambiar(l.k, "cantidad", e.target.value)} /></label>
                    <label className="nr-num"><span>Precio</span><input type="number" min="0" step="any" value={l.precio} onChange={(e) => cambiar(l.k, "precio", e.target.value)} placeholder="0.00" /></label>
                    <div className="nr-importe">{fmt(num(l.cantidad) * num(l.precio))}</div>
                    <button type="button" className="nr-x" onClick={() => quitar(l.k)} aria-label="Quitar concepto">×</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel nr-bloque">
            <h2>Comentarios para la nota <small>opcional</small></h2>
            <textarea rows={2} value={comentarios} onChange={(e) => setComentarios(e.target.value)} placeholder="Ej. Se recomienda revisar amortiguadores en la próxima visita." />
          </section>
        </div>

        <aside className="nr-der">
          <section className="panel nr-bloque nr-resumen">
            <div className="nr-fila"><span>Subtotal</span><b>{fmt(subtotal)}</b></div>
            <label className="nr-fila nr-iva"><span><input type="checkbox" checked={iva} onChange={(e) => setIva(e.target.checked)} /> Aplicar IVA 16%</span><b>{fmt(montoIva)}</b></label>
            <div className="nr-fila nr-total"><span>Total</span><b>{fmt(total)}</b></div>

            <div className="nr-pago" role="group" aria-label="Forma de pago">
              <button type="button" className={pago === "efectivo" ? "activo" : ""} onClick={() => setPago("efectivo")}>Efectivo</button>
              <button type="button" className={pago === "tarjeta" ? "activo" : ""} onClick={() => { setPago("tarjeta"); setRecibido(""); }}>Tarjeta</button>
            </div>
            {pago === "efectivo" && (
              <div className="field">
                <label>Efectivo recibido <small>(opcional, para el cambio)</small></label>
                <input type="number" min="0" step="any" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder={total.toFixed(2)} />
                {recibido !== "" && (faltan > 0.005
                  ? <div className="nr-aviso">Faltan {fmt(faltan)}</div>
                  : <div className="nr-cambio-lin">Cambio: <b>{fmt(cambio)}</b></div>)}
              </div>
            )}
            {cliente && (
              <label className="nr-avisar"><input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} /> Avisar al cliente por su app</label>
            )}
            {error && <div className="error-text">{error}</div>}
            <button type="button" className="btn btn-primary nr-generar" onClick={generar} disabled={guardando}>
              {guardando ? "Generando…" : `⚡ Cobrar ${fmt(total)} y generar nota`}
            </button>
            <small className="nr-nota">Se registra como orden cerrada y se descuenta el inventario.</small>
          </section>
        </aside>
      </div>
    </div>
  );
}
