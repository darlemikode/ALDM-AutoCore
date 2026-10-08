import { contiene, norm } from "../lib/texto";
import SelectorFecha from "../components/SelectorFecha";
import { useEffect, useRef, useState } from "react";
import { marcarCampo } from "../validacion";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, getToken } from "../api";
import FormModal from "../components/FormModal";
import FiltroChips from "../components/FiltroChips";
import ModalPortal from "../components/ModalPortal";
import FotoGaleria from "../components/FotoGaleria";
import EstatusLateral from "../components/EstatusLateral";
import ChatOrden from "../components/ChatOrden";
import InspeccionForm from "../components/InspeccionForm";
import FinalizarOrdenModal from "../components/FinalizarOrdenModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import ElegirClienteVehiculo from "../components/ElegirClienteVehiculo";
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

export default function ServicioDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { confirmDialog, notify } = useUI();
  const { hasPermission } = useAuth();
  const [servicio, setServicio] = useState(null);
  const [comentariosFinales, setComentariosFinales] = useState("");
  const [guardandoComentarios, setGuardandoComentarios] = useState(false);
  const [comentariosGuardados, setComentariosGuardados] = useState("");
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
  const focoPendiente = useRef(null); // { id, campo } del campo de la tabla de refacciones que debe quedar enfocado tras recargar

  // Enter en la tabla de refacciones: guarda (el blur ya lo hace) y salta al siguiente campo.
  // Cantidad → su precio si está vacío o en 0; si ya tiene precio → cantidad de la siguiente fila.
  function irSiguienteRefaccion(e, campo) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const todos = [...document.querySelectorAll(".tabla-refacciones input[data-campo]")];
    const i = todos.indexOf(e.currentTarget);
    if (i < 0) return;
    let destino;
    if (campo === "c") {
      const precio = todos[i + 1];
      destino = precio && !(Number(precio.value) > 0) ? precio : todos[i + 2];
    } else {
      destino = todos[i + 1];
    }
    if (destino) {
      focoPendiente.current = { id: destino.dataset.det, campo: destino.dataset.campo };
      destino.focus();
      destino.select?.();
    } else {
      e.currentTarget.blur();
    }
  }

  // Tras guardar, la tabla se vuelve a dibujar: se devuelve el cursor al campo al que se saltó
  useEffect(() => {
    const f = focoPendiente.current;
    if (!f) return;
    const el = document.querySelector(`.tabla-refacciones input[data-det="${f.id}"][data-campo="${f.campo}"]`);
    if (el && document.activeElement !== el) { el.focus(); el.select?.(); }
    focoPendiente.current = null;
  }, [servicio]);

  const [addingDetalle, setAddingDetalle] = useState(false);
  const [modoMultiple, setModoMultiple] = useState(false);
  const [seleccionMultiple, setSeleccionMultiple] = useState({});
  const [filtroCategoriaMulti, setFiltroCategoriaMulti] = useState([]);
  const [busquedaMulti, setBusquedaMulti] = useState("");
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
  const [pdfTipo, setPdfTipo] = useState("recibo");
  const [searchParams, setSearchParams] = useSearchParams();
  const [eligiendoCV, setEligiendoCV] = useState(false);

  // Orden recién abierta (sin cliente o sin vehículo): se pide de inmediato
  useEffect(() => {
    if (servicio && servicio.status === "abierto" && (!servicio.id_cliente || !servicio.id_vehiculo)) setEligiendoCV(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicio?.id_servicio]);

  async function guardarClienteVehiculo(datos) {
    try {
      const actualizado = await api.put(`/servicios/${id}`, datos);
      setServicio(actualizado);
      setEligiendoCV(false);
      load();
      notify("Cliente y vehículo guardados en la orden.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  // Viniendo de "Nueva orden": abre directo el alta de refacciones
  useEffect(() => {
    if (servicio && searchParams.get("agregar") === "1" && servicio.status === "abierto") {
      setAddingDetalle(true);
      const p = new URLSearchParams(searchParams);
      p.delete("agregar");
      setSearchParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicio?.id_servicio]);

  // Catálogos para capturar los datos del vehículo directo en la orden
  const [catVeh, setCatVeh] = useState(null);
  const puedeEditarVeh = !!servicio?.vehiculo && !!servicio && servicio.status === "abierto" && hasPermission("servicios.editar");
  useEffect(() => {
    if (!puedeEditarVeh || catVeh) return;
    Promise.all([api.get("/vehiculos-marcas/"), api.get("/vehiculos-modelos/"), api.get("/colores-vehiculos/")])
      .then(([marcas, modelos, colores]) => setCatVeh({ marcas, modelos, colores }))
      .catch(() => {});
  }, [puedeEditarVeh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guarda un dato del vehículo (o del km de la orden) en cuanto se captura
  async function guardarCampoVehiculo(cambios) {
    const veh = servicio.vehiculo;
    const clavesVeh = ["id_marca_vehiculo", "id_modelo_vehiculo", "id_color", "placas_vehiculo", "numserie_vehiculo"];
    const clavesOrden = ["km_llegada", "km_proximo_servicio"];
    try {
      if (clavesVeh.some((k) => k in cambios)) {
        await api.put(`/vehiculos/${veh.id_vehiculo}`, {
          id_cliente: veh.id_cliente, id_marca_vehiculo: veh.id_marca_vehiculo ?? null, id_modelo_vehiculo: veh.id_modelo_vehiculo ?? null,
          id_color: veh.id_color ?? null, placas_vehiculo: veh.placas_vehiculo || null, numserie_vehiculo: veh.numserie_vehiculo || null,
          cilindraje_vehiculo: veh.cilindraje_vehiculo ?? null, id_year_vehiculo: veh.id_year_vehiculo ?? null, km_vehiculo: veh.km_vehiculo ?? null,
          comentarios: veh.comentarios ?? null, estado_vehiculo: veh.estado_vehiculo || "activo",
          ...Object.fromEntries(clavesVeh.filter((k) => k in cambios).map((k) => [k, cambios[k] === "" ? null : cambios[k]])),
        });
      }
      if (clavesOrden.some((k) => k in cambios)) {
        await api.put(`/servicios/${servicio.id_servicio}`, Object.fromEntries(clavesOrden.filter((k) => k in cambios).map((k) => [k, cambios[k] || null])));
      }
      notify("Cambios guardados.", "success");
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function load() {
    const s = await api.get(`/servicios/${id}`);
    setServicio(s);
    setComentariosFinales(s.comentarios_finales || "");
    setComentariosGuardados(s.comentarios_finales || "");
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

  // Guardado automático: 1 segundo después de dejar de escribir
  useEffect(() => {
    if (!servicio || comentariosFinales === comentariosGuardados) return undefined;
    const t = setTimeout(async () => {
      setGuardandoComentarios(true);
      try {
        await api.put(`/servicios/${id}`, { comentarios_finales: comentariosFinales });
        setComentariosGuardados(comentariosFinales);
      } catch (err) {
        notify(err.message, "error");
      } finally {
        setGuardandoComentarios(false);
      }
    }, 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comentariosFinales, comentariosGuardados, servicio]);

  if (!servicio) return <div className="loading-text">Cargando orden…</div>;

  const fmt = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
  const abierta = servicio.status === "abierto";

  async function handleAddDetalle(values) {
    try {
      // Si se eligió una refacción del catálogo y no se escribió a mano la
      // descripción o el costo, se toman directo de ahí — así la refacción
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
            `${a.nivel === "critico" ? " Stock crítico" : " Stock bajo"}: "${a.nombre_refaccion}" — quedan ${a.cantidad_actual}`,
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
      notify("Elige al menos una refacción para agregar.", "error");
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

  async function borrarTodasRefacciones() {
    const n = servicio.detalles.length;
    const ok = await confirmDialog(`¿Borrar ${n === 1 ? "la refacción" : `las ${n} refacciones`} de esta orden? Las piezas que se descontaron regresan al inventario. Esta acción no se puede deshacer.`, { danger: true });
    if (!ok) return;
    try {
      await api.del(`/servicios/${id}/detalles`);
      notify("Listo: se quitaron todas las refacciones de la orden.", "success");
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function handleDeleteAbono(abonoId) {
    const ok = await confirmDialog("¿Borrar este abono? El saldo pendiente de la orden se volverá a calcular.", { danger: true });
    if (!ok) return;
    try {
      const actualizado = await api.del(`/servicios/${id}/abonos/${abonoId}`);
      if (actualizado?.id_servicio) setServicio(actualizado); else load();
      notify("El abono se borró y el saldo se actualizó.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function handleDeleteDetalle(detalleId) {
    const ok = await confirmDialog("¿Quitar esta refacción de la orden? Si estaba ligada al inventario, la pieza regresa al stock.", { danger: true });
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
      const ok = await confirmDialog("¿Cancelar esta orden de servicio? Si fue un error, podrás reabrirla más adelante.", { danger: true });
      if (!ok) return;
    }
    try {
      const actualizado = await api.put(`/servicios/${id}`, { status: nuevo });
      load();
      if (nuevo !== "abierto") notify("Se actualizó el estado de la orden.", "success");
      if (actualizado.alertas_stock?.length > 0) {
        actualizado.alertas_stock.forEach((a) => {
          const proveedorTexto = a.proveedor ? ` · Proveedor: ${a.proveedor.nombre}${a.proveedor.telefono ? " (" + a.proveedor.telefono + ")" : ""}` : "";
          notify(
            `${a.nivel === "critico" ? " Stock crítico" : " Stock bajo"}: "${a.nombre_refaccion}"${a.numero_refaccion ? " (" + a.numero_refaccion + ")" : ""} — quedan ${a.cantidad_actual}${proveedorTexto}`,
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
      notify("Se cambió el responsable de la orden.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  // La base guarda UTC: se muestra la fecha en hora de México (UTC-6) para que coincida con el PDF
  const fechaLocal = (iso) => {
    if (!iso) return "";
    const d = new Date(new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime() - 6 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  };

  async function cambiarFecha(campo, valor) {
    try {
      const actualizado = await api.put(`/servicios/${id}`, { [campo]: valor ? `${valor}T12:00:00` : null });
      setServicio(actualizado);
      notify("Se actualizó la fecha.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  // Imprime la nota directo (sin descargar ni abrir pestañas)
  async function imprimirNota(tipo = "remision") {
    setDescargando(true);
    try {
      const ruta = tipo === "remision" ? `/api/servicios/${id}/nota-remision` : `/api/servicios/${id}/recibo`;
      const res = await fetch(ruta, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo generar la nota.");
      }
      const url = URL.createObjectURL(await res.blob());
      const marco = document.createElement("iframe");
      marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      marco.src = url;
      marco.onload = () => {
        try { marco.contentWindow.focus(); marco.contentWindow.print(); } catch (e) { window.open(url, "_blank"); }
        setTimeout(() => { marco.remove(); URL.revokeObjectURL(url); }, 60000);
      };
      document.body.appendChild(marco);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setDescargando(false);
    }
  }

  // WhatsApp al cliente: se genera el PDF de la nota y se manda como archivo con un texto corto.
  // En celular se abre el menú de compartir con el PDF ya adjunto; en computadora el PDF se descarga
  // y se abre WhatsApp Web con el chat del cliente y el texto listo para adjuntarlo.
  async function enviarWhatsApp() {
    const digitos = String(servicio.cliente?.telefono1 || "").replace(/\D/g, "").slice(-10);
    if (digitos.length !== 10) {
      notify("El cliente no tiene un teléfono de 10 dígitos registrado. Corrígelo en su ficha para poder enviar el mensaje.", "error");
      return;
    }
    const tipo = servicio.status === "cerrado" ? "remision" : "recibo";
    const taller = datosTaller?.nombre_taller;
    const nombre = servicio.cliente?.nombre_cliente || "";
    const texto = (servicio.status === "cerrado"
      ? `Hola ${nombre}, te comparto tu nota. Ya puedes pasar por tu vehículo. ¡Gracias por tu confianza!`
      : `Hola ${nombre}, te comparto la nota de tu orden. Seguimos trabajando en tu vehículo y te avisamos cuando esté listo. ¡Gracias por tu confianza!`)
      + (taller ? `\n— ${taller}` : "");
    setDescargando(true);
    try {
      const ruta = tipo === "remision" ? `/api/servicios/${id}/nota-remision` : `/api/servicios/${id}/recibo`;
      const res = await fetch(ruta, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo generar la nota.");
      }
      const blob = await res.blob();
      const archivo = new File([blob], nombrePdf(tipo), { type: "application/pdf" });
      const esMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      if (esMovil && navigator.canShare?.({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo], text: texto });
          return;
        } catch (err) {
          if (err?.name === "AbortError") return; // la persona cerró el menú de compartir
        }
      }
      // Sin soporte para compartir archivos: se descarga el PDF y se abre el chat con el texto
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = archivo.name;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      // En computadora se abre WhatsApp Web con el chat del cliente y el texto listo
      const destino = esMovil ? "https://wa.me/52" + digitos : `https://web.whatsapp.com/send?phone=52${digitos}`;
      window.open(`${destino}${esMovil ? "?" : "&"}text=${encodeURIComponent(texto)}`, "_blank", "noopener");
      notify(esMovil ? `La nota se descargó como «${archivo.name}». En WhatsApp toca el clip y adjúntala.` : `Nota descargada. En WhatsApp Web arrastra «${archivo.name}» al chat (se abre la vista previa para agregar comentarios) o usa el clip (+).`, "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setDescargando(false);
    }
  }

  async function confirmarCierre() {
    if (textoConfirmar !== "CONFIRMAR") {
      marcarCampo(document.querySelector(".modal-backdrop:last-of-type .modal input"), "Escribe CONFIRMAR, en mayúsculas");
      return;
    }
    setCerrando(true);
    try {
      await cambiarStatus("cerrado");
      setModalCierre(false);
      setTextoConfirmar("");
      notify("Orden finalizada. Se está preparando la nota; puedes mandársela al cliente con «Enviar por WhatsApp».", "success");
      await imprimirNota("remision");
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

  function nombrePdf(tipo) {
    const cli = [servicio?.cliente?.nombre_cliente, servicio?.cliente?.paterno_cliente].filter(Boolean).join(" ") || `orden ${id}`;
    const veh = [servicio?.vehiculo?.marca?.nombre_marca, servicio?.vehiculo?.modelo?.nombre_modelo, servicio?.vehiculo?.id_year_vehiculo].filter(Boolean).join(" ");
    const base = [tipo === "remision" ? "Nota" : "Orden", cli, veh].filter(Boolean).join(" - ");
    return `${base.replace(/[\\/:*?"<>|]/g, "")}.pdf`;
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
        setPdfTipo(tipo);
        setPdfPreviewUrl(url);
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = nombrePdf(tipo);
      a.click();
      URL.revokeObjectURL(url);
      if (modo === "preview") notify("La nota se descargó. Ábrela con el visor de PDF de tu equipo.", "success");
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
          <h1 className="orden-hero-titulo">
            <IconoModulo ruta="/servicios" /> Orden #{servicio.id_servicio}
            <span className={`badge badge-${servicio.status === "abierto" ? "petrol" : servicio.status === "cerrado" ? "teal" : "red"}`}>
              {servicio.status === "cerrado" ? "finalizada" : servicio.status}
            </span>
            {servicio.pagado && <span className="badge badge-teal">pagada</span>}
          </h1>
          <div className="orden-hero-herramientas">
            <span className="tip-envoltura" title={servicio.detalles.length > 0 ? "Vista previa de la nota (incluye la inspección, si ya se hizo)" : "La vista previa se activa cuando ya se agregó al menos una refacción"}>
              <button className="icon-btn" onClick={() => descargarPdf("recibo", "preview")} disabled={descargando || servicio.detalles.length === 0}><IconoAuto valor="🔍" size={18} /></button>
            </span>
            {servicio.status === "cerrado" && (
            <span className="tip-envoltura" title="Descargar el recibo en PDF">
              <button className="btn btn-secondary" onClick={() => descargarPdf("recibo")} disabled={descargando}>
                <IconoAuto valor="🖨️" size={18} /> {descargando ? "Generando…" : "Descargar recibo"}
              </button>
            </span>
            )}
          </div>
        </div>

        <div className="orden-hero-grid">
          <div className="orden-hero-bloque" style={{ "--acc": "var(--teal-600)", "--acc-soft": "var(--teal-100)", cursor: abierta ? "pointer" : "default" }}
            onClick={() => abierta && hasPermission("servicios.editar") && setEligiendoCV(true)} title={abierta ? "Elegir o cambiar el cliente y el vehículo" : undefined}>
            <span className="orden-hero-icono"><IconoAuto valor="🧑" size={22} /></span>
            <div>
              <div className="orden-hero-etiqueta">Cliente</div>
              <div className="orden-hero-valor">{servicio.cliente ? `${servicio.cliente.nombre_cliente} ${servicio.cliente.paterno_cliente || ""}` : "Toca para elegir…"}</div>
              <div className="orden-hero-meta">{servicio.cliente?.numero_cuenta}{servicio.cliente?.telefono1 ? ` · ${servicio.cliente.telefono1}` : ""}</div>
            </div>
          </div>
          <div className="orden-hero-bloque" style={{ "--acc": "var(--blue-600)", "--acc-soft": "var(--blue-100)", cursor: abierta ? "pointer" : "default" }}
            onClick={() => abierta && hasPermission("servicios.editar") && setEligiendoCV(true)} title={abierta ? "Elegir o cambiar el cliente y el vehículo" : undefined}>
            <span className="orden-hero-icono"><IconoAuto valor="🚗" size={22} /></span>
            <div>
              <div className="orden-hero-etiqueta">Vehículo</div>
              <div className="orden-hero-valor">
                {[servicio.vehiculo?.marca?.nombre_marca, servicio.vehiculo?.modelo?.nombre_modelo].filter(Boolean).join(" ") || (servicio.id_cliente ? "Toca para elegir…" : "—")}
              </div>
              <div className="orden-hero-meta">{servicio.vehiculo?.numero_cuenta} · Placas {servicio.vehiculo?.placas_vehiculo || "—"}</div>
            </div>
          </div>
          <div className="orden-hero-bloque" style={{ "--acc": "var(--violet-600)", "--acc-soft": "var(--violet-100)" }}>
            <span className="orden-hero-icono"><IconoAuto valor="👷" size={22} /></span>
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

        <div className="orden-hero-fechas">
          <label className="orden-fecha">
            <span>Fecha de entrada</span>
            <SelectorFecha value={fechaLocal(servicio.fecha_entrada_servicio)} max={fechaLocal(servicio.fecha_salida_servicio) || undefined} disabled={!hasPermission("servicios.editar")} required
              onChange={(v) => v && cambiarFecha("fecha_entrada_servicio", v)} />
          </label>
          <label className="orden-fecha">
            <span>Fecha de salida</span>
            <SelectorFecha value={fechaLocal(servicio.fecha_salida_servicio)} min={fechaLocal(servicio.fecha_entrada_servicio)} disabled={!hasPermission("servicios.editar")}
              onChange={(v) => cambiarFecha("fecha_salida_servicio", v)} />
            {!servicio.fecha_salida_servicio && <small>Sin capturar: la nota usa la fecha en que se genera.</small>}
          </label>
        </div>

      </div>

      <div className="datos-3-bloques">
        <div className="nota-bloque">
          <div className="nota-bloque-header"><span className="icono"><IconoAuto valor="🧑" size={18} /></span><h2>Datos del cliente</h2></div>
          <div className="nota-bloque-body">
            <dl className="datos-lista">
              <div className="dato"><dt>ID / Cuenta</dt><dd>{servicio.cliente?.numero_cuenta || "—"}</dd></div>
              <div className="dato ancho"><dt>Nombre</dt><dd>{servicio.cliente?.nombre_cliente} {servicio.cliente?.paterno_cliente || ""}</dd></div>
              <div className="dato"><dt>Teléfono</dt><dd>{servicio.cliente?.telefono1 || "—"}</dd></div>
            </dl>
          </div>
        </div>

        <div className="nota-bloque">
          <div className="nota-bloque-header"><span className="icono"><IconoAuto valor="🚗" size={18} /></span><h2>Datos del vehículo</h2>
          </div>
          <div className="nota-bloque-body datos-vehiculo-body">
            {(() => {
              const veh = servicio.vehiculo;
              const ed = puedeEditarVeh && catVeh;
              const texto = (etq, valor, campo) => (
                <div className="dato">
                  <dt>{etq}</dt>
                  <dd>{ed ? (
                    <input className="veh-input" key={`${campo}-${valor ?? ""}`} defaultValue={valor ?? ""} placeholder="Capturar"
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(valor ?? "")) guardarCampoVehiculo({ [campo]: v }); }} />
                  ) : (valor || "—")}</dd>
                </div>
              );
              const lista = (etq, valor, campo, opciones, mostrar, deshabilitado) => (
                <div className="dato">
                  <dt>{etq}</dt>
                  <dd>{ed ? (
                    <select className="veh-input" value={valor ?? ""} disabled={deshabilitado}
                      onChange={(e) => guardarCampoVehiculo(campo === "id_marca_vehiculo" ? { id_marca_vehiculo: e.target.value ? Number(e.target.value) : null, id_modelo_vehiculo: null } : { [campo]: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Elegir…</option>
                      {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (mostrar || "—")}</dd>
                </div>
              );
              return (
                <dl className="datos-lista">
                  {lista("Marca", veh?.id_marca_vehiculo, "id_marca_vehiculo", (catVeh?.marcas || []).map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca })), veh?.marca?.nombre_marca)}
                  {lista("Modelo", veh?.id_modelo_vehiculo, "id_modelo_vehiculo", (catVeh?.modelos || []).filter((m) => m.id_marca_vehiculo === Number(veh?.id_marca_vehiculo)).map((m) => ({ value: m.id_modelo_vehiculo, label: m.nombre_modelo })), veh?.modelo?.nombre_modelo, !veh?.id_marca_vehiculo)}
                  {texto("Km", servicio.km_llegada, "km_llegada")}
                  {texto("Próximo servicio (km)", servicio.km_proximo_servicio, "km_proximo_servicio")}
                  {lista("Color", veh?.id_color, "id_color", (catVeh?.colores || []).map((c) => ({ value: c.id_color, label: c.nombre_color })), veh?.color?.nombre_color)}
                  {texto("Placa", veh?.placas_vehiculo, "placas_vehiculo")}
                  {texto("VIN", veh?.numserie_vehiculo, "numserie_vehiculo")}
                </dl>
              );
            })()}
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
          <div className="nota-bloque-header"><span className="icono"><IconoAuto valor="🏢" size={18} /></span><h2>Datos del taller</h2></div>
          <div className="nota-bloque-body datos-vehiculo-body">
            {datosTaller ? (
              <dl className="datos-lista">
                <div className="dato ancho"><dt>Nombre</dt><dd>{datosTaller.nombre_taller || "—"}</dd></div>
                <div className="dato ancho"><dt>Dirección</dt><dd>{datosTaller.direccion || "—"}</dd></div>
                <div className="dato"><dt>RFC</dt><dd>{datosTaller.rfc || "—"}</dd></div>
                <div className="dato"><dt>Código postal</dt><dd>{datosTaller.cp || "—"}</dd></div>
                <div className="dato ancho"><dt>Calle</dt><dd>{datosTaller.calle || "—"}</dd></div>
                <div className="dato"><dt>Estado</dt><dd>{datosTaller.estado?.nombre_estado || "—"}</dd></div>
                <div className="dato"><dt>Municipio</dt><dd>{datosTaller.ciudad?.nombre_ciudad || "—"}</dd></div>
                <div className="dato"><dt>Número</dt><dd>{datosTaller.numero_taller || "—"}</dd></div>
              </dl>
            ) : (
              <div className="empty-state">Cargando…</div>
            )}
          </div>
          <div className="nota-bloque-body" style={{ paddingTop: 0 }}>
            <Link to="/configuracion-taller" className="datos-taller-editar">Editar datos del taller →</Link>
          </div>
        </div>
      </div>

      {!abierta && (
        <div className="panel" style={{ borderLeft: "4px solid var(--red-600)", padding: "12px 16px" }}>
          Esta orden está <b>{servicio.status}</b>: las refacciones y abonos ya no se pueden editar. Reábrela con el botón de arriba si necesitas hacer cambios.
        </div>
      )}

      {servicio.es_garantia && (
        <div className="panel" style={{ borderLeft: "4px solid #b5730a", padding: "12px 16px" }}>
          <IconoAuto valor="🛡️" size={18} /> <b>Esta orden es una reclamación de garantía</b> de la{" "}
          <Link to={`/servicios/${servicio.id_servicio_original}`}>orden #{servicio.id_servicio_original}</Link>.
          {servicio.motivo_garantia && <div style={{ marginTop: 6, fontSize: 13 }}>Motivo: {servicio.motivo_garantia}</div>}
        </div>
      )}

      {reclamaciones.length > 0 && (
        <div className="panel" style={{ borderLeft: "4px solid #b5730a" }}>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}><IconoAuto valor="🛡️" size={18} /> Este vehículo volvió por esto ({reclamaciones.length})</h2>
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
            <button className="btn btn-agregar" onClick={() => setAddingAbono(true)} disabled={!abierta}>
              <Icono nombre="cash" size={18} /> Registrar abono
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {hasPermission("servicios.editar") && abierta && servicio.detalles.length > 0 && (
              <button className="btn btn-agregar btn-borrar-todo" onClick={borrarTodasRefacciones}>
                <Icono nombre="trash" size={18} /> Borrar todas
              </button>
            )}
            <button className="btn btn-agregar" onClick={() => setAddingDetalle(true)} disabled={!abierta}>
              <Icono nombre="add" size={18} /> Agregar refacción
            </button>
          </div>
        }
      >
        {servicio.detalles.length === 0 ? (
          <div className="empty-state">Esta orden todavía no tiene refacciones. Usa «Agregar refacción» para empezar.</div>
        ) : (
          <table className="tabla-refacciones">
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Categoría</th>
                <th>Cantidad</th>
                <th>Precio unitario</th>
                <th>Precio final</th>
                <th aria-label="Acciones"></th>
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
                    {grupos[clave].map(({ d, ref }) => (
                      <tr key={d.id_servicio_detalle}>
                        <td>{d.descripcion || "—"}</td>
                        <td className="celda-categoria"><span className="chip-cat-ref">{clave}</span></td>
                        <td>
                          <input
                            key={`c-${d.id_servicio_detalle}-${d.cantidad}`} data-det={d.id_servicio_detalle} data-campo="c" onKeyDown={(e) => irSiguienteRefaccion(e, "c")} type="number" defaultValue={d.cantidad || 1} disabled={!abierta}
                            onBlur={(e) => { const v = Number(e.target.value) || 1; if (v !== d.cantidad) handleUpdateDetalle(d.id_servicio_detalle, { cantidad: v }); }}
                          />
                        </td>
                        <td>
                          <input
                            key={`u-${d.id_servicio_detalle}-${d.costo_refaccion}-${d.cantidad}`} data-det={d.id_servicio_detalle} data-campo="u" onKeyDown={(e) => irSiguienteRefaccion(e, "u")} type="number" step="0.01"
                            defaultValue={Math.round(((d.costo_refaccion || 0) / (d.cantidad || 1)) * 100) / 100} disabled={!abierta}
                            onBlur={(e) => {
                              const v = Number(e.target.value) || 0;
                              const cant = d.cantidad || 1;
                              if (v === 0) { handleUpdateDetalle(d.id_servicio_detalle, { costo_refaccion: 0, cantidad: 1 }); return; }
                              const total = Math.round(v * cant * 100) / 100;
                              if (total !== d.costo_refaccion) handleUpdateDetalle(d.id_servicio_detalle, { costo_refaccion: total, cantidad: cant });
                            }}
                          />
                        </td>
                        <td className="celda-total">{fmt(d.costo_refaccion || 0)}</td>
                        <td>
                          <button className="btn btn-danger btn-sm" title="Quitar" aria-label="Quitar" onClick={() => handleDeleteDetalle(d.id_servicio_detalle)} disabled={!abierta}><Icono nombre="trash" size={18} /></button>
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
            <h3 className="titulo-abonos">Abonos registrados</h3>
            <table className="tabla-abonos">
              <thead>
                <tr><th>#</th><th>Fecha</th><th>Tipo de pago</th><th>Monto</th><th>Cambio</th><th>Comentario</th><th aria-label="Acciones"></th></tr>
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
                      <td>
                        {hasPermission("servicios.editar") && (
                          <button className="btn btn-danger btn-sm" title="Borrar abono" aria-label="Borrar abono" onClick={() => handleDeleteAbono(a.id_abono)} disabled={!abierta || servicio.pagado}><Icono nombre="trash" size={18} /></button>
                        )}
                      </td>
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
        <div className="autoguardado">
          {guardandoComentarios || comentariosFinales !== comentariosGuardados ? "Guardando…" : comentariosFinales ? "✓ Guardado automáticamente" : ""}
        </div>
      </BloqueNota>

      <BloqueNota icono="📸" titulo="Fotos">
        <FotoGaleria entidadTipo="servicio" entidadId={servicio.id_servicio} puedeEditar={hasPermission("servicios.editar")} />
      </BloqueNota>

      </div>

      <aside className="orden-aside">
        <div className="nota-bloque lateral-bloque">
          <div className="nota-bloque-header">
            <span className="icono"><IconoAuto valor="🧾" size={18} /></span>
            <h2>Opciones de la nota</h2>
          </div>
          <div className="nota-bloque-body">
            <div className="lateral-acciones">
              {abierta && (
                <button className="btn btn-primary" onClick={() => setModalCierre(true)} title="Cobrar, cerrar la orden, generar la nota y avisar al cliente">
                  <IconoAuto valor="🧾" size={18} /> Finalizar y generar nota
                </button>
              )}
              {servicio.detalles.length > 0 && (
                <button className="btn btn-primary" onClick={() => imprimirNota(servicio.status === "cerrado" ? "remision" : "recibo")} disabled={descargando} title="Imprimir la nota ahora">
                  <IconoAuto valor="🖨️" size={18} /> Imprimir nota
                </button>
              )}
              <button className="btn btn-secondary" onClick={enviarWhatsApp} title="Abrir WhatsApp con el resumen de la orden para el cliente">
                <IconoAuto valor="💬" size={18} /> Enviar por WhatsApp
              </button>
              {servicio.status === "cerrado" && (
                <button className="btn btn-secondary" onClick={() => descargarPdf("remision")} disabled={descargando} title="Descargar la nota de remisión en PDF">
                  <IconoAuto valor="📋" size={18} /> Nota de remisión
                </button>
              )}
              {facturaOrden ? (
                <Link className="btn btn-secondary" to="/facturacion" title="Ver la factura de esta orden">
                  <IconoAuto valor="📑" size={18} /> Factura {facturaOrden.serie}-{facturaOrden.folio}{facturaOrden.estado !== "timbrada" ? " (cancelación pendiente)" : ""}
                </Link>
              ) : servicio.status === "cerrado" && hasPermission("facturacion.crear") && (
                <button className="btn btn-secondary" onClick={() => navigate("/facturacion", { state: { idServicio: servicio.id_servicio } })} title="Emitir la factura (CFDI) de esta orden">
                  <IconoAuto valor="📑" size={18} /> Facturar
                </button>
              )}
              {servicio.status === "cerrado" && !servicio.es_garantia && hasPermission("servicios.crear") && (
                <button className="btn btn-secondary" onClick={() => navigate("/servicios", { state: { garantiaOriginal: servicio } })} title="Abrir una orden de garantía ligada a esta">
                  <IconoAuto valor="🛡️" size={18} /> Reclamar garantía
                </button>
              )}
              {!abierta && (
                <button className="btn btn-secondary" onClick={() => cambiarStatus("abierto")} title="Volver a abrir la orden para editarla">↺ Reabrir orden</button>
              )}
              {servicio.status !== "cancelado" && servicio.status !== "cerrado" && !(servicio.costos.total_abonado > 0 && servicio.costos.saldo_pendiente <= 0) && (
                <button className="btn btn-danger" onClick={() => cambiarStatus("cancelado")} title="Cancelar la orden (solo si no está pagada)"><IconoAuto valor="✕" size={18} /> Cancelar orden</button>
              )}
            </div>
          </div>
        </div>
        <EstatusLateral servicio={servicio} puedeEditar={hasPermission("servicios.editar")} onActualizado={setServicio} />
      </aside>
      </div>

      {eligiendoCV && (
        <ElegirClienteVehiculo
          idCliente={servicio.id_cliente}
          idVehiculo={servicio.id_vehiculo}
          onConfirmar={guardarClienteVehiculo}
          onCerrar={() => setEligiendoCV(false)}
        />
      )}

      {pdfPreviewUrl && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); } }}>
          <div className="modal modal-pdf">
            <div className="modal-pdf-header">
              <span><IconoAuto valor="📄" size={18} /> Vista previa de la nota</span>
              <div style={{ display: "flex", gap: 10 }}>
                <a className="btn btn-secondary btn-sm" href={pdfPreviewUrl} download={nombrePdf(pdfTipo)}>Descargar</a>
                <button className="btn btn-secondary btn-sm" onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}>Cerrar <IconoAuto valor="✕" size={18} /></button>
              </div>
            </div>
            <iframe src={`${pdfPreviewUrl}#toolbar=0`} title="Vista previa de la nota" className="modal-pdf-frame" />
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
        <IconoAuto valor="💬" size={18} />
      </button>
      {chatAbierto && (
        <div className="chat-flotante">
          <div className="chat-flotante-header">
            <span><IconoAuto valor="💬" size={18} /> Chat de la orden</span>
            <button className="chat-flotante-cerrar" title="Cerrar chat" onClick={() => setChatAbierto(false)}><IconoAuto valor="✕" size={18} /></button>
          </div>
          <div className="chat-flotante-body">
            <ChatOrden servicioId={servicio.id_servicio} nombreCliente={`${servicio.cliente?.nombre_cliente || ""} ${servicio.cliente?.paterno_cliente || ""}`.trim()} />
          </div>
        </div>
      )}

      {addingDetalle && (() => {
        const q = busquedaMulti.trim().toLowerCase();
        const refaccionesFiltradas = refacciones.filter((r) =>
          (filtroCategoriaMulti.length === 0 || filtroCategoriaMulti.includes(r.categoria || "Sin categoría")) &&
          (!q || contiene(r.nombre_refaccion || "", q))
        );
        // Se muestran TODAS las refacciones del catálogo — si el vehículo de esta
        // orden tiene inventario específico, se usa ese stock/precio real.
        function inventarioDe(idRefaccion) {
          return inventarioVehiculo.find((inv) => inv.id_refaccion === idRefaccion);
        }
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
          <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setAddingDetalle(false)}>
            <div className="modal modal-grande add-ref">
              <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={cerrar}><Icono nombre="close" size={20} /></button>
              <div className="add-ref-cab">
                <h2>Agregar refacciones</h2>
                <input className="add-ref-buscar" placeholder="Buscar refacción…" value={busquedaMulti} onChange={(e) => setBusquedaMulti(e.target.value)} />
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
                          const inv = inventarioDe(r.id_refaccion);
                          const marcada = !!seleccionMultiple[r.id_refaccion];
                          const stock = inv ? inv.cantidad : (r.cantidad_refaccion ?? 0);
                          const precio = (inv ? inv.preciocliente : r.preciocliente_refaccion) || (inv ? inv.preciopropio : r.preciopropio_refaccion) || 0;
                          const cant = seleccionMultiple[r.id_refaccion]?.cantidad || 1;
                          return (
                            <div key={r.id_refaccion} className={`add-ref-tarjeta ${marcada ? "on" : ""}`} onClick={() => alternarSeleccionMultiple(r.id_refaccion, !marcada)}>
                              <span className="add-ref-check">{marcada ? "✓" : "+"}</span>
                              <div className="add-ref-nombre">{r.nombre_refaccion}</div>
                              <div className="add-ref-meta">
                                <span className={`add-ref-stock ${stock <= 0 ? "cero" : ""}`}>Stock {stock}</span>
                                {precio > 0 && <span className="add-ref-precio">${precio}</span>}
                                {<span className={"add-ref-aviso add-ref-cantidad" + (marcada ? " on" : "")} title={!inv ? "Sin inventario para este vehículo — no se descontará stock" : undefined}>Cantidad {cant}</span>}
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
                <button className="btn btn-secondary" onClick={cerrar}>Cancelar</button>
                <button className="btn btn-primary" onClick={guardarSeleccionMultiple} disabled={guardandoMultiple || totalMarcadas === 0}>
                  {guardandoMultiple ? "Agregando…" : totalMarcadas ? `Agregar ${totalMarcadas} a la orden` : "Elige refacciones"}
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
            const campos = [];
            if (values.tipo_pago !== "mixto") campos.push({ name: "monto_abono", label: "Monto", type: "number", required: true, full: true, autofoco: true, grande: true });
            campos.push({
              name: "tipo_pago", label: "Tipo de pago", type: "select", full: values.tipo_pago === "mixto",
              options: [{ value: "efectivo", label: "Efectivo" }, { value: "tarjeta", label: "Pago con tarjeta" }, { value: "mixto", label: "Mixto" }],
            });
            if (values.tipo_pago === "mixto") {
              campos.push({ name: "desglose_mixto_efectivo", label: "Efectivo", type: "number", autofoco: true, grande: true });
              campos.push({ name: "desglose_mixto_tarjeta", label: "Tarjeta", type: "number", grande: true });
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
