import { contiene } from "../lib/texto";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, getToken } from "../api";
import FormModal from "../components/FormModal";
import ClienteFormModal from "../components/ClienteFormModal";
import FiltroChips from "../components/FiltroChips";
import BuscadorSelect from "../components/BuscadorSelect";
import Combo from "../components/Combo";
import ModalPortal from "../components/ModalPortal";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import IconoModulo from "../components/IconoModulo";
import { Icono, IconoAuto } from "../components/Icono";

function BloqueNota({ icono, titulo, acento, accion, children }) {
  return (
    <div className={`nota-bloque ${acento ? `acento-${acento}` : ""}`}>
      <div className="nota-bloque-header">
        <span className="icono"><IconoAuto valor={icono} size={18} /></span>
        <h2>{titulo}</h2>
        {accion}
      </div>
      <div className="nota-bloque-body">{children}</div>
    </div>
  );
}

/* Elegir cliente y vehículo para una cotización — a diferencia de la orden
   de servicio, los dos son opcionales: se puede dejar solo el vehículo (sin
   dueño capturado) o ninguno de los dos. */
function ElegirClienteVehiculoCotizacion({ idCliente: cli0, idVehiculo: veh0, vehiculoTexto: txt0, vehiculoPlacas: pla0, vehiculoKm: km0, onConfirmar, onCerrar }) {
  const { hasPermission } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [idCliente, setIdCliente] = useState(cli0 || "");
  const [idVehiculo, setIdVehiculo] = useState(veh0 || "");
  // Vehículo capturado a mano: vive solo en la cotización, no en el catálogo.
  // Marca y modelo salen de los catálogos, pero solo para armar el texto.
  const [marcaSel, setMarcaSel] = useState("");
  const [modeloSel, setModeloSel] = useState("");
  const [vehTextoLibre, setVehTextoLibre] = useState(txt0 || "");
  const [vehPlacas, setVehPlacas] = useState(pla0 || "");
  const [vehKm, setVehKm] = useState(km0 || "");
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const [c, v, m, mo] = await Promise.all([
      api.get("/clientes/?solo_activos=true"), api.get("/vehiculos/"),
      api.get("/vehiculos-marcas/"), api.get("/vehiculos-modelos/"),
    ]);
    setClientes(c); setVehiculos(v); setMarcas(m); setModelos(mo);
  }
  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && !nuevoCliente) onCerrar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [nuevoCliente, onCerrar]);

  // Si la cotización ya traía un vehículo escrito, se intenta reconocer su
  // marca y modelo en los catálogos para dejar los selects ya puestos.
  useEffect(() => {
    if (!txt0 || !marcas.length || !modelos.length || marcaSel || modeloSel) return;
    const t = txt0.toLowerCase();
    const m = marcas.find((x) => t.startsWith((x.nombre_marca || "").toLowerCase()));
    if (!m) return;
    setMarcaSel(m.id_marca_vehiculo);
    const mo = modelos.find((y) => y.id_marca_vehiculo === m.id_marca_vehiculo && t.includes((y.nombre_modelo || "").toLowerCase()));
    if (mo) setModeloSel(mo.id_modelo_vehiculo);
  }, [marcas, modelos, txt0]); // eslint-disable-line react-hooks/exhaustive-deps

  const nombreVeh = (v) => `${v.marca?.nombre_marca || ""} ${v.modelo?.nombre_modelo || ""}`.trim() || v.numero_cuenta;
  const cliente = clientes.find((c) => c.id_cliente === Number(idCliente));

  const opcionesCliente = useMemo(() => clientes.map((c) => ({
    value: c.id_cliente, label: `${c.nombre_cliente} ${c.paterno_cliente || ""}`.trim(),
    sub: [c.numero_cuenta, c.telefono1].filter(Boolean).join(" · "),
  })), [clientes]);
  const opcionesVehiculo = useMemo(() => vehiculos
    .filter((v) => !idCliente || v.id_cliente === Number(idCliente))
    .map((v) => ({ value: v.id_vehiculo, label: nombreVeh(v), sub: [v.placas_vehiculo, !idCliente && v.cliente?.nombre_cliente].filter(Boolean).join(" · ") })),
  [vehiculos, idCliente]);

  function elegirCliente(id) {
    setIdCliente(id);
    if (!id) return;
    const v = vehiculos.find((x) => x.id_vehiculo === Number(idVehiculo));
    if (v && v.id_cliente !== Number(id)) setIdVehiculo("");
  }
  function elegirVehiculo(id) {
    setIdVehiculo(id);
    if (id) quitarVehiculoEscrito();  // manda el del listado, no el capturado
    if (!id || idCliente) return;
    const v = vehiculos.find((x) => x.id_vehiculo === Number(id));
    if (v) setIdCliente(v.id_cliente); // autocompleta el dueño, sin forzarlo
  }

  // --- Vehículo capturado a mano (no se da de alta) ---
  const nombreMarcaSel = marcas.find((m) => m.id_marca_vehiculo === Number(marcaSel))?.nombre_marca || "";
  const nombreModeloSel = modelos.find((m) => m.id_modelo_vehiculo === Number(modeloSel))?.nombre_modelo || "";
  // Lo capturado manda sobre el texto que ya traía la cotización
  const vehTexto = `${nombreMarcaSel} ${nombreModeloSel}`.trim() || (marcaSel || modeloSel ? "" : vehTextoLibre);

  function elegirMarca(id) {
    const v = id ?? "";  // Combo manda null al limpiar
    setMarcaSel(v);
    const mo = modelos.find((m) => m.id_modelo_vehiculo === Number(modeloSel));
    if (mo && mo.id_marca_vehiculo !== Number(v)) setModeloSel("");  // el modelo ya no es de esa marca
    if (v) setIdVehiculo("");
    setVehTextoLibre("");
  }
  function elegirModelo(id) {
    const v = id ?? "";
    setModeloSel(v);
    const mo = modelos.find((m) => m.id_modelo_vehiculo === Number(v));
    if (mo) setMarcaSel(mo.id_marca_vehiculo);  // el modelo define la marca
    if (v) setIdVehiculo("");
    setVehTextoLibre("");
  }
  function quitarVehiculoEscrito() {
    setMarcaSel(""); setModeloSel(""); setVehTextoLibre(""); setVehPlacas(""); setVehKm("");
  }

  async function guardarCliente(values) {
    const creado = await api.post("/clientes/", values);
    setNuevoCliente(false);
    await cargar();
    setIdCliente(creado.id_cliente);
  }

  async function confirmar() {
    setGuardando(true);
    try {
      await onConfirmar({
        id_cliente: idCliente ? Number(idCliente) : null,
        id_vehiculo: idVehiculo ? Number(idVehiculo) : null,
        // Si se eligió uno del listado, el texto capturado se descarta
        vehiculo_texto: idVehiculo ? null : (vehTexto || null),
        vehiculo_placas: idVehiculo ? null : (vehPlacas || null),
        vehiculo_km: idVehiculo ? null : (vehKm || null),
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
        <div className="modal ecv-modal" style={{ maxWidth: 560, overflow: "visible" }}>
          <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={onCerrar}><Icono nombre="close" size={20} /></button>
          <div className="ecv-cabecera">
            <span className="ecv-icono"><Icono nombre="construct" size={22} /></span>
            <div><h2 className="ecv-titulo">Cliente y vehículo</h2><div className="subtitle">Ambos son opcionales. El vehículo capturado aquí no se agrega al listado de vehículos.</div></div>
          </div>
          <div className="ecv-pasos">
            <span className={"ecv-paso" + (idCliente ? " listo" : " activo")}>1 · Cliente{idCliente ? " ✓" : ""}</span>
            <span className={"ecv-paso" + (idVehiculo || vehTexto ? " listo" : idCliente ? " activo" : "")}>2 · Vehículo{idVehiculo || vehTexto ? " ✓" : ""}</span>
          </div>
          <BuscadorSelect label="Cliente" opciones={opcionesCliente} value={idCliente} onChange={elegirCliente} placeholder="Buscar por nombre, cuenta o teléfono…" />
          {hasPermission("clientes.crear") && (
            <button type="button" className="btn btn-secondary ecv-agregar" onClick={() => setNuevoCliente(true)}><Icono nombre="add" size={18} /> Agregar cliente nuevo</button>
          )}
          <BuscadorSelect label="Vehículo" opciones={opcionesVehiculo} value={idVehiculo} onChange={elegirVehiculo} placeholder="Buscar por marca, modelo o placas…" vacio={idCliente ? "Este cliente no tiene vehículos" : "Sin vehículos"} />
          {/* Si ya tomó uno del listado, capturar a mano solo estorba */}
          {!idVehiculo && (<>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 10px", opacity: 0.75, fontSize: 12 }}>
            <span style={{ flex: 1, height: 1, background: "currentColor", opacity: 0.25 }} />
            <span>o captúralo solo para esta cotización</span>
            <span style={{ flex: 1, height: 1, background: "currentColor", opacity: 0.25 }} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Marca</label>
              <Combo value={marcaSel} onChange={elegirMarca} placeholder="Sin capturar"
                opciones={marcas.map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca }))} />
            </div>
            <div className="field">
              <label>Modelo</label>
              <Combo value={modeloSel} onChange={elegirModelo} placeholder="Sin capturar"
                opciones={modelos.filter((m) => !marcaSel || m.id_marca_vehiculo === Number(marcaSel)).map((m) => ({
                  value: m.id_modelo_vehiculo,
                  label: marcaSel ? m.nombre_modelo : `${marcas.find((x) => x.id_marca_vehiculo === m.id_marca_vehiculo)?.nombre_marca || ""} ${m.nombre_modelo}`.trim(),
                }))} />
            </div>
            <div className="field">
              <label>Placas</label>
              <input value={vehPlacas} onChange={(e) => { setVehPlacas(e.target.value); if (e.target.value) setIdVehiculo(""); }} placeholder="Opcional" />
            </div>
            <div className="field">
              <label>Kilometraje</label>
              <input value={vehKm} onChange={(e) => { setVehKm(e.target.value); if (e.target.value) setIdVehiculo(""); }} placeholder="Opcional" inputMode="numeric" />
            </div>
          </div>
          {(vehTexto || vehPlacas || vehKm) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
              <span className="badge badge-teal" style={{ flex: 1, textAlign: "left" }}>
                Se guardará: {[vehTexto || "(sin marca ni modelo)", vehPlacas && `Placas ${vehPlacas}`, vehKm && `${vehKm} km`].filter(Boolean).join(" · ")}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={quitarVehiculoEscrito} title="Quitar lo capturado">
                <Icono nombre="close" size={16} />
              </button>
            </div>
          )}
          </>)}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmar} disabled={guardando}>{guardando ? "Guardando…" : "Aceptar y continuar"}</button>
          </div>
        </div>
      </div>
      {nuevoCliente && <ClienteFormModal title="Nuevo cliente" initialValues={{}} onSubmit={guardarCliente} onClose={() => setNuevoCliente(false)} />}
    </ModalPortal>
  );
}

// Logotipo de WhatsApp (silueta de burbuja con teléfono)
function IconoWhatsApp({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

export default function CotizacionDetalle() {
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const { notify, confirmDialog } = useUI();
  const [cotizacion, setCotizacion] = useState(null);
  const [refacciones, setRefacciones] = useState([]);
  const [categoriasRefaccion, setCategoriasRefaccion] = useState([]);
  const [datosTaller, setDatosTaller] = useState(null);
  const [comentarios, setComentarios] = useState("");
  const [guardandoComentarios, setGuardandoComentarios] = useState(false);
  const [addingDetalle, setAddingDetalle] = useState(false);
  const [busquedaMulti, setBusquedaMulti] = useState("");
  const [filtroCategoriaMulti, setFiltroCategoriaMulti] = useState([]);
  const [seleccionMultiple, setSeleccionMultiple] = useState({});
  const [guardandoMultiple, setGuardandoMultiple] = useState(false);
  const [creandoRefaccion, setCreandoRefaccion] = useState(null);
  const [descargando, setDescargando] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [eligiendoCV, setEligiendoCV] = useState(false);
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [tituloTemp, setTituloTemp] = useState("");
  const [sobreDetalleIdx, setSobreDetalleIdx] = useState(null);
  const dragDetalleRef = useRef(null);

  async function load() {
    const c = await api.get(`/cotizaciones/${id}`);
    setCotizacion(c);
    setComentarios(c.comentarios || "");
  }

  useEffect(() => {
    load();
    api.get("/refacciones/").then(setRefacciones).catch(() => setRefacciones([]));
    api.get("/refacciones-categorias/").then(setCategoriasRefaccion).catch(() => setCategoriasRefaccion([]));
    api.get("/configuracion-taller/").then(setDatosTaller).catch(() => setDatosTaller(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!cotizacion) return <div className="loading-text">Cargando…</div>;

  const fmt = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
  const puedeEditar = hasPermission("cotizaciones.editar");

  async function cambiarIva(aplicar) {
    try {
      const actualizada = await api.put(`/cotizaciones/${id}`, { iva_porcentaje: aplicar ? 16 : 0 });
      setCotizacion(actualizada);
      notify(aplicar ? "Se aplicará IVA (16%) a esta cotización." : "Se quitó el IVA de esta cotización.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function guardarTitulo(valor) {
    const limpio = valor.trim();
    setEditandoTitulo(false);
    if (!limpio || limpio === cotizacion.titulo) return;
    try {
      const actualizada = await api.put(`/cotizaciones/${id}`, { titulo: limpio });
      setCotizacion(actualizada);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function guardarClienteVehiculo(datos) {
    try {
      const actualizada = await api.put(`/cotizaciones/${id}`, datos);
      setCotizacion(actualizada);
      setEligiendoCV(false);
      notify("Cliente y vehículo guardados en la cotización.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function guardarComentarios() {
    setGuardandoComentarios(true);
    try {
      const actualizada = await api.put(`/cotizaciones/${id}`, { comentarios: comentarios.trim() || null });
      setCotizacion(actualizada);
      notify("Comentarios guardados.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardandoComentarios(false);
    }
  }

  async function handleUpdateDetalle(detalleId, cambios) {
    try {
      const actualizada = await api.put(`/cotizaciones/${id}/detalles/${detalleId}`, cambios);
      setCotizacion(actualizada);
    } catch (err) {
      notify(err.message, "error");
      load();
    }
  }

  async function handleDeleteDetalle(detalleId) {
    try {
      const actualizada = await api.del(`/cotizaciones/${id}/detalles/${detalleId}`);
      setCotizacion(actualizada);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function borrarTodasRefacciones() {
    const n = cotizacion.detalles.length;
    const ok = await confirmDialog(`¿Borrar ${n === 1 ? "la refacción" : `las ${n} refacciones`} de esta cotización? Esta acción no se puede deshacer.`, { danger: true, confirmar: "Sí, borrar" });
    if (!ok) return;
    try {
      const actualizada = await api.del(`/cotizaciones/${id}/detalles`);
      setCotizacion(actualizada);
      notify("Se quitaron todas las refacciones de la cotización.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function reordenarDetalles(idxDesde, idxHasta) {
    if (idxDesde === idxHasta) return;
    const lista = [...cotizacion.detalles];
    const [movido] = lista.splice(idxDesde, 1);
    lista.splice(idxHasta, 0, movido);
    setCotizacion((c) => ({ ...c, detalles: lista }));
    try {
      await Promise.all(lista.map((d, i) => api.put(`/cotizaciones/${id}/detalles/${d.id_cotizacion_detalle}`, { orden: i })));
    } catch (err) {
      notify(err.message, "error");
      load();
    }
  }

  function alternarSeleccionMultiple(idRefaccion, marcada) {
    setSeleccionMultiple((prev) => {
      const copia = { ...prev };
      if (marcada) copia[idRefaccion] = { cantidad: prev[idRefaccion]?.cantidad || 1 };
      else delete copia[idRefaccion];
      return copia;
    });
  }

  function cambiarCantidadMultiple(idRefaccion, cantidad) {
    setSeleccionMultiple((prev) => ({ ...prev, [idRefaccion]: { cantidad: Math.max(1, Number(cantidad) || 1) } }));
  }

  // No descuenta inventario (una cotización no compromete nada todavía) —
  // a diferencia de la orden, aquí basta con guardar los renglones.
  async function guardarRefacciones(seleccion) {
    const idsSeleccionados = Object.keys(seleccion);
    if (idsSeleccionados.length === 0) return false;
    try {
      let actualizada = cotizacion;
      for (const idStr of idsSeleccionados) {
        const refaccion = refacciones.find((r) => r.id_refaccion === Number(idStr));
        const cant = seleccion[idStr].cantidad;
        actualizada = await api.post(`/cotizaciones/${id}/detalles`, {
          id_refaccion: Number(idStr),
          descripcion: refaccion?.nombre_refaccion || null,
          cantidad: cant,
          costo_refaccion: (refaccion?.preciocliente_refaccion ?? 0) * cant,
          costo_extra: 0,
        });
      }
      setCotizacion(actualizada);
      return true;
    } catch (err) {
      notify(err.message, "error");
      return false;
    }
  }

  async function guardarSeleccionMultiple() {
    const idsSeleccionados = Object.keys(seleccionMultiple);
    if (idsSeleccionados.length === 0) {
      notify("Elige al menos una refacción para agregar.", "error");
      return;
    }
    setGuardandoMultiple(true);
    try {
      const ok = await guardarRefacciones(seleccionMultiple);
      if (ok) {
        notify(`${idsSeleccionados.length} refacción(es) agregadas a la cotización.`, "success");
        setAddingDetalle(false);
        setSeleccionMultiple({});
        setBusquedaMulti("");
        setFiltroCategoriaMulti([]);
      }
    } finally {
      setGuardandoMultiple(false);
    }
  }

  // Un clic en "+" agrega esa única refacción (cantidad 1) y cierra el modal de inmediato.
  async function agregarRapido(r) {
    setGuardandoMultiple(true);
    try {
      const ok = await guardarRefacciones({ [r.id_refaccion]: { cantidad: 1 } });
      if (ok) {
        setAddingDetalle(false);
        setSeleccionMultiple({});
        setBusquedaMulti("");
        setFiltroCategoriaMulti([]);
      }
    } finally {
      setGuardandoMultiple(false);
    }
  }

  function fieldsNuevaRefaccion() {
    return [
      { name: "nombre_refaccion", label: "Nombre", required: true, full: true, grupo: "general" },
      {
        name: "__id_categoria", label: "Categoría", type: "select", required: true, grupo: "general", full: true, grande: true,
        options: categoriasRefaccion.map((c) => ({ value: c.id_categoria_refaccion, label: c.nombre_categoria })),
        creatable: hasPermission("catalogos.crear")
          ? {
              endpoint: "/refacciones-categorias/", createField: "nombre_categoria", idField: "id_categoria_refaccion", label: "categoría",
              onCreated: (nueva) => setCategoriasRefaccion((prev) => [...prev, nueva]),
            }
          : null,
      },
    ];
  }

  async function handleCrearRefaccion(values) {
    const normTxt = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
    const nombreCat = values.__id_categoria ? categoriasRefaccion.find((c) => c.id_categoria_refaccion === Number(values.__id_categoria))?.nombre_categoria || null : null;
    const yaExiste = refacciones.some((r) => normTxt(r.categoria) === normTxt(nombreCat) && normTxt(r.nombre_refaccion) === normTxt(values.nombre_refaccion));
    if (yaExiste) throw new Error(`"${values.nombre_refaccion}" ya existe${nombreCat ? ` en ${nombreCat}` : ""}.`);
    const nueva = await api.post("/refacciones/", { nombre_refaccion: values.nombre_refaccion, categoria: nombreCat });
    setRefacciones((prev) => [...prev, nueva]);
    setSeleccionMultiple((prev) => ({ ...prev, [nueva.id_refaccion]: { cantidad: 1 } }));
    setCreandoRefaccion(null);
    notify(`"${nueva.nombre_refaccion}" se creó y quedó seleccionada — ajusta cantidad y precio o sigue agregando.`, "success");
  }

  async function obtenerPdfBlob() {
    const res = await fetch(`/api/cotizaciones/${id}/pdf`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || "No se pudo generar el documento.");
    }
    return res.blob();
  }

  // Imprimir: se genera el PDF y se manda a la impresora desde un marco oculto
  async function imprimirPdf() {
    setDescargando(true);
    try {
      const url = URL.createObjectURL(await obtenerPdfBlob());
      const marco = document.createElement("iframe");
      marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      marco.src = url;
      marco.onload = () => {
        try { marco.contentWindow.focus(); marco.contentWindow.print(); } catch { window.open(url, "_blank", "noopener"); }
        setTimeout(() => { URL.revokeObjectURL(url); marco.remove(); }, 60000);
      };
      document.body.appendChild(marco);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setDescargando(false);
    }
  }

  // WhatsApp: en celular se abre el menú de compartir con el PDF adjunto; en computadora el PDF se descarga
  // y se abre WhatsApp Web (con el chat del cliente si tiene teléfono, o para elegir el chat si no).
  async function enviarWhatsApp() {
    const digitos = String(cotizacion?.cliente?.telefono1 || "").replace(/\D/g, "").slice(-10);
    const nombre = cotizacion?.cliente?.nombre_cliente || "";
    const total = cotizacion?.costos?.total;
    const taller = datosTaller?.nombre_taller;
    const texto = `Hola${nombre ? ` ${nombre}` : ""}, te comparto la cotización "${cotizacion?.titulo || ""}"`
      + (total != null ? ` por $${Number(total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "")
      + (cotizacion?.vigente_hasta ? `, vigente hasta el ${new Date(cotizacion.vigente_hasta).toLocaleDateString("es-MX")}` : "")
      + `. ¡Gracias por tu preferencia!` + (taller ? `\n— ${taller}` : "");
    setDescargando(true);
    try {
      const blob = await obtenerPdfBlob();
      const nombrePdf = `cotizacion-${id}.pdf`;
      const archivo = new File([blob], nombrePdf, { type: "application/pdf" });
      const esMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      if (esMovil && navigator.canShare?.({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo], text: texto });
          return;
        } catch (err) {
          if (err?.name === "AbortError") return; // la persona cerró el menú de compartir
        }
      }
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombrePdf;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      const base = digitos.length === 10
        ? (esMovil ? `https://wa.me/52${digitos}` : `https://web.whatsapp.com/send?phone=52${digitos}`)
        : "https://wa.me/";
      const sep = base.includes("?") ? "&" : "?";
      window.open(`${base}${sep}text=${encodeURIComponent(texto)}`, "_blank", "noopener");
      notify(digitos.length === 10
        ? `La cotización se descargó como «${nombrePdf}». En WhatsApp adjúntala con el clip.`
        : `La cotización se descargó como «${nombrePdf}». Elige el chat en WhatsApp y adjúntala con el clip (el cliente no tiene teléfono registrado).`, "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setDescargando(false);
    }
  }

  async function descargarPdf(modo = "descargar") {
    // En navegadores de celular casi nunca hay un visor de PDF integrado
    // para <iframe> (a diferencia de Chrome de escritorio) — el modal con
    // vista previa se ve en blanco. En móvil, se manda directo a
    // descarga, que sí abre bien con el visor nativo del sistema.
    const esMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    setDescargando(true);
    try {
      const res = await fetch(`/api/cotizaciones/${id}/pdf`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo generar el documento.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (modo === "preview" && !esMovil) {
        setPdfPreviewUrl(url);
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = `cotizacion-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      if (modo === "preview") notify("Se descargó la cotización — tu celular la abre con su propio visor de PDF.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setDescargando(false);
    }
  }

  return (
    <>
      <div className="orden-hero">
        <div className="orden-hero-top">
          <div>
            <h1 className="orden-hero-titulo">
              <IconoModulo ruta="/cotizaciones" /> Cotización #{cotizacion.id_cotizacion}
            </h1>
            {editandoTitulo ? (
              <input
                className="orden-hero-nombre-input"
                autoFocus
                value={tituloTemp}
                onChange={(e) => setTituloTemp(e.target.value)}
                onBlur={() => guardarTitulo(tituloTemp)}
                onKeyDown={(e) => { if (e.key === "Enter") guardarTitulo(tituloTemp); if (e.key === "Escape") setEditandoTitulo(false); }}
              />
            ) : (
              <div
                className={`orden-hero-nombre${puedeEditar ? " orden-hero-nombre-editable" : ""}`}
                title={puedeEditar ? "Clic para cambiar el título de la cotización" : undefined}
                onClick={() => { if (!puedeEditar) return; setTituloTemp(cotizacion.titulo); setEditandoTitulo(true); }}
              >
                {cotizacion.titulo}
                {puedeEditar && <IconoAuto valor="✏️" size={13} />}
              </div>
            )}
            <div className="orden-cliente-vehiculo">
              {new Date(cotizacion.fecha_cotizacion).toLocaleDateString("es-MX")}
              {cotizacion.vigente_hasta && ` · Vigente hasta ${new Date(cotizacion.vigente_hasta).toLocaleDateString("es-MX")}`}
            </div>
          </div>
          <div className="orden-hero-herramientas cot-acciones-doc">
            <button type="button" className="btn btn-secondary" onClick={() => descargarPdf("preview")} disabled={descargando} title="Vista previa de la cotización en PDF">
              <IconoAuto valor="🔍" size={18} /> <span>{descargando ? "Generando…" : "Vista previa"}</span>
            </button>
            <button type="button" className="btn btn-secondary" onClick={imprimirPdf} disabled={descargando} title="Imprimir la cotización">
              <IconoAuto valor="🖨️" size={18} /> <span>Imprimir</span>
            </button>
            <button type="button" className="btn btn-whatsapp" onClick={enviarWhatsApp} disabled={descargando} title="Enviar la cotización por WhatsApp">
              <IconoWhatsApp size={20} /> <span>WhatsApp</span>
            </button>
          </div>
        </div>

        <div className="orden-hero-grid">
          <div className="orden-hero-bloque" style={{ "--acc": "var(--teal-600)", "--acc-soft": "var(--teal-100)", cursor: puedeEditar ? "pointer" : "default" }}
            onClick={() => puedeEditar && setEligiendoCV(true)} title={puedeEditar ? "Elegir o cambiar el cliente y el vehículo (opcional)" : undefined}>
            <span className="orden-hero-icono"><IconoAuto valor="🧑" size={22} /></span>
            <div>
              <div className="orden-hero-etiqueta">Cliente</div>
              <div className="orden-hero-valor">{cotizacion.cliente ? `${cotizacion.cliente.nombre_cliente} ${cotizacion.cliente.paterno_cliente || ""}` : "Sin cliente (opcional)"}</div>
              <div className="orden-hero-meta">{cotizacion.cliente?.numero_cuenta}{cotizacion.cliente?.telefono1 ? ` · ${cotizacion.cliente.telefono1}` : ""}</div>
            </div>
          </div>
          <div className="orden-hero-bloque" style={{ "--acc": "var(--blue-600)", "--acc-soft": "var(--blue-100)", cursor: puedeEditar ? "pointer" : "default" }}
            onClick={() => puedeEditar && setEligiendoCV(true)} title={puedeEditar ? "Elegir o cambiar el cliente y el vehículo (opcional)" : undefined}>
            <span className="orden-hero-icono"><IconoAuto valor="🚗" size={22} /></span>
            <div>
              <div className="orden-hero-etiqueta">Vehículo</div>
              <div className="orden-hero-valor">
                {[cotizacion.vehiculo?.marca?.nombre_marca, cotizacion.vehiculo?.modelo?.nombre_modelo].filter(Boolean).join(" ") || cotizacion.vehiculo_texto || "Sin vehículo (opcional)"}
              </div>
              <div className="orden-hero-meta">
                {cotizacion.vehiculo
                  ? `${cotizacion.vehiculo.numero_cuenta}${cotizacion.vehiculo.placas_vehiculo ? ` · Placas ${cotizacion.vehiculo.placas_vehiculo}` : ""}`
                  : [cotizacion.vehiculo_placas && `Placas ${cotizacion.vehiculo_placas}`, cotizacion.vehiculo_km && `${cotizacion.vehiculo_km} km`].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
        </div>
      </div>

      {datosTaller && (
        <BloqueNota icono="🏢" titulo="Datos del taller">
          <dl className="datos-lista">
            <dt>Nombre</dt><dd>{datosTaller.nombre_taller || "—"}</dd>
            <dt>Dirección</dt><dd>{datosTaller.direccion || "—"}</dd>
            <dt>Teléfono</dt><dd>{datosTaller.telefono || "—"}</dd>
            <dt>RFC</dt><dd>{datosTaller.rfc || "—"}</dd>
          </dl>
        </BloqueNota>
      )}

      <BloqueNota
        icono="🔧"
        titulo="Refacciones"
        accion={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {puedeEditar && cotizacion.detalles.length > 0 && (
              <button className="btn btn-agregar btn-borrar-todo" onClick={borrarTodasRefacciones}>
                <Icono nombre="trash" size={18} /> Borrar todas
              </button>
            )}
            {puedeEditar && (
              <button className="btn btn-agregar" onClick={() => setAddingDetalle(true)}>
                <Icono nombre="add" size={18} /> Agregar refacción
              </button>
            )}
          </div>
        }
      >
        {cotizacion.detalles.length === 0 ? (
          <div className="empty-state">Esta cotización todavía no tiene refacciones. Usa «Agregar refacción» para empezar.</div>
        ) : (
          <table className="tabla-refacciones">
            <thead>
              <tr>
                <th aria-label="Mover"></th>
                <th>Descripción</th>
                <th>Categoría</th>
                <th>Cantidad</th>
                <th>Precio unitario</th>
                <th>Precio final</th>
                <th aria-label="Acciones"></th>
              </tr>
            </thead>
            <tbody>
              {cotizacion.detalles.map((d, idx) => {
                const ref = refacciones.find((r) => r.id_refaccion === d.id_refaccion);
                const clave = ref?.categoria ? `${ref.categoria}${ref.subcategoria ? " / " + ref.subcategoria : ""}` : "Sin categoría";
                const puedeArrastrar = puedeEditar;
                return (
                  <tr
                    key={d.id_cotizacion_detalle}
                    className={`fila-arrastrable ${sobreDetalleIdx === idx ? "fila-sobre" : ""}`}
                    draggable={puedeArrastrar}
                    onDragStart={() => { dragDetalleRef.current = idx; }}
                    onDragOver={(e) => { if (!puedeArrastrar) return; e.preventDefault(); setSobreDetalleIdx(idx); }}
                    onDragLeave={() => setSobreDetalleIdx((v) => (v === idx ? null : v))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setSobreDetalleIdx(null);
                      if (dragDetalleRef.current == null) return;
                      reordenarDetalles(dragDetalleRef.current, idx);
                      dragDetalleRef.current = null;
                    }}
                    onDragEnd={() => { dragDetalleRef.current = null; setSobreDetalleIdx(null); }}
                  >
                    <td className="celda-arrastre">
                      {puedeArrastrar && <span className="asa-arrastre" title="Arrastra para reordenar"><Icono nombre="list" size={16} /></span>}
                    </td>
                    <td>{d.descripcion || "—"}</td>
                    <td className="celda-categoria"><span className="chip-cat-ref">{clave}</span></td>
                    <td>
                      <input
                        key={`c-${d.id_cotizacion_detalle}-${d.cantidad}`} type="number" defaultValue={d.cantidad || 1} disabled={!puedeEditar}
                        onBlur={(e) => { const v = Number(e.target.value) || 1; if (v !== d.cantidad) handleUpdateDetalle(d.id_cotizacion_detalle, { cantidad: v }); }}
                      />
                    </td>
                    <td>
                      <input
                        key={`u-${d.id_cotizacion_detalle}-${d.costo_refaccion}-${d.cantidad}`} type="number" step="0.01"
                        defaultValue={Math.round(((d.costo_refaccion || 0) / (d.cantidad || 1)) * 100) / 100} disabled={!puedeEditar}
                        onBlur={(e) => {
                          const v = Number(e.target.value) || 0;
                          const cant = d.cantidad || 1;
                          if (v === 0) { handleUpdateDetalle(d.id_cotizacion_detalle, { costo_refaccion: 0, cantidad: 1 }); return; }
                          const total = Math.round(v * cant * 100) / 100;
                          if (total !== d.costo_refaccion) handleUpdateDetalle(d.id_cotizacion_detalle, { costo_refaccion: total, cantidad: cant });
                        }}
                      />
                    </td>
                    <td className="celda-total">{fmt((d.costo_refaccion || 0) + (d.costo_extra || 0))}</td>
                    <td>
                      {puedeEditar && <button className="btn btn-danger btn-sm" title="Quitar" aria-label="Quitar" onClick={() => handleDeleteDetalle(d.id_cotizacion_detalle)}><Icono nombre="trash" size={18} /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </BloqueNota>

      <div className="saldo-flotante saldo-flotante-abierta">
        <div className="saldo-flotante-fila">
          <div className="saldo-flotante-detalle">
            <div className="saldo-flotante-detalle-item">
              <span className="saldo-flotante-detalle-etq">Subtotal</span>
              <span className="saldo-flotante-detalle-val mono">{fmt(cotizacion.costos.subtotal)}</span>
            </div>
            <div className="saldo-flotante-detalle-item">
              <span className="saldo-flotante-detalle-etq">IVA ({cotizacion.iva_porcentaje}%)</span>
              <span className="saldo-flotante-detalle-val mono">{fmt(cotizacion.costos.iva)}</span>
            </div>
            <div className="saldo-flotante-detalle-item">
              <span className="saldo-flotante-detalle-etq">Total</span>
              <span className="saldo-flotante-detalle-val mono">{fmt(cotizacion.costos.total)}</span>
            </div>
          </div>
          <div className="saldo-flotante-iva-zona">
            {puedeEditar && (
              <label className="saldo-flotante-iva">
                <span className="switch-moderno">
                  <input
                    type="checkbox"
                    checked={cotizacion.iva_porcentaje > 0}
                    onChange={(e) => cambiarIva(e.target.checked)}
                  />
                  <span className="switch-moderno-track" />
                  <span className="switch-moderno-thumb" />
                </span>
                <span>Aplicar IVA (16%)</span>
              </label>
            )}
          </div>
          <span className="saldo-flotante-monto mono">{fmt(cotizacion.costos.total)}</span>
        </div>
      </div>

      <BloqueNota icono="📝" titulo="Comentarios">
        <div className="field full">
          <label>Notas o condiciones del presupuesto</label>
          <textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} disabled={!puedeEditar} />
        </div>
        {puedeEditar && (
          <button className="btn btn-secondary btn-sm" onClick={guardarComentarios} disabled={guardandoComentarios}>
            {guardandoComentarios ? "Guardando…" : "Guardar comentarios"}
          </button>
        )}
      </BloqueNota>

      {pdfPreviewUrl && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); } }}>
          <div className="modal modal-pdf">
            <div className="modal-pdf-header">
              <span><IconoAuto valor="📄" size={18} /> Vista previa de la cotización</span>
              <div style={{ display: "flex", gap: 10 }}>
                <a className="btn btn-secondary btn-sm" href={pdfPreviewUrl} download={`cotizacion-${id}.pdf`}>Descargar</a>
                <button className="btn btn-secondary btn-sm" onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}>Cerrar <IconoAuto valor="✕" size={18} /></button>
              </div>
            </div>
            <iframe src={pdfPreviewUrl} title="Vista previa de la cotización" className="modal-pdf-frame" />
          </div>
        </div>
        </ModalPortal>
      )}

      {eligiendoCV && (
        <ElegirClienteVehiculoCotizacion
          idCliente={cotizacion.id_cliente}
          idVehiculo={cotizacion.id_vehiculo}
          vehiculoTexto={cotizacion.vehiculo_texto}
          vehiculoPlacas={cotizacion.vehiculo_placas}
          vehiculoKm={cotizacion.vehiculo_km}
          onConfirmar={guardarClienteVehiculo}
          onCerrar={() => setEligiendoCV(false)}
        />
      )}

      {addingDetalle && (() => {
        const q = busquedaMulti.trim().toLowerCase();
        const refaccionesFiltradas = refacciones.filter((r) =>
          (filtroCategoriaMulti.length === 0 || filtroCategoriaMulti.includes(r.categoria || "Sin categoría")) &&
          (!q || contiene(r.nombre_refaccion || "", q))
        );
        const idsEnCotizacion = new Set((cotizacion.detalles || []).map((d) => d.id_refaccion));
        const conteoCat = {};
        refacciones.forEach((r) => { const k = r.categoria || "Sin categoría"; conteoCat[k] = (conteoCat[k] || 0) + 1; });
        const grupos = {};
        refaccionesFiltradas.forEach((r) => {
          const clave = r.categoria || "Sin categoría";
          if (!grupos[clave]) grupos[clave] = [];
          grupos[clave].push(r);
        });
        const clavesOrdenadas = Object.keys(grupos).sort((a, b) => (a === "Sin categoría" ? 1 : b === "Sin categoría" ? -1 : a.localeCompare(b)));
        const totalMarcadas = Object.keys(seleccionMultiple).length;
        const cerrar = () => { setAddingDetalle(false); setSeleccionMultiple({}); setBusquedaMulti(""); setFiltroCategoriaMulti([]); };
        return (
          <ModalPortal>
          <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && cerrar()}>
            <div className="modal modal-grande add-ref">
              <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={cerrar}><Icono nombre="close" size={20} /></button>
              <div className="add-ref-cab">
                <h2>Agregar refacciones</h2>
                <input className="add-ref-buscar" placeholder="Buscar refacción…" value={busquedaMulti} onChange={(e) => setBusquedaMulti(e.target.value)} />
                {hasPermission("refacciones.crear") && (
                  <button type="button" className="btn btn-secondary btn-sm add-ref-nueva" onClick={() => setCreandoRefaccion({})}>
                    <Icono nombre="add" size={16} /> Nueva refacción
                  </button>
                )}
              </div>
              <FiltroChips multiple items={conteoCat} valor={filtroCategoriaMulti} onChange={setFiltroCategoriaMulti} total={refacciones.length} />

              <div className="tarjetas-refaccion-grid add-ref-grid">
                {refaccionesFiltradas.length === 0 ? (
                  <div className="empty-state">No hay refacciones que coincidan.</div>
                ) : (
                  clavesOrdenadas.map((clave) => (
                    <div key={`grupo-${clave}`} className="add-ref-grupo">
                      <div className="add-ref-grupo-titulo">{clave} <span>{grupos[clave].length}</span></div>
                      <div className="add-ref-tarjetas">
                        {grupos[clave].map((r) => {
                          const enCotizacion = idsEnCotizacion.has(r.id_refaccion);
                          const marcada = !!seleccionMultiple[r.id_refaccion];
                          const stock = r.cantidad_refaccion ?? 0;
                          const precio = r.preciocliente_refaccion || r.preciopropio_refaccion || 0;
                          const cant = seleccionMultiple[r.id_refaccion]?.cantidad || 1;
                          if (enCotizacion) {
                            return (
                              <div key={r.id_refaccion} className="add-ref-tarjeta agregada" title="Ya está en esta cotización">
                                <span className="add-ref-check agregada">✓</span>
                                <div className="add-ref-nombre">{r.nombre_refaccion}</div>
                                <div className="add-ref-meta">
                                  <span className="add-ref-aviso agregada">Ya en la cotización</span>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={r.id_refaccion} className={`add-ref-tarjeta ${marcada ? "on" : ""}`} onClick={() => alternarSeleccionMultiple(r.id_refaccion, !marcada)}>
                              {marcada ? (
                                <span className="add-ref-check">✓</span>
                              ) : (
                                <button
                                  type="button"
                                  className="add-ref-check add-ref-check-rapido"
                                  title="Agregar esta refacción de inmediato"
                                  aria-label="Agregar rápido"
                                  disabled={guardandoMultiple}
                                  onClick={(e) => { e.stopPropagation(); agregarRapido(r); }}
                                >
                                  +
                                </button>
                              )}
                              <div className="add-ref-nombre">{r.nombre_refaccion}</div>
                              <div className="add-ref-meta">
                                <span className={`add-ref-stock ${stock <= 0 ? "cero" : ""}`}>Stock {stock}</span>
                                {precio > 0 && <span className="add-ref-precio">${precio}</span>}
                                <span className={"add-ref-aviso add-ref-cantidad" + (marcada ? " on" : "")}>Cantidad {cant}</span>
                              </div>
                              {marcada && (
                                <div className="add-ref-cant" onClick={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => cambiarCantidadMultiple(r.id_refaccion, cant - 1)} aria-label="Menos">−</button>
                                  <input type="number" min={1} value={cant} onChange={(e) => cambiarCantidadMultiple(r.id_refaccion, e.target.value)} />
                                  <button type="button" onClick={() => cambiarCantidadMultiple(r.id_refaccion, cant + 1)} aria-label="Más">+</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={cerrar}>{totalMarcadas > 0 ? "Cancelar" : "Cerrar"}</button>
                <button className="btn btn-primary" onClick={guardarSeleccionMultiple} disabled={guardandoMultiple || totalMarcadas === 0}>
                  {guardandoMultiple ? "Agregando…" : totalMarcadas ? `Agregar ${totalMarcadas} a la cotización` : "Elige refacciones"}
                </button>
              </div>
            </div>
          </div>
          </ModalPortal>
        );
      })()}

      {creandoRefaccion && (
        <FormModal
          title="Nueva refacción"
          icono="⚙️"
          subtitulo="Se agrega al catálogo y queda seleccionada para esta cotización."
          compacto
          fields={fieldsNuevaRefaccion}
          grupos={{ general: { icono: "⚙️", titulo: "Datos generales" } }}
          initialValues={creandoRefaccion}
          onSubmit={handleCrearRefaccion}
          onClose={() => setCreandoRefaccion(null)}
        />
      )}
    </>
  );
}
