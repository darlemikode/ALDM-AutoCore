import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getToken } from "../api";
import FormModal from "../components/FormModal";
import ModalPortal from "../components/ModalPortal";
import FotoGaleria from "../components/FotoGaleria";
import EstatusLateral from "../components/EstatusLateral";
import ChatOrden from "../components/ChatOrden";
import InspeccionForm from "../components/InspeccionForm";
import FinalizarOrdenModal from "../components/FinalizarOrdenModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";

function BloqueNota({ icono, titulo, acento, accion, children }) {
  return (
    <div className={`nota-bloque ${acento ? `acento-${acento}` : ""}`}>
      <div className="nota-bloque-header">
        <span className="icono">{icono}</span>
        <h2>{titulo}</h2>
        {accion}
      </div>
      <div className="nota-bloque-body">{children}</div>
    </div>
  );
}

export default function ServicioDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { confirmDialog, notify } = useUI();
  const { hasPermission } = useAuth();
  const [servicio, setServicio] = useState(null);
  const [comentariosFinales, setComentariosFinales] = useState("");
  const [guardandoComentarios, setGuardandoComentarios] = useState(false);
  const [tipos, setTipos] = useState([]);
  const [refacciones, setRefacciones] = useState([]);
  const [inventarioVehiculo, setInventarioVehiculo] = useState([]); // filas de InventarioRefaccion que coinciden con marca+modelo de ESTE vehículo
  const [categoriasRefaccion, setCategoriasRefaccion] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [comisiones, setComisiones] = useState([]);
  const [facturaOrden, setFacturaOrden] = useState(null); // factura vigente de esta orden, si existe
  const [reclamaciones, setReclamaciones] = useState([]);
  const [inspeccionActual, setInspeccionActual] = useState(null);
  const [mostrandoInspeccion, setMostrandoInspeccion] = useState(false);
  const [addingDetalle, setAddingDetalle] = useState(false);
  const [modoMultiple, setModoMultiple] = useState(false);
  const [seleccionMultiple, setSeleccionMultiple] = useState({});
  const [filtroCategoriaMulti, setFiltroCategoriaMulti] = useState("");
  const [filtroSubcategoriaMulti, setFiltroSubcategoriaMulti] = useState("");
  const [guardandoMultiple, setGuardandoMultiple] = useState(false);
  const [addingAbono, setAddingAbono] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [modalCierre, setModalCierre] = useState(false);
  const [textoConfirmar, setTextoConfirmar] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [chatAbierto, setChatAbierto] = useState(false);
  const [estatusAbierto, setEstatusAbierto] = useState(false);
  const [fotoVehiculo, setFotoVehiculo] = useState(null);
  const [datosTaller, setDatosTaller] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);

  async function load() {
    const s = await api.get(`/servicios/${id}`);
    setServicio(s);
    setComentariosFinales(s.comentarios_finales || "");
    if (!s.es_garantia) {
      api.get(`/servicios/${id}/reclamaciones`).then(setReclamaciones);
    } else {
      setReclamaciones([]);
    }
    const inspecciones = await api.get(`/inspecciones/?id_servicio=${id}`);
    setInspeccionActual(inspecciones[0] || null);
    if (s.vehiculo?.id_marca_vehiculo) {
      // Solo las filas de inventario que tengan, entre sus compatibilidades,
      // una que coincida EXACTO con la marca+modelo de este vehículo — es
      // lo mismo que valida el backend al descontar, así la tarjeta nunca
      // promete algo que luego no se pueda aplicar.
      api.get("/inventario-refacciones/").then((todas) => {
        setInventarioVehiculo(todas.filter((r) =>
          (r.compatibilidades || []).some((c) =>
            c.id_marca_vehiculo === s.vehiculo.id_marca_vehiculo && c.id_modelo_vehiculo === s.vehiculo.id_modelo_vehiculo
          )
        ));
      }).catch(() => setInventarioVehiculo([]));
    }
    if (s.id_vehiculo) {
      api.get(`/fotos/?entidad_tipo=vehiculo&entidad_id=${s.id_vehiculo}`)
        .then((fotos) => setFotoVehiculo(fotos[0] || null))
        .catch(() => setFotoVehiculo(null));
    }
  }

  useEffect(() => {
    load();
    api.get("/tipos-servicio/").then(setTipos);
    api.get("/refacciones/").then(setRefacciones);
    api.get("/refacciones-categorias/").then(setCategoriasRefaccion).catch(() => setCategoriasRefaccion([]));
    api.get("/servicios/etapas-disponibles").then(setEtapas);
    api.get("/empleados/").then(setEmpleados).catch(() => setEmpleados([]));
    api.get("/comisiones/").then(setComisiones).catch(() => setComisiones([]));
    api.get("/configuracion-taller/").then(setDatosTaller).catch(() => setDatosTaller(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!hasPermission("facturacion.ver")) return;
    api.get(`/facturacion/facturas?id_servicio=${id}`)
      .then((lista) => setFacturaOrden(lista.find((f) => f.estado !== "cancelada") || null))
      .catch(() => setFacturaOrden(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!servicio) return <div className="loading-text">Cargando orden…</div>;

  const fmt = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
  const abierta = servicio.status === "abierto";

  async function handleAddDetalle(values) {
    try {
      // Si se eligió una refacción del catálogo y no se escribió a mano la
      // descripción o el costo, se toman directo de ahí — así el concepto
      // queda editable pero ya viene precargado con lo que se capturó en
      // el catálogo de refacciones, sin tener que volver a escribirlo.
      const refaccionElegida = values.id_refaccion ? refacciones.find((r) => r.id_refaccion === Number(values.id_refaccion)) : null;
      const actualizado = await api.post(`/servicios/${id}/detalles`, {
        ...values,
        id_tipo_servicio: values.id_tipo_servicio || null,
        id_refaccion: values.id_refaccion || null,
        descripcion: values.descripcion?.trim() || refaccionElegida?.nombre_refaccion || null,
        cantidad: Number(values.cantidad || 1),
        costo_mano_obra: Number(values.costo_mano_obra || 0),
        costo_refaccion: Number(values.costo_refaccion) || (refaccionElegida?.preciocliente_refaccion || refaccionElegida?.preciopropio_refaccion || 0),
        costo_extra: Number(values.costo_extra || 0),
      });
      setAddingDetalle(false);
      if (actualizado.alertas_stock?.length > 0) {
        actualizado.alertas_stock.forEach((a) => {
          notify(
            `${a.nivel === "critico" ? "🔴 Stock crítico" : "🟠 Stock bajo"}: "${a.nombre_refaccion}" — quedan ${a.cantidad_actual}`,
            a.nivel === "critico" ? "error" : "info"
          );
        });
      }
      load();
    } catch (err) {
      notify(err.message, "error");
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

  async function guardarSeleccionMultiple() {
    const idsSeleccionados = Object.keys(seleccionMultiple);
    if (idsSeleccionados.length === 0) {
      notify("Marca al menos una refacción.", "error");
      return;
    }
    // El descuento de inventario SOLO aplica cuando hay una fila de
    // InventarioRefaccion que coincide exacto con la marca+modelo de este
    // vehículo — si no coincide, no se descuenta nada de ningún lado
    // (antes se descontaba del stock plano como respaldo silencioso; ya
    // no). Aquí se separan cuáles sí tienen esa coincidencia y cuáles no,
    // para avisar antes de guardar.
    const sinInventario = [];
    for (const idStr of idsSeleccionados) {
      const refaccion = refacciones.find((r) => r.id_refaccion === Number(idStr));
      const inv = inventarioVehiculo.find((i) => i.id_refaccion === Number(idStr));
      const cantidadPedida = seleccionMultiple[idStr].cantidad;
      if (inv) {
        if (inv.cantidad < cantidadPedida) {
          notify(`Sin stock suficiente de "${refaccion?.nombre_refaccion}" (disponible: ${inv.cantidad}, pedido: ${cantidadPedida}).`, "error");
          return;
        }
      } else {
        sinInventario.push(refaccion?.nombre_refaccion || "una refacción");
      }
    }
    if (sinInventario.length > 0) {
      const ok = await confirmDialog(
        `${sinInventario.join(", ")} no ${sinInventario.length > 1 ? "tienen" : "tiene"} inventario registrado para ${servicio.vehiculo?.marca?.nombre_marca} ${servicio.vehiculo?.modelo?.nombre_modelo} — se agregará a la orden, pero no se descontará de ningún inventario. ¿Continuar?`,
        { title: "Refacción sin inventario", recordar: "sin_inventario_orden" }
      );
      if (!ok) return;
    }
    setGuardandoMultiple(true);
    try {
      // Una tras otra (no en paralelo) para que el descuento de inventario
      // de cada una quede reflejado antes de validar/aplicar la siguiente.
      for (const idStr of idsSeleccionados) {
        const refaccion = refacciones.find((r) => r.id_refaccion === Number(idStr));
        const inv = inventarioVehiculo.find((i) => i.id_refaccion === Number(idStr));
        const precio = (inv ? inv.preciocliente : refaccion?.preciocliente_refaccion) || (inv ? inv.preciopropio : refaccion?.preciopropio_refaccion) || 0;
        await api.post(`/servicios/${id}/detalles`, {
          id_refaccion: Number(idStr),
          descripcion: refaccion?.nombre_refaccion || null,
          cantidad: seleccionMultiple[idStr].cantidad,
          costo_refaccion: (precio ?? 0) * seleccionMultiple[idStr].cantidad,
          costo_extra: 0,
        });
      }
      notify(`${idsSeleccionados.length} refacción(es) agregadas a la orden.`, "success");
      setAddingDetalle(false);
      setModoMultiple(false);
      setSeleccionMultiple({});
      load();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardandoMultiple(false);
    }
  }

  async function handleUpdateDetalle(detalleId, cambios) {
    try {
      const actualizado = await api.put(`/servicios/${id}/detalles/${detalleId}`, cambios);
      setServicio(actualizado);
    } catch (err) {
      notify(err.message, "error");
      load(); // si falló, se recarga para no dejar el número editado a medias en pantalla
    }
  }

  async function handleDeleteDetalle(detalleId) {
    const ok = await confirmDialog("¿Quitar este concepto de la orden? Si usaba una refacción, se regresa al inventario.", { danger: true });
    if (!ok) return;
    try {
      await api.del(`/servicios/${id}/detalles/${detalleId}`);
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function handleAddAbono(values) {
    try {
      const monto = values.tipo_pago === "mixto"
        ? (Number(values.desglose_mixto_efectivo) || 0) + (Number(values.desglose_mixto_tarjeta) || 0)
        : Number(values.monto_abono);
      const actualizado = await api.post(`/servicios/${id}/abonos`, {
        monto_abono: monto,
        tipo_pago: values.tipo_pago || "efectivo",
        desglose_mixto_efectivo: values.tipo_pago === "mixto" ? Number(values.desglose_mixto_efectivo) || 0 : null,
        desglose_mixto_tarjeta: values.tipo_pago === "mixto" ? Number(values.desglose_mixto_tarjeta) || 0 : null,
        comentario: values.comentario || null,
      });
      setAddingAbono(false);
      const ultimo = actualizado.abonos[actualizado.abonos.length - 1];
      if (ultimo?.cambio > 0) notify(`Pago registrado. Cambio a devolver: ${fmt(ultimo.cambio)}.`, "success");
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function cambiarStatus(nuevo) {
    if (nuevo === "cancelado") {
      const ok = await confirmDialog("¿Cancelar esta orden de servicio? Podrás reabrirla después si te equivocas.", { danger: true });
      if (!ok) return;
    }
    try {
      const actualizado = await api.put(`/servicios/${id}`, { status: nuevo });
      load();
      if (nuevo !== "abierto") notify("Estado de la orden actualizado.", "success");
      if (actualizado.alertas_stock?.length > 0) {
        actualizado.alertas_stock.forEach((a) => {
          const proveedorTexto = a.proveedor ? ` · Proveedor: ${a.proveedor.nombre}${a.proveedor.telefono ? " (" + a.proveedor.telefono + ")" : ""}` : "";
          notify(
            `${a.nivel === "critico" ? "🔴 Stock crítico" : "🟠 Stock bajo"}: "${a.nombre_refaccion}"${a.numero_refaccion ? " (" + a.numero_refaccion + ")" : ""} — quedan ${a.cantidad_actual}${proveedorTexto}`,
            a.nivel === "critico" ? "error" : "info"
          );
        });
      }
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function reasignarEmpleado(idEmpleado) {
    try {
      const actualizado = await api.put(`/servicios/${id}`, { id_empleado_responsable: idEmpleado ? Number(idEmpleado) : null });
      setServicio(actualizado);
      notify("Responsable actualizado.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function confirmarCierre() {
    if (textoConfirmar !== "CONFIRMAR") {
      notify("Escribe la palabra CONFIRMAR, en mayúsculas, para finalizar la orden.", "error");
      return;
    }
    setCerrando(true);
    try {
      await cambiarStatus("cerrado");
      setModalCierre(false);
      setTextoConfirmar("");
    } finally {
      setCerrando(false);
    }
  }

  async function cambiarIva(aplicar) {
    try {
      const actualizado = await api.put(`/servicios/${id}`, { iva_porcentaje: aplicar ? 16 : 0 });
      setServicio(actualizado);
      notify(aplicar ? "Se aplicará IVA (16%) a esta orden." : "Se quitó el IVA de esta orden.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function guardarComentarios() {
    setGuardandoComentarios(true);
    try {
      await api.put(`/servicios/${id}`, { comentarios_finales: comentariosFinales });
      notify("Comentarios guardados — ya aparecerán en el recibo y la nota de remisión.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardandoComentarios(false);
    }
  }

  async function descargarPdf(tipo, modo = "descargar") {
    // En navegadores de celular casi nunca hay un visor de PDF integrado
    // para <iframe> (a diferencia de Chrome de escritorio) — el modal con
    // vista previa se ve en blanco. En móvil, se manda directo a
    // descarga, que sí abre bien con el visor nativo del sistema.
    const esMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    setDescargando(true);
    try {
      const ruta = tipo === "remision" ? `/api/servicios/${id}/nota-remision` : `/api/servicios/${id}/recibo`;
      const res = await fetch(ruta, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo generar el documento.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (modo === "preview" && !esMovil) {
        // Se muestra incrustado en un modal de la misma página — nada de
        // pestañas nuevas ni pop-ups: los navegadores las bloquean de
        // formas distintas e impredecibles, y así siempre funciona.
        setPdfPreviewUrl(url);
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = tipo === "remision" ? `nota-remision-${id}.pdf` : `orden-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      if (modo === "preview") notify("Se descargó la nota — tu celular la abre con su propio visor de PDF.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setDescargando(false);
    }
  }

  return (
    <>
      <div className="orden-layout">
      <div className="orden-main">
      <div className="orden-hero">
        <div className="orden-hero-top">
          <Link className="icon-btn" to="/servicios" title="Volver a las órdenes de servicio">←</Link>
          <h1 className="orden-hero-titulo">
            <IconoModulo ruta="/servicios" /> Orden #{servicio.id_servicio}
            <span className={`badge badge-${servicio.status === "abierto" ? "petrol" : servicio.status === "cerrado" ? "teal" : "red"}`}>
              {servicio.status === "cerrado" ? "finalizada" : servicio.status}
            </span>
            {servicio.pagado && <span className="badge badge-teal">pagada</span>}
          </h1>
          <div className="orden-hero-herramientas">
            <span className="tip-envoltura" title={servicio.detalles.length > 0 ? "Vista previa de la nota (incluye la inspección, si ya se hizo)" : "La vista previa se activa cuando ya se capturaron refacciones o conceptos"}>
              <button className="icon-btn" onClick={() => descargarPdf("recibo", "preview")} disabled={descargando || servicio.detalles.length === 0}>🔍</button>
            </span>
            <span className="tip-envoltura" title={servicio.status === "cerrado" ? "Descargar el recibo en PDF" : "Disponible cuando la orden esté finalizada"}>
              <button className="btn btn-secondary" onClick={() => descargarPdf("recibo")} disabled={descargando || servicio.status !== "cerrado"}>
                🖨️ {descargando ? "Generando…" : "Descargar recibo"}
              </button>
            </span>
          </div>
        </div>

        <div className="orden-hero-grid">
          <div className="orden-hero-bloque" style={{ "--acc": "var(--teal-600)", "--acc-soft": "var(--teal-100)" }}>
            <span className="orden-hero-icono">🧑</span>
            <div>
              <div className="orden-hero-etiqueta">Cliente</div>
              <div className="orden-hero-valor">{servicio.cliente?.nombre_cliente} {servicio.cliente?.paterno_cliente}</div>
              <div className="orden-hero-meta">{servicio.cliente?.numero_cuenta}{servicio.cliente?.telefono1 ? ` · 📱 ${servicio.cliente.telefono1}` : ""}</div>
            </div>
          </div>
          <div className="orden-hero-bloque" style={{ "--acc": "var(--blue-600)", "--acc-soft": "var(--blue-100)" }}>
            <span className="orden-hero-icono">🚗</span>
            <div>
              <div className="orden-hero-etiqueta">Vehículo</div>
              <div className="orden-hero-valor">
                {[servicio.vehiculo?.marca?.nombre_marca, servicio.vehiculo?.modelo?.nombre_modelo].filter(Boolean).join(" ") || "—"}
              </div>
              <div className="orden-hero-meta">{servicio.vehiculo?.numero_cuenta} · Placas {servicio.vehiculo?.placas_vehiculo || "—"}</div>
            </div>
          </div>
          <div className="orden-hero-bloque" style={{ "--acc": "var(--violet-600)", "--acc-soft": "var(--violet-100)" }}>
            <span className="orden-hero-icono">👷</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="orden-hero-etiqueta">Empleado responsable</div>
              {hasPermission("servicios.editar") ? (
                <select value={servicio.id_empleado_responsable ?? ""} onChange={(e) => reasignarEmpleado(e.target.value)} title="Cambiar el responsable de esta orden">
                  <option value="">Sin asignar</option>
                  {empleados.filter((e) => e.activo).map((e) => (
                    <option key={e.id_empleado} value={e.id_empleado}>{e.nombre} {e.paterno || ""}</option>
                  ))}
                </select>
              ) : (
                <div className="orden-hero-valor">{empleados.find((e) => e.id_empleado === servicio.id_empleado_responsable)?.nombre || "Sin asignar"}</div>
              )}
            </div>
          </div>
        </div>

      </div>

      <div className="datos-3-bloques">
        <div className="nota-bloque">
          <div className="nota-bloque-header"><span className="icono">🧑</span><h2>Datos del cliente</h2></div>
          <div className="nota-bloque-body">
            <dl className="datos-lista">
              <dt>ID / Cuenta</dt><dd>{servicio.cliente?.numero_cuenta || "—"}</dd>
              <dt>Nombre</dt><dd>{servicio.cliente?.nombre_cliente} {servicio.cliente?.paterno_cliente || ""}</dd>
              <dt>Teléfono</dt><dd>{servicio.cliente?.telefono1 || "—"}</dd>
            </dl>
          </div>
        </div>

        <div className="nota-bloque">
          <div className="nota-bloque-header"><span className="icono">🚗</span><h2>Datos del vehículo</h2></div>
          <div className="nota-bloque-body datos-vehiculo-body">
            <dl className="datos-lista">
              <dt>Marca</dt><dd>{servicio.vehiculo?.marca?.nombre_marca || "—"}</dd>
              <dt>Modelo</dt><dd>{servicio.vehiculo?.modelo?.nombre_modelo || "—"}</dd>
              <dt>Km</dt><dd>{servicio.km_llegada || "—"}</dd>
              <dt>Próximo servicio (km)</dt><dd>{servicio.km_proximo_servicio || "—"}</dd>
              <dt>Color</dt><dd>{servicio.vehiculo?.color?.nombre_color || "—"}</dd>
              <dt>Placa</dt><dd>{servicio.vehiculo?.placas_vehiculo || "—"}</dd>
              <dt>VIN</dt><dd>{servicio.vehiculo?.numserie_vehiculo || "—"}</dd>
            </dl>
            {fotoVehiculo && (
              <img
                src={`/uploads/${fotoVehiculo.ruta_archivo}`}
                alt="Vehículo del cliente"
                className="orden-foto-vehiculo"
              />
            )}
          </div>
        </div>

        <div className="nota-bloque">
          <div className="nota-bloque-header"><span className="icono">🏢</span><h2>Datos del taller</h2></div>
          <div className="nota-bloque-body datos-vehiculo-body">
            {datosTaller ? (
              <dl className="datos-lista">
                <dt>Nombre</dt><dd>{datosTaller.nombre_taller || "—"}</dd>
                <dt>Dirección</dt><dd>{datosTaller.direccion || "—"}</dd>
                <dt>RFC</dt><dd>{datosTaller.rfc || "—"}</dd>
                <dt>Código postal</dt><dd>{datosTaller.cp || "—"}</dd>
                <dt>Calle</dt><dd>{datosTaller.calle || "—"}</dd>
                <dt>Estado</dt><dd>{datosTaller.estado?.nombre_estado || "—"}</dd>
                <dt>Municipio</dt><dd>{datosTaller.ciudad?.nombre_ciudad || "—"}</dd>
                <dt>Número</dt><dd>{datosTaller.numero_taller || "—"}</dd>
              </dl>
            ) : (
              <div className="empty-state">Cargando…</div>
            )}
            {datosTaller?.ruta_logo && (
              <img src={`/uploads/${datosTaller.ruta_logo}`} alt="Logo del taller" className="orden-foto-vehiculo" />
            )}
          </div>
          <div className="nota-bloque-body" style={{ paddingTop: 0 }}>
            <Link to="/configuracion-taller" className="datos-taller-editar">Editar datos del taller →</Link>
          </div>
        </div>
      </div>

      {!abierta && (
        <div className="panel" style={{ borderLeft: "4px solid var(--red-600)", padding: "12px 16px" }}>
          Esta orden está <b>{servicio.status}</b>: los conceptos y abonos ya no se pueden editar. Reábrela con el botón de arriba si necesitas hacer cambios.
        </div>
      )}

      {servicio.es_garantia && (
        <div className="panel" style={{ borderLeft: "4px solid #b5730a", padding: "12px 16px" }}>
          🛡️ <b>Esta orden es una reclamación de garantía</b> de la{" "}
          <Link to={`/servicios/${servicio.id_servicio_original}`}>orden #{servicio.id_servicio_original}</Link>.
          {servicio.motivo_garantia && <div style={{ marginTop: 6, fontSize: 13 }}>Motivo: {servicio.motivo_garantia}</div>}
        </div>
      )}

      {reclamaciones.length > 0 && (
        <div className="panel" style={{ borderLeft: "4px solid #b5730a" }}>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>🛡️ Este vehículo volvió por esto ({reclamaciones.length})</h2>
          <table>
            <thead><tr><th>Orden</th><th>Fecha</th><th>Motivo</th><th>Estatus</th></tr></thead>
            <tbody>
              {reclamaciones.map((r) => (
                <tr key={r.id_servicio} style={{ cursor: "pointer" }} onClick={() => navigate(`/servicios/${r.id_servicio}`)}>
                  <td><Link to={`/servicios/${r.id_servicio}`}>#{r.id_servicio}</Link></td>
                  <td>{new Date(r.fecha_entrada_servicio).toLocaleDateString("es-MX")}</td>
                  <td>{r.motivo_garantia || "—"}</td>
                  <td><span className={`badge ${r.status === "abierto" ? "badge-petrol" : r.status === "cerrado" ? "badge-teal" : "badge-red"}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BloqueNota
        icono="💰"
        titulo="Resumen de costos"
        accion={
          hasPermission("servicios.editar") && !servicio.pagado && (
            <button className="btn btn-secondary btn-sm" onClick={() => setAddingAbono(true)} disabled={!abierta}>
              + Registrar abono
            </button>
          )
        }
      >
        <div className="kpi-grid" style={{ marginBottom: 12 }}>
          <div className="kpi-card">
            <div className="kpi-label">Subtotal</div>
            <div className="kpi-value mono">{fmt(servicio.costos.subtotal)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">IVA ({servicio.iva_porcentaje}%)</div>
            <div className="kpi-value mono">{fmt(servicio.costos.iva)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total</div>
            <div className="kpi-value mono">{fmt(servicio.costos.total)}</div>
          </div>
          <div className={`kpi-card ${servicio.costos.saldo_pendiente > 0 ? "alert" : "ok"}`}>
            <div className="kpi-label">Saldo pendiente</div>
            <div className="kpi-value mono">{fmt(servicio.costos.saldo_pendiente)}</div>
          </div>
        </div>
        {hasPermission("servicios.editar") && abierta && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-700)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={servicio.iva_porcentaje > 0}
              onChange={(e) => cambiarIva(e.target.checked)}
            />
            Aplicar IVA (16%)
          </label>
        )}
      </BloqueNota>

      <BloqueNota
        icono="🔧"
        titulo="Refacciones"
        accion={
          <button className="btn btn-primary btn-sm" onClick={() => setAddingDetalle(true)} disabled={!abierta}>
            + Agregar refacción
          </button>
        }
      >
        {servicio.detalles.length === 0 ? (
          <div className="empty-state">Aún no se han agregado refacciones ni conceptos a esta orden.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Tipo</th>
                <th>Refacción</th>
                <th>Cantidad de piezas</th>
                <th>Costo original</th>
                <th>Precio final</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Se agrupan por categoría/subcategoría de la refacción
                // ligada (si tiene) — así salen agrupados sin importar el
                // orden en que se fueron agregando a la orden.
                const grupos = {};
                servicio.detalles.forEach((d) => {
                  const ref = refacciones.find((r) => r.id_refaccion === d.id_refaccion);
                  const clave = ref?.categoria ? `${ref.categoria}${ref.subcategoria ? " / " + ref.subcategoria : ""}` : "Sin categoría";
                  if (!grupos[clave]) grupos[clave] = [];
                  grupos[clave].push({ d, ref });
                });
                const clavesOrdenadas = Object.keys(grupos).sort((a, b) => (a === "Sin categoría" ? 1 : b === "Sin categoría" ? -1 : a.localeCompare(b)));
                return clavesOrdenadas.map((clave) => (
                  <>
                    {clavesOrdenadas.length > 1 && (
                      <tr key={`grupo-${clave}`}>
                        <td colSpan={7} style={{ background: "var(--paper-0)", fontWeight: 700, fontSize: 12.5, color: "var(--petrol-600)" }}>{clave}</td>
                      </tr>
                    )}
                    {grupos[clave].map(({ d, ref }) => (
                      <tr key={d.id_servicio_detalle}>
                        <td>{d.descripcion || "—"}</td>
                        <td>{tipos.find((t) => t.id_tipo_servicio === d.id_tipo_servicio)?.nombre_tipo || "—"}</td>
                        <td>{ref?.nombre_refaccion || "—"}</td>
                        <td style={{ width: 70 }}>
                          <input
                            key={`c-${d.id_servicio_detalle}-${d.cantidad}`} type="number" defaultValue={d.cantidad || 1} disabled={!abierta}
                            style={{ width: "100%", padding: "4px 6px" }}
                            onBlur={(e) => { const v = Number(e.target.value) || 1; if (v !== d.cantidad) handleUpdateDetalle(d.id_servicio_detalle, { cantidad: v }); }}
                          />
                        </td>
                        <td style={{ width: 100, color: "var(--ink-500)" }}>
                          {ref ? fmt((ref.preciopropio_refaccion || 0) * (d.cantidad || 1)) : "—"}
                        </td>
                        <td style={{ width: 100 }}>
                          <input
                            key={`r-${d.id_servicio_detalle}-${d.costo_refaccion}`} type="number" defaultValue={d.costo_refaccion} disabled={!abierta}
                            style={{ width: "100%", padding: "4px 6px" }}
                            onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== d.costo_refaccion) handleUpdateDetalle(d.id_servicio_detalle, { costo_refaccion: v }); }}
                          />
                        </td>
                        <td>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDetalle(d.id_servicio_detalle)} disabled={!abierta}>Quitar</button>
                        </td>
                      </tr>
                    ))}
                  </>
                ));
              })()}
            </tbody>
          </table>
        )}

        {servicio.abonos.length > 0 && (
          <>
            <h3 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--ink-700)", marginTop: 20, marginBottom: 10, paddingTop: 16, borderTop: "1px solid var(--ink-300)" }}>
              Abonos registrados
            </h3>
            <table>
              <thead>
                <tr><th>#</th><th>Fecha</th><th>Tipo de pago</th><th>Monto</th><th>Cambio</th><th>Comentario</th></tr>
              </thead>
              <tbody>
                {servicio.abonos.map((a) => {
                  const comision = comisiones.find((c) => c.tipo_pago === a.tipo_pago);
                  return (
                    <tr key={a.id_abono}>
                      <td>{a.numero_abono}</td>
                      <td>{new Date(a.fecha_pago).toLocaleDateString("es-MX")}</td>
                      <td>
                        {a.tipo_pago === "tarjeta" ? "Tarjeta" : a.tipo_pago === "mixto" ? "Mixto" : "Efectivo"}
                        {comision?.porcentaje > 0 && <div style={{ fontSize: 11, color: "var(--ink-500)" }}>Comisión: {comision.porcentaje}%</div>}
                        {a.tipo_pago === "mixto" && (
                          <div style={{ fontSize: 11, color: "var(--ink-500)" }}>Efvo: {fmt(a.desglose_mixto_efectivo)} · Tarj: {fmt(a.desglose_mixto_tarjeta)}</div>
                        )}
                      </td>
                      <td className="mono">{fmt(a.monto_abono)}</td>
                      <td className="mono">{a.cambio > 0 ? fmt(a.cambio) : "—"}</td>
                      <td>{a.comentario || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </BloqueNota>

      <BloqueNota icono="📝" titulo="Comentarios finales">
        <div className="field full">
          <label>Aparecen en el recibo y la nota de remisión</label>
          <textarea
            value={comentariosFinales}
            onChange={(e) => setComentariosFinales(e.target.value)}
            placeholder="Ej. Se recomienda revisar las balatas traseras en el próximo servicio."
          />
        </div>
        <button className="btn btn-secondary btn-sm" onClick={guardarComentarios} disabled={guardandoComentarios}>
          {guardandoComentarios ? "Guardando…" : "Guardar comentarios"}
        </button>
      </BloqueNota>

      <BloqueNota icono="📸" titulo="Fotos">
        <FotoGaleria entidadTipo="servicio" entidadId={servicio.id_servicio} puedeEditar={hasPermission("servicios.editar")} />
      </BloqueNota>

      </div>

      <aside className="orden-aside">
        <div className="nota-bloque lateral-bloque">
          <div className="nota-bloque-header">
            <span className="icono">🧾</span>
            <h2>Opciones de la nota</h2>
          </div>
          <div className="nota-bloque-body">
            <div className="lateral-acciones">
              {abierta && (
                <button className="btn btn-primary" onClick={() => setModalCierre(true)} title="Cobrar, cerrar la orden, generar la nota y avisar al cliente">
                  🧾 Finalizar y generar nota
                </button>
              )}
              {servicio.status === "cerrado" && (
                <button className="btn btn-secondary" onClick={() => descargarPdf("remision")} disabled={descargando} title="Descargar la nota de remisión en PDF">
                  📋 Nota de remisión
                </button>
              )}
              {facturaOrden ? (
                <Link className="btn btn-secondary" to="/facturacion" title="Ver la factura de esta orden">
                  📑 Factura {facturaOrden.serie}-{facturaOrden.folio}{facturaOrden.estado !== "timbrada" ? " (cancelación pendiente)" : ""}
                </Link>
              ) : servicio.status === "cerrado" && hasPermission("facturacion.crear") && (
                <button className="btn btn-secondary" onClick={() => navigate("/facturacion", { state: { idServicio: servicio.id_servicio } })} title="Emitir la factura (CFDI) de esta orden">
                  📑 Facturar
                </button>
              )}
              {servicio.status === "cerrado" && !servicio.es_garantia && hasPermission("servicios.crear") && (
                <button className="btn btn-secondary" onClick={() => navigate("/servicios", { state: { garantiaOriginal: servicio } })} title="Abrir una orden de garantía ligada a esta">
                  🛡️ Reclamar garantía
                </button>
              )}
              {!abierta && (
                <button className="btn btn-secondary" onClick={() => cambiarStatus("abierto")} title="Volver a abrir la orden para editarla">↺ Reabrir orden</button>
              )}
              {servicio.status !== "cancelado" && servicio.status !== "cerrado" && !(servicio.costos.total_abonado > 0 && servicio.costos.saldo_pendiente <= 0) && (
                <button className="btn btn-danger" onClick={() => cambiarStatus("cancelado")} title="Cancelar la orden (solo si no está pagada)">✕ Cancelar orden</button>
              )}
            </div>
          </div>
        </div>
        <EstatusLateral servicio={servicio} puedeEditar={hasPermission("servicios.editar")} onActualizado={setServicio} />
      </aside>
      </div>

      {pdfPreviewUrl && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); } }}>
          <div className="modal modal-pdf">
            <div className="modal-pdf-header">
              <span>📄 Vista previa de la nota</span>
              <div style={{ display: "flex", gap: 10 }}>
                <a className="btn btn-secondary btn-sm" href={pdfPreviewUrl} download={`orden-${id}.pdf`}>Descargar</a>
                <button className="btn btn-secondary btn-sm" onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}>Cerrar ✕</button>
              </div>
            </div>
            <iframe src={pdfPreviewUrl} title="Vista previa de la nota" className="modal-pdf-frame" />
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Botón flotante de chat — el chat solo se despliega si lo pides */}
      {abierta && (
        <button
          className="chat-fab chat-fab-estatus"
          onClick={() => setMostrandoInspeccion(true)}
          title={inspeccionActual ? "Ver / editar la inspección del vehículo" : "Nueva inspección del vehículo"}
        >
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 19l2.2-6.2A3 3 0 0 1 9 11h9.5a3 3 0 0 1 2.6 1.5L23.5 17" />
            <path d="M3 19h14v4a1 1 0 0 1-1 1h-1.5M3 19v4a1 1 0 0 0 1 1h1.5" />
            <circle cx="8" cy="24" r="2" />
            <path d="M11 24h1.5" />
            <path d="M25.5 14.5a3.4 3.4 0 0 0-4.6 4.2l-4.4 4.4a1.5 1.5 0 0 0 2.1 2.1l4.4-4.4a3.4 3.4 0 0 0 4.2-4.6l-2 2-1.7-.4-.4-1.7z" />
          </svg>
        </button>
      )}
      <button
        className="chat-fab"
        onClick={() => { setChatAbierto((v) => !v); setEstatusAbierto(false); }}
        title="Chat de la orden"
      >
        💬
      </button>
      {chatAbierto && (
        <div className="chat-flotante">
          <div className="chat-flotante-header">
            <span>💬 Chat de la orden</span>
            <button className="chat-flotante-cerrar" title="Cerrar chat" onClick={() => setChatAbierto(false)}>✕</button>
          </div>
          <div className="chat-flotante-body">
            <ChatOrden servicioId={servicio.id_servicio} nombreCliente={`${servicio.cliente?.nombre_cliente || ""} ${servicio.cliente?.paterno_cliente || ""}`.trim()} />
          </div>
        </div>
      )}

      {addingDetalle && (() => {
        const refaccionesFiltradas = refacciones.filter((r) =>
          (!filtroCategoriaMulti || r.categoria === filtroCategoriaMulti) &&
          (!filtroSubcategoriaMulti || (r.categoria || "Sin categoría") === filtroSubcategoriaMulti)
        );
        // Se muestran TODAS las refacciones del catálogo (como en
        // Cotización) — si el vehículo de esta orden tiene inventario
        // específico registrado para alguna, se usa ese stock/precio real;
        // si no, se muestra en 0 pero se puede agregar igual (el backend
        // decide de dónde descontar, o si no descuenta nada).
        function inventarioDe(idRefaccion) {
          return inventarioVehiculo.find((inv) => inv.id_refaccion === idRefaccion);
        }
        const grupos = {};
        refaccionesFiltradas.forEach((r) => {
          const clave = r.categoria || "Sin categoría";
          if (!grupos[clave]) grupos[clave] = [];
          grupos[clave].push(r);
        });
        const clavesOrdenadas = Object.keys(grupos).sort((a, b) => (a === "Sin categoría" ? 1 : b === "Sin categoría" ? -1 : a.localeCompare(b)));
        const categoriasDisponibles = [...new Set(refacciones.map((r) => r.categoria).filter(Boolean))].sort();
        return (
          <ModalPortal>
          <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setAddingDetalle(false)}>
            <div className="modal modal-grande">
              <h2 style={{ fontSize: 20 }}>Agregar refacciones a la orden</h2>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 18 }}>
                <div className="field" style={{ maxWidth: 480, flex: 1, marginBottom: 0 }}>
                  <label>Categoría</label>
                  <select value={filtroCategoriaMulti} onChange={(e) => { setFiltroCategoriaMulti(e.target.value); setFiltroSubcategoriaMulti(""); }}>
                    <option value="">Todas</option>
                    {categoriasDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {filtroSubcategoriaMulti && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFiltroSubcategoriaMulti("")}>
                    ✕ Quitar filtro "{filtroSubcategoriaMulti}"
                  </button>
                )}
              </div>

              <div className="tarjetas-refaccion-grid">
                {refaccionesFiltradas.length === 0 ? (
                  <div className="empty-state">No hay refacciones que coincidan con ese filtro.</div>
                ) : (
                  clavesOrdenadas.map((clave) => (
                    <>
                      <div
                        key={`grupo-${clave}`}
                        className="tarjetas-refaccion-grupo tarjetas-refaccion-grupo-clicable"
                        onClick={() => setFiltroSubcategoriaMulti(clave)}
                        title="Filtrar solo por esta categoría"
                      >
                        {clave}
                      </div>
                      {grupos[clave].map((r) => {
                        const inv = inventarioDe(r.id_refaccion);
                        const marcada = !!seleccionMultiple[r.id_refaccion];
                        return (
                          <div
                            key={r.id_refaccion}
                            className={`tarjeta-refaccion ${marcada ? "seleccionada" : ""}`}
                            onClick={() => alternarSeleccionMultiple(r.id_refaccion, !marcada)}
                          >
                            <div className="tarjeta-refaccion-nombre">{r.nombre_refaccion}</div>
                            <div className="tarjeta-refaccion-info">
                              {r.categoria ? `${r.categoria} · ` : ""}Stock: {inv ? inv.cantidad : (r.cantidad_refaccion ?? 0)}
                              {((inv ? inv.preciocliente : r.preciocliente_refaccion) || (inv ? inv.preciopropio : r.preciopropio_refaccion)) ? ` · $${(inv ? inv.preciocliente : r.preciocliente_refaccion) || (inv ? inv.preciopropio : r.preciopropio_refaccion)}` : ""}
                            </div>
                            {!inv && (
                              <div style={{ fontSize: 11, color: "var(--warn-600)", marginTop: 3 }}>
                                Sin inventario para este vehículo — no se descontará stock
                              </div>
                            )}
                            {marcada && (
                              <div className="tarjeta-refaccion-cantidad" onClick={(e) => e.stopPropagation()}>
                                <label>Cantidad</label>
                                <input
                                  type="number"
                                  min={1}
                                  value={seleccionMultiple[r.id_refaccion]?.cantidad || 1}
                                  onChange={(e) => cambiarCantidadMultiple(r.id_refaccion, e.target.value)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  ))
                )}
              </div>

              <div className="field-hint" style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 14 }}>
                Se descuenta el inventario de cada una al guardar (se valida que alcance el stock antes de aplicar ninguna).
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => { setAddingDetalle(false); setSeleccionMultiple({}); }}>Cancelar</button>
                <button className="btn btn-primary" onClick={guardarSeleccionMultiple} disabled={guardandoMultiple}>
                  {guardandoMultiple ? "Agregando…" : "Agregar a la orden"}
                </button>
              </div>
            </div>
          </div>
          </ModalPortal>
        );
      })()}

      {addingAbono && (
        <FormModal
          title="Registrar abono"
          icono="💲"
          colorAcento="teal"
          subtitulo={`Pago a cuenta de la orden #${servicio.id_servicio}.`}
          fields={(values) => {
            const campos = [
              {
                name: "tipo_pago", label: "Tipo de pago", type: "select",
                options: [{ value: "efectivo", label: "Efectivo" }, { value: "tarjeta", label: "Pago con tarjeta" }, { value: "mixto", label: "Mixto" }],
              },
            ];
            if (values.tipo_pago === "mixto") {
              campos.push({ name: "desglose_mixto_efectivo", label: "Efectivo", type: "number" });
              campos.push({ name: "desglose_mixto_tarjeta", label: "Tarjeta", type: "number" });
            } else {
              campos.push({ name: "monto_abono", label: "Monto", type: "number", required: true });
            }
            campos.push({ name: "comentario", label: "Comentario", type: "textarea", full: true });
            return campos;
          }}
          initialValues={{ tipo_pago: "efectivo" }}
          onSubmit={handleAddAbono}
          onClose={() => setAddingAbono(false)}
        />
      )}

      {mostrandoInspeccion && (
        <InspeccionForm
          idVehiculo={servicio.id_vehiculo}
          idServicio={servicio.id_servicio}
          inspeccionExistente={inspeccionActual}
          refacciones={refacciones}
          onGuardado={setInspeccionActual}
          onClose={() => setMostrandoInspeccion(false)}
        />
      )}

      {modalCierre && (
        <FinalizarOrdenModal
          servicio={servicio}
          notify={notify}
          onClose={() => setModalCierre(false)}
          onFinalizada={({ cambio, notificaciones }) => {
            setModalCierre(false);
            const avisos = [notificaciones?.push && "app", notificaciones?.correo && "correo", notificaciones?.chat && "chat"].filter(Boolean);
            notify(
              `Orden finalizada.${cambio > 0 ? ` Cambio a entregar: ${fmt(cambio)}.` : ""}${avisos.length ? ` Se avisó al cliente por ${avisos.join(", ")}.` : ""}`,
              "success"
            );
            load();
            descargarPdf("remision", "preview");
          }}
        />
      )}
    </>
  );
}
