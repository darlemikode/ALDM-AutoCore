import ScrollCampos from "../ui/ScrollCampos";
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, Platform, Modal, Switch, Image, ActivityIndicator, KeyboardAvoidingView } from "react-native";
import { Picker } from "../ui/Picker";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api, getToken, API_URL, urlArchivo } from "../api";
import { MODO_LOCAL } from "../localMode";
import { colors, spacing } from "../theme";
import FotoGaleria from "../components/FotoGaleria";
import EtapaTracker from "../components/EtapaTracker";
import ChatOrden from "../components/ChatOrden";
import InspeccionForm from "../components/InspeccionForm";
import { useAuth } from "../context/AuthContext";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";

/*
 * Detalle de la orden — misma organización que web-admin/src/pages/ServicioDetalle.jsx:
 *   1. Encabezado (orden, estatus, recibo) + Cliente / Vehículo / Responsable
 *   2. Datos del cliente · Datos del vehículo · Datos del taller
 *   3. Avisos (orden cerrada, garantía, reclamaciones)
 *   4. Resumen de costos (+ registrar abono, IVA)
 *   5. Refacciones (agregar con tarjetas, editar cantidad/costos, quitar) + abonos
 *   6. Comentarios finales · 7. Fotos
 *   8. Opciones de la nota (finalizar, remisión, factura, garantía, reabrir, cancelar)
 *   9. Estatus del servicio
 *   Botones flotantes: inspección del vehículo y chat de la orden.
 */

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TIPOS_PAGO = [
  { valor: "efectivo", texto: "Efectivo", icono: "cash-outline" },
  { valor: "tarjeta", texto: "Tarjeta", icono: "card-outline" },
  { valor: "mixto", texto: "Mixto", icono: "swap-horizontal-outline" },
];
const etiquetaPago = (t) => (t === "tarjeta" ? "Tarjeta" : t === "mixto" ? "Mixto" : "Efectivo");

function Bloque({ icono, titulo, accion, acento, children }) {
  return (
    <View style={[styles.bloque, acento && { borderTopColor: acento }]}>
      <View style={styles.bloqueHeader}>
        <View style={styles.bloqueTituloFila}>
          <Ionicons name={icono} size={18} color={colors.petrol600} />
          <Text style={styles.bloqueTitulo}>{titulo}</Text>
        </View>
        {accion}
      </View>
      {children}
    </View>
  );
}

function Dato({ etiqueta, valor }) {
  return (
    <View style={styles.datoFila}>
      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
      <Text style={styles.datoValor}>{valor || "—"}</Text>
    </View>
  );
}

function Boton({ texto, icono, onPress, tipo = "secundario", deshabilitado, cargando, chico, estilo }) {
  const t = {
    primario: [styles.btnPrimario, styles.btnPrimarioTexto, colors.paper100],
    secundario: [styles.btnSecundario, styles.btnSecundarioTexto, colors.ink900],
    peligro: [styles.btnPeligro, styles.btnPeligroTexto, colors.red600],
  }[tipo];
  return (
    <TouchableOpacity
      style={[t[0], chico && styles.btnChico, deshabilitado && { opacity: 0.45 }, estilo]}
      onPress={onPress}
      disabled={deshabilitado || cargando}
      activeOpacity={0.75}
    >
      {cargando ? <ActivityIndicator size="small" color={t[2]} /> : icono ? <Ionicons name={icono} size={chico ? 14 : 17} color={t[2]} /> : null}
      <Text style={[t[1], chico && styles.btnChicoTexto]}>{texto}</Text>
    </TouchableOpacity>
  );
}

// Campo numérico que guarda al terminar de editar (como el onBlur de la tabla web)
function NumeroEditable({ valor, onGuardar, editable, ancho }) {
  const [texto, setTexto] = useState(String(valor ?? 0));

  // Se sincroniza si el valor cambia desde afuera (otra pantalla, u otro
  // campo que recalculó este) y el usuario no lo está editando ahora mismo.
  useEffect(() => {
    setTexto(String(valor ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  function confirmar() {
    const n = Number(String(texto).replace(",", "."));
    if (Number.isNaN(n)) { setTexto(String(valor ?? 0)); return; }
    if (n !== Number(valor)) onGuardar(n);
  }

  return (
    <TextInput placeholderTextColor={colors.ink500}
      style={[styles.numInput, ancho ? { width: ancho } : { alignSelf: "stretch" }, !editable && { opacity: 0.55 }]}
      value={texto}
      onChangeText={setTexto}
      keyboardType="decimal-pad"
      editable={editable}
      selectTextOnFocus
      returnKeyType="done"
      // onEndEditing no es confiable en Android con teclado decimal-pad (a
      // veces no se dispara al tocar fuera del campo, así que el cambio se
      // quedaba sin detectar). onBlur sí se dispara siempre al perder el
      // foco; onSubmitEditing cubre además el caso de tocar "done" en el teclado.
      onBlur={confirmar}
      onSubmitEditing={confirmar}
    />
  );
}

export default function ServicioDetalleScreen({ route, navigation }) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const puedeEditar = hasPermission("servicios.editar");

  const [servicio, setServicio] = useState(null);
  const [refacciones, setRefacciones] = useState([]);
  const [inventarioVehiculo, setInventarioVehiculo] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [comisiones, setComisiones] = useState([]);
  const [datosTaller, setDatosTaller] = useState(null);
  const [fotoVehiculo, setFotoVehiculo] = useState(null);
  const [reclamaciones, setReclamaciones] = useState([]);
  const [factura, setFactura] = useState(null);
  const [inspeccionActual, setInspeccionActual] = useState(null);

  const [comentariosFinales, setComentariosFinales] = useState("");
  const [guardandoComentarios, setGuardandoComentarios] = useState(false);
  const [comentariosGuardados, setComentariosGuardados] = useState("");
  const [descargando, setDescargando] = useState(null);
  const [descargandoFactura, setDescargandoFactura] = useState(null);
  const [mostrandoInspeccion, setMostrandoInspeccion] = useState(false);
  const [chatAbierto, setChatAbierto] = useState(!!route.params?.abrirChat);

  // Si llegamos aquí desde la campanita (con params.abrirChat), se abre el
  // chat aunque la pantalla ya estuviera montada (mismo componente, params nuevos).
  useEffect(() => {
    if (route.params?.abrirChat) setChatAbierto(true);
  }, [route.params?.abrirChat]);

  // Modal: registrar abono
  const [modalAbono, setModalAbono] = useState(false);
  const [tipoPago, setTipoPago] = useState("efectivo");
  const [monto, setMonto] = useState("");
  const [montoEfectivo, setMontoEfectivo] = useState("");
  const [montoTarjeta, setMontoTarjeta] = useState("");
  const [comentarioAbono, setComentarioAbono] = useState("");
  const [guardandoAbono, setGuardandoAbono] = useState(false);

  const [pestana, setPestana] = useState("refacciones"); // refacciones | pagos | estatus | datos

  // Hoja "Agregar": del catálogo (selección múltiple) o concepto libre
  const [modalRefacciones, setModalRefacciones] = useState(false);
  const [modoAgregar, setModoAgregar] = useState("catalogo");
  const [libre, setLibre] = useState({ descripcion: "", id_tipo_servicio: "", cantidad: "1", costo_mano_obra: "", costo_refaccion: "", costo_extra: "" });
  const [seleccion, setSeleccion] = useState({});
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [busquedaRef, setBusquedaRef] = useState("");
  const [guardandoRefacciones, setGuardandoRefacciones] = useState(false);

  // Modal: finalizar orden
  const [modalCierre, setModalCierre] = useState(false);
  const [textoConfirmar, setTextoConfirmar] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [formaPagoFinal, setFormaPagoFinal] = useState("efectivo");
  const [recibidoFinal, setRecibidoFinal] = useState("");
  const [mixEfectivoFinal, setMixEfectivoFinal] = useState("");
  const [mixTarjetaFinal, setMixTarjetaFinal] = useState("");
  const [notificarFinal, setNotificarFinal] = useState(true);

  async function load() {
    const s = await api.get(`/servicios/${id}`);
    setServicio(s);
    setComentariosFinales(s.comentarios_finales || "");
    setComentariosGuardados(s.comentarios_finales || "");
    if (!s.es_garantia) api.get(`/servicios/${id}/reclamaciones`).then(setReclamaciones).catch(() => setReclamaciones([]));
    else setReclamaciones([]);
    api.get(`/inspecciones/?id_servicio=${id}`).then((l) => setInspeccionActual(l[0] || null)).catch(() => {});
    if (s.id_vehiculo) {
      api.get(`/fotos/?entidad_tipo=vehiculo&entidad_id=${s.id_vehiculo}`)
        .then((fotos) => setFotoVehiculo(Array.isArray(fotos) ? fotos[0] || null : null))
        .catch(() => setFotoVehiculo(null));
    }
    if (s.vehiculo?.id_marca_vehiculo) {
      api.get("/inventario-refacciones/").then((todas) => setInventarioVehiculo((todas || []).filter((r) =>
        (r.compatibilidades || []).some((c) => c.id_marca_vehiculo === s.vehiculo.id_marca_vehiculo && c.id_modelo_vehiculo === s.vehiculo.id_modelo_vehiculo)
      ))).catch(() => setInventarioVehiculo([]));
    }
  }

  useFocusEffect(
    useCallback(() => {
      load().catch((err) => alerta("Error", err.message));
      api.get("/refacciones/").then(setRefacciones).catch(() => setRefacciones([]));
      api.get("/tipos-servicio/").then(setTipos).catch(() => setTipos([]));
      api.get("/empleados/").then((d) => setEmpleados(d.filter((e) => e.activo !== false))).catch(() => setEmpleados([]));
      api.get("/comisiones/").then(setComisiones).catch(() => setComisiones([]));
      api.get("/configuracion-taller/").then(setDatosTaller).catch(() => setDatosTaller(null));
      if (hasPermission("facturacion.ver")) {
        api.get(`/facturacion/facturas?id_servicio=${id}`)
          .then((lista) => setFactura((lista || []).find((f) => f.estado !== "cancelada") || null))
          .catch(() => setFactura(null));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])
  );

  // ---------------- Acciones ----------------

  async function actualizar(cambios, mensaje) {
    try {
      const actualizado = await api.put(`/servicios/${id}`, cambios);
      setServicio(actualizado);
      if (mensaje) alerta("Listo", mensaje);
      return actualizado;
    } catch (err) {
      alerta("Error", err.message);
      return null;
    }
  }

  const reasignarEmpleado = (idEmpleado) => actualizar({ id_empleado_responsable: idEmpleado ? Number(idEmpleado) : null });
  const cambiarIva = (aplicar) => actualizar({ iva_porcentaje: aplicar ? 16 : 0 });

  function cambiarStatus(nuevo) {
    const hacer = async () => { const r = await actualizar({ status: nuevo }); if (r) load(); };
    if (nuevo === "cancelado") {
      alerta("Cancelar orden", "¿Cancelar esta orden de servicio? Podrás reabrirla después si te equivocas.", [
        { text: "No", style: "cancel" },
        { text: "Sí, cancelar", style: "destructive", onPress: hacer },
      ]);
    } else hacer();
  }

  // Guardado automático: 1 segundo después de dejar de escribir
  useEffect(() => {
    if (!servicio || comentariosFinales === comentariosGuardados) return undefined;
    const t = setTimeout(async () => {
      setGuardandoComentarios(true);
      try {
        await api.put(`/servicios/${id}`, { comentarios_finales: comentariosFinales });
        setComentariosGuardados(comentariosFinales);
      } catch (err) {
        alerta("Error", err.message);
      } finally {
        setGuardandoComentarios(false);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [comentariosFinales, comentariosGuardados, servicio, id]);

  // Los cambios a un concepto se mandan UNO TRAS OTRO (cola) y cada uno parte
  // de lo último que respondió el servidor. Antes, si escribías un monto y
  // tocabas + enseguida, las dos peticiones se cruzaban y el monto se perdía.
  // `cambios` puede ser un objeto o una función (detalleActual) => objeto.
  const servicioRef = useRef(null);
  const colaDetalles = useRef(Promise.resolve());
  useEffect(() => { servicioRef.current = servicio; }, [servicio]);
  // Aplica el cambio en pantalla al instante (sin esperar al servidor) y
  // recalcula los totales localmente; el servidor confirma después.
  function aplicarLocal(idDetalle, payload) {
    const base = servicioRef.current;
    if (!base) return;
    const detalles = base.detalles.map((x) => {
      if (x.id_servicio_detalle !== idDetalle) return x;
      const n = { ...x, ...payload };
      if (payload.cantidad != null && payload.costo_refaccion === undefined && (x.cantidad || 1) > 0) {
        n.costo_refaccion = Math.round(((Number(x.costo_refaccion) || 0) / (x.cantidad || 1)) * payload.cantidad * 100) / 100;
      }
      return n;
    });
    const subtotal = detalles.reduce((t, x) => t + (Number(x.costo_mano_obra) || 0) + (Number(x.costo_refaccion) || 0) + (Number(x.costo_extra) || 0), 0);
    const iva = subtotal * (base.iva_porcentaje || 0) / 100;
    const total = subtotal + iva;
    const abonado = base.costos?.total_abonado || 0;
    const r = (v) => Math.round(v * 100) / 100;
    const local = { ...base, detalles, costos: { ...base.costos, subtotal: r(subtotal), iva: r(iva), total: r(total), saldo_pendiente: r(total - abonado) } };
    servicioRef.current = local;
    setServicio(local);
  }

  const pendientesDetalle = useRef(0);
  function actualizarDetalle(idDetalle, cambios) {
    const actual = servicioRef.current?.detalles?.find((x) => x.id_servicio_detalle === idDetalle);
    const payload = typeof cambios === "function" ? cambios(actual) : cambios;
    if (!payload) return Promise.resolve();
    aplicarLocal(idDetalle, payload);
    pendientesDetalle.current += 1;
    colaDetalles.current = colaDetalles.current.then(async () => {
      try {
        const nuevo = await api.put(`/servicios/${id}/detalles/${idDetalle}`, payload);
        // solo se pisa con la respuesta del servidor cuando ya no hay más cambios en cola
        if (pendientesDetalle.current <= 1) { servicioRef.current = nuevo; setServicio(nuevo); }
      } catch (err) {
        alerta("Error", err.message);
        load();
      } finally {
        pendientesDetalle.current -= 1;
      }
    });
    return colaDetalles.current;
  }

  function quitarDetalle(idDetalle) {
    alerta("Quitar concepto", "¿Quitar este concepto de la orden? Si usaba una refacción, se regresa al inventario.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: async () => {
        try { await api.del(`/servicios/${id}/detalles/${idDetalle}`); load(); } catch (err) { alerta("Error", err.message); }
      } },
    ]);
  }

  // --- Refacciones (selección múltiple) ---
  const inventarioDe = (idRef) => inventarioVehiculo.find((i) => i.id_refaccion === idRef);
  function alternarSeleccion(idRef) {
    setSeleccion((prev) => {
      const copia = { ...prev };
      if (copia[idRef]) delete copia[idRef]; else copia[idRef] = { cantidad: 1 };
      return copia;
    });
  }
  const cambiarCantidadSel = (idRef, delta) => setSeleccion((prev) => ({ ...prev, [idRef]: { cantidad: Math.max(1, (prev[idRef]?.cantidad || 1) + delta) } }));

  async function guardarRefacciones() {
    const ids = Object.keys(seleccion).map(Number);
    if (ids.length === 0) { alerta("Nada seleccionado", "Toca al menos una refacción."); return; }
    for (const idRef of ids) {
      const inv = inventarioDe(idRef);
      const ref = refacciones.find((r) => r.id_refaccion === idRef);
      if (inv && inv.cantidad < seleccion[idRef].cantidad) {
        alerta("Sin stock suficiente", `"${ref?.nombre_refaccion}": disponible ${inv.cantidad}, pedido ${seleccion[idRef].cantidad}.`);
        return;
      }
    }
    setGuardandoRefacciones(true);
    try {
      // Una tras otra para que el descuento de inventario de cada una se aplique en orden
      for (const idRef of ids) {
        const ref = refacciones.find((r) => r.id_refaccion === idRef);
        const inv = inventarioDe(idRef);
        const precio = (inv ? inv.preciocliente : ref?.preciocliente_refaccion) || (inv ? inv.preciopropio : ref?.preciopropio_refaccion) || 0;
        await api.post(`/servicios/${id}/detalles`, {
          id_refaccion: idRef,
          descripcion: ref?.nombre_refaccion || null,
          cantidad: seleccion[idRef].cantidad,
          costo_refaccion: (Number(precio) || 0) * seleccion[idRef].cantidad,
          costo_extra: 0,
        });
      }
      setModalRefacciones(false);
      setSeleccion({});
      await load();
      alerta("Listo", `${ids.length} refacción(es) agregadas a la orden.`);
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardandoRefacciones(false);
    }
  }

  async function guardarConceptoLibre() {
    if (!libre.descripcion.trim()) { alerta("Falta la descripción", "Escribe qué se hizo o qué se cobra (ej. Mano de obra de afinación)."); return; }
    const total = (Number(libre.costo_mano_obra) || 0) + (Number(libre.costo_refaccion) || 0) + (Number(libre.costo_extra) || 0);
    if (total <= 0) { alerta("Falta el costo", "Captura al menos un importe (mano de obra, refacción o extra)."); return; }
    setGuardandoRefacciones(true);
    try {
      const actualizado = await api.post(`/servicios/${id}/detalles`, {
        descripcion: libre.descripcion.trim(),
        id_tipo_servicio: libre.id_tipo_servicio ? Number(libre.id_tipo_servicio) : null,
        id_refaccion: null,
        cantidad: Math.max(1, Number(libre.cantidad) || 1),
        costo_mano_obra: Number(libre.costo_mano_obra) || 0,
        costo_refaccion: Number(libre.costo_refaccion) || 0,
        costo_extra: Number(libre.costo_extra) || 0,
      });
      setServicio(actualizado);
      setModalRefacciones(false);
      setLibre({ descripcion: "", id_tipo_servicio: "", cantidad: "1", costo_mano_obra: "", costo_refaccion: "", costo_extra: "" });
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardandoRefacciones(false);
    }
  }

  function abrirAgregar(modo = "catalogo") {
    setSeleccion({}); setFiltroCategoria(""); setBusquedaRef(""); setModoAgregar(modo); setModalRefacciones(true);
  }

  // --- Abono ---
  function abrirAbono() {
    setTipoPago("efectivo"); setMonto(""); setMontoEfectivo(""); setMontoTarjeta(""); setComentarioAbono("");
    setModalAbono(true);
  }
  async function registrarAbono() {
    const esMixto = tipoPago === "mixto";
    const montoFinal = esMixto ? (Number(montoEfectivo) || 0) + (Number(montoTarjeta) || 0) : Number(monto);
    if (!montoFinal || montoFinal <= 0) { alerta("Monto inválido", "Ingresa un monto mayor a cero."); return; }
    setGuardandoAbono(true);
    try {
      const actualizado = await api.post(`/servicios/${id}/abonos`, {
        monto_abono: montoFinal,
        tipo_pago: tipoPago,
        desglose_mixto_efectivo: esMixto ? Number(montoEfectivo) || 0 : null,
        desglose_mixto_tarjeta: esMixto ? Number(montoTarjeta) || 0 : null,
        comentario: comentarioAbono.trim() || null,
      });
      setServicio(actualizado);
      setModalAbono(false);
      const ultimo = actualizado.abonos[actualizado.abonos.length - 1];
      if (ultimo?.cambio > 0) alerta("Pago registrado", `Cambio a devolver: ${fmt(ultimo.cambio)}`);
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardandoAbono(false);
    }
  }

  // --- Finalizar ---
  function abrirModalCierre() {
    setFormaPagoFinal("efectivo"); setRecibidoFinal(""); setMixEfectivoFinal(""); setMixTarjetaFinal("");
    setNotificarFinal(true); setTextoConfirmar(""); setModalCierre(true);
  }
  const saldoFinal = servicio?.costos?.saldo_pendiente || 0;
  const conSaldoFinal = saldoFinal > 0.005;
  const recibidoCalculado = !conSaldoFinal ? 0
    : formaPagoFinal === "mixto" ? (Number(mixEfectivoFinal) || 0) + (Number(mixTarjetaFinal) || 0)
      : formaPagoFinal === "tarjeta" ? (recibidoFinal === "" ? saldoFinal : Number(recibidoFinal))
        : Number(recibidoFinal) || 0;
  const cambioFinal = Math.max(recibidoCalculado - saldoFinal, 0);
  const faltaFinal = Math.max(saldoFinal - recibidoCalculado, 0);
  const pagoFinalListo = !conSaldoFinal || faltaFinal <= 0.005;

  async function confirmarCierre() {
    if (textoConfirmar !== "CONFIRMAR") return;
    if (!pagoFinalListo) { alerta("Falta cobrar", `Todavía falta ${fmt(faltaFinal)} para cubrir el saldo.`); return; }
    setCerrando(true);
    try {
      const payload = { comentarios_finales: comentariosFinales, notificar_cliente: notificarFinal };
      if (conSaldoFinal) {
        payload.tipo_pago = formaPagoFinal;
        if (formaPagoFinal === "mixto") {
          payload.desglose_mixto_efectivo = Number(mixEfectivoFinal) || 0;
          payload.desglose_mixto_tarjeta = Number(mixTarjetaFinal) || 0;
        } else payload.monto_recibido = recibidoCalculado;
      }
      const resultado = await api.post(`/servicios/${id}/finalizar`, payload);
      setServicio(resultado.servicio);
      setModalCierre(false);
      const avisos = [resultado.notificaciones?.push && "app", resultado.notificaciones?.correo && "correo", resultado.notificaciones?.chat && "chat"].filter(Boolean);
      alerta("Orden finalizada",
        `${resultado.cambio > 0 ? `Cambio a entregar: ${fmt(resultado.cambio)}. ` : ""}${avisos.length ? `Se avisó al cliente por ${avisos.join(", ")}.` : "Nota lista."}`);
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setCerrando(false);
    }
  }

  // --- PDFs ---
  async function descargarArchivo(ruta, nombreArchivo, mimeType) {
    if (MODO_LOCAL) {
      alerta("Disponible con servidor", "Los PDF se generan en el servidor. En modo local se podrán descargar cuando subas los cambios.");
      return;
    }
    const token = await getToken();
    if (Platform.OS === "web") {
      const res = await fetch(ruta, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("No se pudo generar el documento.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = nombreArchivo; a.click(); URL.revokeObjectURL(url);
      return;
    }
    const resultado = await FileSystem.downloadAsync(ruta, `${FileSystem.cacheDirectory}${nombreArchivo}`, { headers: { Authorization: `Bearer ${token}` } });
    if (resultado.status !== 200) throw new Error("No se pudo generar el documento.");
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(resultado.uri, { mimeType });
    else alerta("Listo", `Se guardó en: ${resultado.uri}`);
  }
  async function descargarPdf(tipo) {
    setDescargando(tipo);
    try {
      const ruta = tipo === "remision" ? `${API_URL}/servicios/${id}/nota-remision` : `${API_URL}/servicios/${id}/recibo`;
      await descargarArchivo(ruta, `${tipo === "remision" ? "nota-remision" : "recibo"}-${id}.pdf`, "application/pdf");
    } catch (err) { alerta("Error", err.message); } finally { setDescargando(null); }
  }
  async function descargarFactura(tipo) {
    if (!factura) return;
    setDescargandoFactura(tipo);
    try {
      await descargarArchivo(`${API_URL}/facturacion/facturas/${factura.id_factura}/${tipo}`, `factura-${factura.serie}${factura.folio}.${tipo}`,
        tipo === "xml" ? "application/xml" : "application/pdf");
    } catch (err) { alerta("Error", err.message); } finally { setDescargandoFactura(null); }
  }

  // ---------------- Render ----------------

  if (!servicio) return <Text style={styles.cargando}>Cargando orden…</Text>;

  const abierta = servicio.status === "abierto";
  const detalles = servicio.detalles || [];
  const abonos = servicio.abonos || [];
  const cliente = servicio.cliente || {};
  const vehiculo = servicio.vehiculo || {};
  const badgeStatus = abierta ? [styles.badgePetrol, styles.badgePetrolTexto] : servicio.status === "cerrado" ? [styles.badgeTeal, styles.badgeTealTexto] : [styles.badgeRojo, styles.badgeRojoTexto];
  const responsable = empleados.find((e) => e.id_empleado === servicio.id_empleado_responsable);

  // Conceptos agrupados por categoría de la refacción (igual que la web)
  const grupos = {};
  detalles.forEach((d) => {
    const ref = refacciones.find((r) => r.id_refaccion === d.id_refaccion);
    const clave = ref?.categoria ? `${ref.categoria}${ref.subcategoria ? " / " + ref.subcategoria : ""}` : "Sin categoría";
    (grupos[clave] = grupos[clave] || []).push({ d, ref });
  });
  const clavesGrupos = Object.keys(grupos).sort((a, b) => (a === "Sin categoría" ? 1 : b === "Sin categoría" ? -1 : a.localeCompare(b)));

  // Refacciones para el selector
  const categoriasDisponibles = [...new Set(refacciones.map((r) => r.categoria).filter(Boolean))].sort();
  const refFiltradas = refacciones.filter((r) =>
    (!filtroCategoria || r.categoria === filtroCategoria) &&
    (!busquedaRef || (r.nombre_refaccion || "").toLowerCase().includes(busquedaRef.toLowerCase()))
  );
  const seleccionadas = Object.keys(seleccion).length;

  const PESTANAS = [
    { clave: "refacciones", texto: "Refacciones", icono: "construct-outline", contador: detalles.length },
    { clave: "pagos", texto: "Pagos", icono: "wallet-outline", contador: abonos.length },
    { clave: "estatus", texto: "Estatus", icono: "git-commit-outline" },
    { clave: "datos", texto: "Datos", icono: "information-circle-outline" },
  ];

  return (
    <View style={styles.screen}>
      {/* ===== Encabezado fijo: de quién es la orden y cuánto va ===== */}
      <View style={styles.cabecera}>
        <View style={styles.cabeceraFila}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={styles.heroTitulo}>#{servicio.id_servicio}</Text>
              <View style={[styles.badge, badgeStatus[0]]}><Text style={[styles.badgeTexto, badgeStatus[1]]}>{servicio.status === "cerrado" ? "finalizada" : servicio.status}</Text></View>
              {servicio.pagado && <View style={[styles.badge, styles.badgeTeal]}><Text style={[styles.badgeTexto, styles.badgeTealTexto]}>pagada</Text></View>}
              {servicio.es_garantia && <View style={[styles.badge, styles.badgeAmbar]}><Text style={[styles.badgeTexto, styles.badgeAmbarTexto]}>garantía</Text></View>}
            </View>
            <Text style={styles.cabeceraServicio} numberOfLines={1}>{servicio.nombre_servicio}</Text>
            <Text style={styles.cabeceraMeta} numberOfLines={1}>
              {`${cliente.nombre_cliente || "—"} ${cliente.paterno_cliente || ""}`.trim()} · {[vehiculo.marca?.nombre_marca, vehiculo.modelo?.nombre_modelo].filter(Boolean).join(" ") || "vehículo"} {vehiculo.placas_vehiculo ? `(${vehiculo.placas_vehiculo})` : ""}
            </Text>
          </View>
          <View style={styles.cabeceraTotales}>
            <Text style={styles.totalEtiqueta}>Total</Text>
            <Text style={styles.totalValor}>{fmt(servicio.costos.total)}</Text>
            <Text style={[styles.saldoTexto, { color: servicio.costos.saldo_pendiente > 0.005 ? colors.red600 : colors.teal600 }]}>
              {servicio.costos.saldo_pendiente > 0.005 ? `Debe ${fmt(servicio.costos.saldo_pendiente)}` : "Sin saldo"}
            </Text>
          </View>
        </View>

        <View style={styles.pestanas}>
          {PESTANAS.map((t) => {
            const activa = pestana === t.clave;
            return (
              <TouchableOpacity key={t.clave} style={[styles.pestana, activa && styles.pestanaActiva]} onPress={() => setPestana(t.clave)}>
                <Ionicons name={t.icono} size={17} color={activa ? colors.petrol600 : colors.ink500} />
                <Text style={[styles.pestanaTexto, activa && styles.pestanaTextoActiva]}>{t.texto}{t.contador ? ` ${t.contador}` : ""}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollCampos contentContainerStyle={{ padding: spacing.lg, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        {!abierta && (
          <View style={[styles.aviso, { borderLeftColor: colors.red600 }]}>
            <Text style={styles.avisoTexto}>
              Orden <Text style={styles.negrita}>{servicio.status === "cerrado" ? "finalizada" : servicio.status}</Text>: ya no se pueden editar refacciones ni pagos.
              {puedeEditar ? " Si necesitas cambiar algo, reábrela en la pestaña Datos." : ""}
            </Text>
          </View>
        )}

        {/* ===== REFACCIONES ===== */}
        {pestana === "refacciones" && (
          <>
            {detalles.length === 0 ? (
              <View style={styles.vacioGrande}>
                <View style={styles.vacioIcono}><Ionicons name="construct-outline" size={30} color={colors.petrol600} /></View>
                <Text style={styles.vacioTitulo}>La orden está vacía</Text>
                <Text style={styles.vacioTexto}>Agrega las refacciones que se usaron o la mano de obra. El total se calcula solo.</Text>
                {puedeEditar && abierta && (
                  <View style={{ gap: 10, alignSelf: "stretch", marginTop: 8 }}>
                    <Boton tipo="primario" icono="cube-outline" texto="Agregar refacción del catálogo" onPress={() => abrirAgregar("catalogo")} />
                    <Boton icono="create-outline" texto="Agregar mano de obra u otro cargo" onPress={() => abrirAgregar("libre")} />
                  </View>
                )}
              </View>
            ) : clavesGrupos.map((clave) => (
              <View key={clave}>
                {clavesGrupos.length > 1 && <Text style={styles.grupoTitulo}>{clave}</Text>}
                {grupos[clave].map(({ d, ref }) => {
                  const importe = (Number(d.costo_mano_obra) || 0) + (Number(d.costo_refaccion) || 0) + (Number(d.costo_extra) || 0);
                  const editable = puedeEditar && abierta;
                  return (
                    <View key={d.id_servicio_detalle} style={styles.itemCard}>
                      <View style={styles.conceptoTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.filaTitulo}>{d.descripcion || ref?.nombre_refaccion || "Concepto"}</Text>
                          <Text style={styles.filaSub}>
                            {[tipos.find((t) => t.id_tipo_servicio === d.id_tipo_servicio)?.nombre_tipo, d.id_refaccion ? "Refacción" : "Concepto libre"].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                        <Text style={styles.importe}>{fmt(importe)}</Text>
                      </View>
                      <View style={styles.conceptoBarra}>
                        <View style={styles.contador}>
                          <TouchableOpacity disabled={!editable || (d.cantidad || 1) <= 1} onPress={() => actualizarDetalle(d.id_servicio_detalle, (x) => ((x?.cantidad || 1) > 1 ? { cantidad: (x.cantidad || 1) - 1 } : null))} hitSlop={8}>
                            <Ionicons name="remove-circle-outline" size={28} color={editable && (d.cantidad || 1) > 1 ? colors.petrol600 : colors.ink300} />
                          </TouchableOpacity>
                          <Text style={styles.contadorTexto}>{d.cantidad || 1}</Text>
                          <TouchableOpacity disabled={!editable} onPress={() => actualizarDetalle(d.id_servicio_detalle, (x) => ({ cantidad: (x?.cantidad || 1) + 1 }))} hitSlop={8}>
                            <Ionicons name="add-circle-outline" size={28} color={editable ? colors.petrol600 : colors.ink300} />
                          </TouchableOpacity>
                          <Text style={styles.contadorUnidad}>{(d.cantidad || 1) === 1 ? "pieza" : "piezas"}</Text>
                        </View>
                        {editable && (
                          <TouchableOpacity style={styles.quitar} onPress={() => quitarDetalle(d.id_servicio_detalle)} hitSlop={8}>
                            <Ionicons name="trash-outline" size={16} color={colors.red600} />
                            <Text style={styles.quitarTexto}>Quitar</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.conceptoCampos}>
                        {ref ? (
                          <View style={styles.conceptoCampo}>
                            <Text style={styles.conceptoEtiqueta} numberOfLines={1}>Costo original</Text>
                            <Text style={styles.conceptoValorFijo}>{fmt((ref.preciopropio_refaccion || 0) * (d.cantidad || 1))}</Text>
                          </View>
                        ) : null}
                        {d.id_refaccion || Number(d.costo_refaccion) > 0 ? (
                          <>
                            <View style={styles.conceptoCampo}>
                              <Text style={styles.conceptoEtiqueta} numberOfLines={1}>Precio unitario</Text>
                              <NumeroEditable
                                key={`u${d.costo_refaccion}-${d.cantidad || 1}`}
                                valor={Math.round(((Number(d.costo_refaccion) || 0) / (d.cantidad || 1)) * 100) / 100}
                                editable={editable}
                                onGuardar={(v) => actualizarDetalle(d.id_servicio_detalle, (x) => (v === 0
                                  ? { costo_refaccion: 0, cantidad: 1 }
                                  : { costo_refaccion: Math.round(v * (x?.cantidad || 1) * 100) / 100 }))}
                              />
                            </View>
                          </>
                        ) : null}
                        {!d.id_refaccion || Number(d.costo_mano_obra) > 0 ? (
                          <View style={styles.conceptoCampo}>
                            <Text style={styles.conceptoEtiqueta} numberOfLines={1}>Mano de obra</Text>
                            <NumeroEditable key={`m${d.costo_mano_obra}`} valor={d.costo_mano_obra || 0} editable={editable} onGuardar={(v) => actualizarDetalle(d.id_servicio_detalle, { costo_mano_obra: v })} />
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
            {detalles.length > 0 && (
              <View style={styles.subtotalFila}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.filaSub}>Subtotal {fmt(servicio.costos.subtotal)}{(servicio.iva_porcentaje ?? 0) > 0 ? ` · IVA ${fmt(servicio.costos.iva)}` : " · Sin IVA"}</Text>
                  {puedeEditar && abierta && (
                    <TouchableOpacity style={[styles.ivaChip, (servicio.iva_porcentaje ?? 0) > 0 && styles.ivaChipActivo]} onPress={() => cambiarIva(!((servicio.iva_porcentaje ?? 0) > 0))}>
                      <Ionicons name={(servicio.iva_porcentaje ?? 0) > 0 ? "checkmark-circle" : "add-circle-outline"} size={15} color={(servicio.iva_porcentaje ?? 0) > 0 ? colors.petrol600 : colors.ink700} />
                      <Text style={[styles.ivaChipTexto, (servicio.iva_porcentaje ?? 0) > 0 && { color: colors.petrol600 }]}>{(servicio.iva_porcentaje ?? 0) > 0 ? "IVA 16% aplicado" : "Aplicar IVA 16%"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.importe}>{fmt(servicio.costos.total)}</Text>
              </View>
            )}
          </>
        )}

        {/* ===== PAGOS ===== */}
        {pestana === "pagos" && (
          <>
            <View style={styles.kpiGrid}>
              {[
                ["Subtotal", servicio.costos.subtotal],
                [`IVA (${servicio.iva_porcentaje ?? 0}%)`, servicio.costos.iva],
                ["Pagado", servicio.costos.total_abonado, colors.teal600],
                ["Saldo", servicio.costos.saldo_pendiente, servicio.costos.saldo_pendiente > 0.005 ? colors.red600 : colors.teal600],
              ].map(([etq, val, acento]) => (
                <View key={etq} style={[styles.kpi, acento && { borderLeftColor: acento }]}>
                  <Text style={styles.kpiEtiqueta}>{etq}</Text>
                  <Text style={styles.kpiValor} numberOfLines={1} adjustsFontSizeToFit>{fmt(val)}</Text>
                </View>
              ))}
            </View>
            {puedeEditar && abierta && (
              <View style={[styles.itemCard, styles.ivaFila]}>
                <Text style={styles.ivaTexto}>Aplicar IVA (16%)</Text>
                <Switch value={(servicio.iva_porcentaje ?? 0) > 0} onValueChange={cambiarIva} trackColor={{ true: colors.petrol500 }} />
              </View>
            )}
            {puedeEditar && abierta && !servicio.pagado && (
              <Boton icono="add-circle-outline" texto="Registrar abono (anticipo o pago parcial)" onPress={abrirAbono} estilo={{ marginTop: 12 }} />
            )}
            <Text style={styles.seccion}>Pagos registrados</Text>
            {abonos.length === 0 ? <Text style={styles.vacio}>Todavía no hay pagos.</Text> : abonos.map((a, i) => {
              const comision = comisiones.find((c) => c.tipo_pago === a.tipo_pago);
              return (
                <View key={a.id_abono || i} style={styles.itemCard}>
                  <View style={styles.conceptoTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.filaTitulo}>Pago {a.numero_abono || i + 1} · {etiquetaPago(a.tipo_pago)}</Text>
                      <Text style={styles.filaSub}>
                        {new Date(a.fecha_pago).toLocaleDateString("es-MX")}
                        {comision?.porcentaje > 0 ? ` · comisión ${comision.porcentaje}%` : ""}
                        {a.tipo_pago === "mixto" ? ` · efvo ${fmt(a.desglose_mixto_efectivo)} / tarj ${fmt(a.desglose_mixto_tarjeta)}` : ""}
                        {a.cambio > 0 ? ` · cambio ${fmt(a.cambio)}` : ""}
                      </Text>
                      {a.comentario ? <Text style={styles.filaSub}>{a.comentario}</Text> : null}
                    </View>
                    <Text style={styles.importe}>{fmt(a.monto_abono)}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ===== ESTATUS ===== */}
        {pestana === "estatus" && (
          <>
            <View style={styles.accesos}>
              <TouchableOpacity style={styles.acceso} onPress={() => setMostrandoInspeccion(true)} disabled={!abierta && !inspeccionActual}>
                <Ionicons name="clipboard-outline" size={24} color={colors.petrol600} />
                <Text style={styles.accesoTexto}>{inspeccionActual ? "Ver inspección" : "Nueva inspección"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceso} onPress={() => setChatAbierto(true)}>
                <Ionicons name="chatbubbles-outline" size={24} color={colors.petrol600} />
                <Text style={styles.accesoTexto}>Chat con el cliente</Text>
              </TouchableOpacity>
            </View>
            {abierta ? (
              <EtapaTracker servicio={servicio} puedeEditar={puedeEditar} onActualizado={setServicio} />
            ) : (
              <Text style={styles.vacio}>La orden ya no está en proceso.</Text>
            )}
            <Bloque icono="camera-outline" titulo="Fotos del servicio">
              <FotoGaleria entidadTipo="servicio" entidadId={servicio.id_servicio} />
            </Bloque>
          </>
        )}

        {/* ===== DATOS ===== */}
        {pestana === "datos" && (
          <>
            <Bloque icono="construct-outline" titulo="Responsable">
              {puedeEditar ? (
                <View style={styles.pickerWrap}>
                  <Picker titulo="Responsable" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} selectedValue={servicio.id_empleado_responsable ?? ""} onValueChange={reasignarEmpleado}>
                    <Picker.Item label="Sin asignar" value="" />
                    {empleados.map((e) => <Picker.Item key={e.id_empleado} label={`${e.nombre} ${e.paterno || ""}`} value={e.id_empleado} />)}
                  </Picker>
                </View>
              ) : <Text style={styles.filaTitulo}>{responsable ? `${responsable.nombre} ${responsable.paterno || ""}` : "Sin asignar"}</Text>}
            </Bloque>

            <Bloque icono="person-outline" titulo="Cliente">
              <Dato etiqueta="Cuenta" valor={cliente.numero_cuenta} />
              <Dato etiqueta="Nombre" valor={`${cliente.nombre_cliente || ""} ${cliente.paterno_cliente || ""}`.trim()} />
              <Dato etiqueta="Teléfono" valor={cliente.telefono1} />
            </Bloque>

            <Bloque icono="car-outline" titulo="Vehículo">
              <Dato etiqueta="Marca / modelo" valor={[vehiculo.marca?.nombre_marca, vehiculo.modelo?.nombre_modelo].filter(Boolean).join(" ")} />
              <Dato etiqueta="Placas" valor={vehiculo.placas_vehiculo} />
              <Dato etiqueta="Color" valor={vehiculo.color?.nombre_color} />
              <Dato etiqueta="Km de llegada" valor={servicio.km_llegada} />
              <Dato etiqueta="Próximo servicio (km)" valor={servicio.km_proximo_servicio} />
              <Dato etiqueta="VIN" valor={vehiculo.numserie_vehiculo} />
              {fotoVehiculo && <Image source={{ uri: urlArchivo(fotoVehiculo.ruta_archivo) }} style={styles.fotoVehiculo} />}
              {servicio.diagnostico ? <Dato etiqueta="Diagnóstico" valor={servicio.diagnostico} /> : null}
              {servicio.operaciones ? <Dato etiqueta="Operaciones" valor={servicio.operaciones} /> : null}
              {servicio.autorizado_cliente ? <Text style={styles.autorizado}>✓ Autorizado por el cliente</Text> : null}
            </Bloque>

            <Bloque icono="create-outline" titulo="Comentarios finales">
              <Text style={styles.filaSub}>Aparecen en el recibo y la nota de remisión.</Text>
              <TextInput style={[styles.textarea, { marginTop: 8 }]} value={comentariosFinales} onChangeText={setComentariosFinales} multiline editable={puedeEditar}
                placeholder="Ej. Se recomienda revisar las balatas traseras en el próximo servicio." placeholderTextColor={colors.ink500} />
              <Text style={[styles.filaSub, { marginTop: 6, minHeight: 18 }]}>
                {guardandoComentarios || comentariosFinales !== comentariosGuardados ? "Guardando…" : comentariosFinales ? "✓ Guardado automáticamente" : ""}
              </Text>
            </Bloque>

            {servicio.es_garantia && (
              <TouchableOpacity style={[styles.aviso, { borderLeftColor: colors.warn600 }]} onPress={() => servicio.id_servicio_original && navigation.push("ServicioDetalle", { id: servicio.id_servicio_original })}>
                <Text style={styles.avisoTexto}>
                  <Text style={styles.negrita}>Reclamación de garantía</Text> de la orden #{servicio.id_servicio_original} (toca para verla).{servicio.motivo_garantia ? `\nMotivo: ${servicio.motivo_garantia}` : ""}
                </Text>
              </TouchableOpacity>
            )}
            {reclamaciones.length > 0 && (
              <Bloque icono="shield-outline" titulo={`Volvió por garantía (${reclamaciones.length})`} acento={colors.warn600}>
                {reclamaciones.map((r) => (
                  <TouchableOpacity key={r.id_servicio} style={styles.filaLista} onPress={() => navigation.push("ServicioDetalle", { id: r.id_servicio })}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.filaTitulo}>#{r.id_servicio} · {new Date(r.fecha_entrada_servicio).toLocaleDateString("es-MX")}</Text>
                      <Text style={styles.filaSub}>{r.motivo_garantia || "—"}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.ink500} />
                  </TouchableOpacity>
                ))}
              </Bloque>
            )}

            <Bloque icono="document-text-outline" titulo="Documentos">
              <View style={{ gap: 10 }}>
                <Boton icono="eye-outline" texto="Vista previa del recibo" onPress={() => descargarPdf("recibo")} deshabilitado={detalles.length === 0} cargando={descargando === "recibo"} />
                {servicio.status === "cerrado" && <Boton icono="document-text-outline" texto="Nota de remisión" onPress={() => descargarPdf("remision")} cargando={descargando === "remision"} />}
                {factura ? (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Boton chico icono="download-outline" texto={`Factura ${factura.serie}-${factura.folio} PDF`} onPress={() => descargarFactura("pdf")} cargando={descargandoFactura === "pdf"} estilo={{ flex: 1 }} />
                    <Boton chico icono="code-download-outline" texto="XML" onPress={() => descargarFactura("xml")} cargando={descargandoFactura === "xml"} />
                  </View>
                ) : servicio.status === "cerrado" && hasPermission("facturacion.ver") ? (
                  <Text style={styles.filaSub}>Sin factura. La emisión de CFDI se hace desde el panel web.</Text>
                ) : null}
              </View>
            </Bloque>

            <Bloque icono="storefront-outline" titulo="Taller">
              {datosTaller ? (
                <>
                  <Dato etiqueta="Nombre" valor={datosTaller.nombre_taller} />
                  <Dato etiqueta="RFC" valor={datosTaller.rfc} />
                  <Dato etiqueta="Teléfono" valor={datosTaller.telefono} />
                </>
              ) : <Text style={styles.vacio}>Cargando…</Text>}
            </Bloque>

            {puedeEditar && (
              <View style={{ gap: 10, marginTop: 4 }}>
                {servicio.status === "cerrado" && !servicio.es_garantia && hasPermission("servicios.crear") && (
                  <Boton icono="shield-checkmark-outline" texto="Reclamar garantía" onPress={() => navigation.navigate("NuevaOrden", { garantiaOriginal: servicio })} />
                )}
                {!abierta && <Boton icono="refresh-outline" texto="Reabrir orden" onPress={() => cambiarStatus("abierto")} />}
                {servicio.status !== "cancelado" && servicio.status !== "cerrado" && !(servicio.costos.total_abonado > 0 && servicio.costos.saldo_pendiente <= 0) && (
                  <Boton tipo="peligro" icono="close-circle-outline" texto="Cancelar orden" onPress={() => cambiarStatus("cancelado")} />
                )}
              </View>
            )}
          </>
        )}
      </ScrollCampos>

      {/* ===== Barra de acciones fija ===== */}
      {abierta && puedeEditar && (
        <View style={styles.barra}>
          <Boton icono="add" texto="Agregar" onPress={() => abrirAgregar(refacciones.length ? "catalogo" : "libre")} estilo={{ flex: 1 }} />
          <Boton tipo="primario" icono="checkmark-done" texto={conSaldoFinal ? `Cobrar ${fmt(saldoFinal)}` : "Finalizar"} onPress={abrirModalCierre}
            deshabilitado={detalles.length === 0} estilo={{ flex: 1.5 }} />
        </View>
      )}

      <InspeccionForm
        visible={mostrandoInspeccion}
        idVehiculo={servicio.id_vehiculo}
        idServicio={servicio.id_servicio}
        inspeccionExistente={inspeccionActual}
        refacciones={refacciones}
        onGuardado={(g) => { setInspeccionActual(g); setMostrandoInspeccion(false); }}
        onClose={() => setMostrandoInspeccion(false)}
      />

      {/* Chat */}
      <Modal visible={chatAbierto} animationType="slide" onRequestClose={() => setChatAbierto(false)}>
        <KeyboardAvoidingView
          style={styles.modalPantalla}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>Chat de la orden #{servicio.id_servicio}</Text>
            <TouchableOpacity onPress={() => setChatAbierto(false)} hitSlop={10}><Ionicons name="close" size={24} color={colors.ink900} /></TouchableOpacity>
          </View>
          <View style={{ flex: 1, padding: spacing.md }}>
            <ChatOrden servicioId={servicio.id_servicio} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Agregar refacciones */}
      <Modal visible={modalRefacciones} animationType="slide" onRequestClose={() => setModalRefacciones(false)}>
        <View style={styles.modalPantalla}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>Agregar a la orden #{servicio.id_servicio}</Text>
            <TouchableOpacity onPress={() => setModalRefacciones(false)} hitSlop={10}><Ionicons name="close" size={24} color={colors.ink900} /></TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            <View style={styles.segmentado}>
              {[{ v: "catalogo", t: "Del catálogo", i: "cube-outline" }, { v: "libre", t: "Concepto libre", i: "create-outline" }].map((m) => (
                <TouchableOpacity key={m.v} style={[styles.segmento, modoAgregar === m.v && styles.segmentoActivo]} onPress={() => setModoAgregar(m.v)}>
                  <Ionicons name={m.i} size={15} color={modoAgregar === m.v ? colors.paper100 : colors.ink700} />
                  <Text style={[styles.segmentoTexto, modoAgregar === m.v && styles.segmentoTextoActivo]}>{m.t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {modoAgregar === "libre" ? (
            <>
              <ScrollCampos contentContainerStyle={{ padding: spacing.lg, gap: 12 }} keyboardShouldPersistTaps="handled">
                <Text style={styles.filaSub}>Para mano de obra, diagnósticos o cualquier cargo que no esté en el catálogo de refacciones.</Text>
                <View>
                  <Text style={styles.label}>Descripción *</Text>
                  <TextInput style={styles.input} value={libre.descripcion} onChangeText={(v) => setLibre((p) => ({ ...p, descripcion: v }))} placeholder="Ej. Mano de obra de afinación" placeholderTextColor={colors.ink500} autoFocus />
                </View>
                <View>
                  <Text style={styles.label}>Tipo de servicio</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {tipos.map((t) => {
                      const activo = String(libre.id_tipo_servicio) === String(t.id_tipo_servicio);
                      return (
                        <TouchableOpacity key={t.id_tipo_servicio} style={[styles.chip, activo && styles.chipActivo]} onPress={() => setLibre((p) => ({ ...p, id_tipo_servicio: activo ? "" : t.id_tipo_servicio }))}>
                          <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{t.nombre_tipo}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Mano de obra $</Text>
                    <TextInput style={styles.input} value={libre.costo_mano_obra} onChangeText={(v) => setLibre((p) => ({ ...p, costo_mano_obra: v }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.ink500} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Refacción $</Text>
                    <TextInput style={styles.input} value={libre.costo_refaccion} onChangeText={(v) => setLibre((p) => ({ ...p, costo_refaccion: v }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.ink500} />
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Cantidad de piezas</Text>
                    <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={libre.cantidad} onChangeText={(v) => setLibre((p) => ({ ...p, cantidad: v }))} keyboardType="number-pad" />
                  </View>
                </View>
                <Text style={styles.resultadoPago}>
                  Precio final: {fmt((Number(libre.costo_mano_obra) || 0) + (Number(libre.costo_refaccion) || 0))}
                </Text>
              </ScrollCampos>
              <View style={styles.modalPie}>
                <Boton texto="Cancelar" onPress={() => setModalRefacciones(false)} estilo={{ flex: 1 }} />
                <Boton tipo="primario" icono="add" texto="Agregar a la orden" onPress={guardarConceptoLibre} cargando={guardandoRefacciones} estilo={{ flex: 1.6 }} />
              </View>
            </>
          ) : (
          <>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 8 }}>
            <TextInput style={styles.search} placeholder="Buscar refacción…" placeholderTextColor={colors.ink500} value={busquedaRef} onChangeText={setBusquedaRef} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {["", ...categoriasDisponibles].map((c) => (
                <TouchableOpacity key={c || "todas"} style={[styles.chip, filtroCategoria === c && styles.chipActivo]} onPress={() => setFiltroCategoria(c)}>
                  <Text style={[styles.chipTexto, filtroCategoria === c && styles.chipTextoActivo]}>{c || "Todas"}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 8 }}>
            {refFiltradas.length === 0 ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.vacio}>{refacciones.length === 0 ? "Todavía no hay refacciones en el catálogo." : "No hay refacciones que coincidan."}</Text>
                <Boton icono="create-outline" texto="Agregarla como concepto libre" onPress={() => { setLibre((p) => ({ ...p, descripcion: busquedaRef })); setModoAgregar("libre"); }} />
              </View>
            ) : refFiltradas.map((r) => {
              const inv = inventarioDe(r.id_refaccion);
              const marcada = !!seleccion[r.id_refaccion];
              const precio = (inv ? inv.preciocliente : r.preciocliente_refaccion) || (inv ? inv.preciopropio : r.preciopropio_refaccion) || 0;
              return (
                <TouchableOpacity key={r.id_refaccion} style={[styles.tarjetaRef, marcada && styles.tarjetaRefActiva]} onPress={() => alternarSeleccion(r.id_refaccion)} activeOpacity={0.8}>
                  <Ionicons name={marcada ? "checkbox" : "square-outline"} size={22} color={marcada ? colors.petrol500 : colors.ink500} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.filaTitulo}>{r.nombre_refaccion}</Text>
                    <Text style={styles.filaSub}>
                      {r.categoria ? `${r.categoria} · ` : ""}Stock: {inv ? inv.cantidad : (r.cantidad_refaccion ?? 0)}{precio ? ` · ${fmt(precio)}` : ""}
                    </Text>
                    {!inv && inventarioVehiculo.length > 0 && <Text style={styles.advertencia}>Sin inventario para este vehículo</Text>}
                  </View>
                  {marcada && (
                    <View style={styles.contador}>
                      <TouchableOpacity onPress={() => cambiarCantidadSel(r.id_refaccion, -1)} hitSlop={6}><Ionicons name="remove-circle-outline" size={24} color={colors.petrol600} /></TouchableOpacity>
                      <Text style={styles.contadorTexto}>{seleccion[r.id_refaccion].cantidad}</Text>
                      <TouchableOpacity onPress={() => cambiarCantidadSel(r.id_refaccion, 1)} hitSlop={6}><Ionicons name="add-circle-outline" size={24} color={colors.petrol600} /></TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.modalPie}>
            <Boton texto="Cancelar" onPress={() => setModalRefacciones(false)} estilo={{ flex: 1 }} />
            <Boton tipo="primario" texto={seleccionadas ? `Agregar ${seleccionadas}` : "Toca para elegir"} onPress={guardarRefacciones} cargando={guardandoRefacciones} deshabilitado={!seleccionadas} estilo={{ flex: 1.4 }} />
          </View>
          </>
          )}
        </View>
      </Modal>

      {/* Registrar abono */}
      <Modal visible={modalAbono} transparent animationType="slide" onRequestClose={() => setModalAbono(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollCampos style={styles.modalSheet} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitulo}>Registrar abono</Text>
            <Text style={styles.filaSub}>Pago a cuenta de la orden #{servicio.id_servicio} · saldo {fmt(saldoFinal)}</Text>
            <Text style={[styles.label, { marginTop: spacing.md }]}>Tipo de pago</Text>
            <View style={styles.segmentado}>
              {TIPOS_PAGO.map((f) => (
                <TouchableOpacity key={f.valor} style={[styles.segmento, tipoPago === f.valor && styles.segmentoActivo]} onPress={() => setTipoPago(f.valor)}>
                  <Ionicons name={f.icono} size={15} color={tipoPago === f.valor ? colors.paper100 : colors.ink700} />
                  <Text style={[styles.segmentoTexto, tipoPago === f.valor && styles.segmentoTextoActivo]}>{f.texto}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {tipoPago === "mixto" ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Efectivo" placeholderTextColor={colors.ink500} keyboardType="decimal-pad" value={montoEfectivo} onChangeText={setMontoEfectivo} />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Tarjeta" placeholderTextColor={colors.ink500} keyboardType="decimal-pad" value={montoTarjeta} onChangeText={setMontoTarjeta} />
              </View>
            ) : (
              <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Monto" placeholderTextColor={colors.ink500} keyboardType="decimal-pad" value={monto} onChangeText={setMonto} autoFocus />
            )}
            {(() => {
              const com = comisiones.find((c) => c.tipo_pago === tipoPago);
              return com?.porcentaje > 0 ? <Text style={styles.filaSub}>Comisión de este tipo de pago: {com.porcentaje}%</Text> : null;
            })()}
            <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Comentario (opcional)" placeholderTextColor={colors.ink500} value={comentarioAbono} onChangeText={setComentarioAbono} />
            <View style={styles.modalAcciones}>
              <Boton texto="Cancelar" onPress={() => setModalAbono(false)} estilo={{ flex: 1 }} />
              <Boton tipo="primario" texto="Registrar" onPress={registrarAbono} cargando={guardandoAbono} estilo={{ flex: 1.4 }} />
            </View>
          </ScrollCampos>
        </View>
      </Modal>

      {/* Finalizar orden */}
      <Modal visible={modalCierre} transparent animationType="slide" onRequestClose={() => setModalCierre(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollCampos style={styles.modalSheet} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitulo}>Finalizar orden #{id}</Text>
            <Text style={styles.filaSub}>Cobro del saldo, cierre de la orden, nota de remisión y aviso al cliente.</Text>

            {conSaldoFinal && (
              <>
                <Text style={[styles.label, { marginTop: spacing.md }]}>1 · Forma de pago — saldo {fmt(saldoFinal)}</Text>
                <View style={styles.segmentado}>
                  {TIPOS_PAGO.map((f) => (
                    <TouchableOpacity key={f.valor} style={[styles.segmento, formaPagoFinal === f.valor && styles.segmentoActivo]} onPress={() => { setFormaPagoFinal(f.valor); setRecibidoFinal(""); }}>
                      <Ionicons name={f.icono} size={15} color={formaPagoFinal === f.valor ? colors.paper100 : colors.ink700} />
                      <Text style={[styles.segmentoTexto, formaPagoFinal === f.valor && styles.segmentoTextoActivo]}>{f.texto}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {formaPagoFinal !== "mixto" ? (
                  <TextInput style={[styles.input, { marginTop: 10 }]} keyboardType="decimal-pad" value={recibidoFinal} onChangeText={setRecibidoFinal}
                    placeholder={formaPagoFinal === "tarjeta" ? `Cargo (vacío = ${saldoFinal.toFixed(2)})` : "Efectivo recibido"} placeholderTextColor={colors.ink500} />
                ) : (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <TextInput style={[styles.input, { flex: 1 }]} keyboardType="decimal-pad" value={mixEfectivoFinal} onChangeText={setMixEfectivoFinal} placeholder="Efectivo" placeholderTextColor={colors.ink500} />
                    <TextInput style={[styles.input, { flex: 1 }]} keyboardType="decimal-pad" value={mixTarjetaFinal} onChangeText={setMixTarjetaFinal} placeholder="Tarjeta" placeholderTextColor={colors.ink500} />
                  </View>
                )}
                <Text style={[styles.resultadoPago, { color: faltaFinal > 0.005 ? colors.red600 : colors.teal600 }]}>
                  {faltaFinal > 0.005 ? `Faltan ${fmt(faltaFinal)} para cubrir el saldo` : `Cambio a entregar: ${fmt(cambioFinal)}`}
                </Text>
              </>
            )}

            <View style={styles.ivaFila}>
              <Text style={[styles.ivaTexto, { flex: 1 }]}>Avisar al cliente que su vehículo está listo</Text>
              <Switch value={notificarFinal} onValueChange={setNotificarFinal} trackColor={{ true: colors.petrol500 }} />
            </View>

            <Text style={[styles.label, { marginTop: spacing.md }]}>Escribe CONFIRMAR para cerrar la orden</Text>
            <TextInput style={styles.input} value={textoConfirmar} onChangeText={setTextoConfirmar} placeholder="CONFIRMAR" placeholderTextColor={colors.ink500} autoCapitalize="characters" />

            <View style={styles.modalAcciones}>
              <Boton texto="Cancelar" onPress={() => setModalCierre(false)} estilo={{ flex: 1 }} />
              <Boton tipo="primario" texto={conSaldoFinal ? `Cobrar y finalizar` : "Finalizar"} onPress={confirmarCierre} cargando={cerrando}
                deshabilitado={textoConfirmar !== "CONFIRMAR" || !pagoFinalListo} estilo={{ flex: 1.4 }} />
            </View>
          </ScrollCampos>
        </View>
      </Modal>
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cargando: { padding: spacing.lg, color: colors.ink500, fontSize: 14 },
  // Encabezado (.orden-hero)
  hero: { backgroundColor: colors.paper100, borderRadius: 10, padding: 16, marginBottom: 14 },
  heroTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  heroTitulo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 28, color: colors.ink900 },
  heroServicio: { fontSize: 14, color: colors.ink700, marginTop: 2 },
  heroHerramientas: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 6 },
  heroBloque: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.paper0, borderLeftWidth: 4 },
  heroIcono: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  heroEtiqueta: { fontSize: 11, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.5 },
  heroValor: { fontSize: 15, fontWeight: "600", color: colors.ink900, marginTop: 1 },
  heroMeta: { fontSize: 12.5, color: colors.ink500, marginTop: 1 },
  badge: { borderRadius: 100, paddingVertical: 3, paddingHorizontal: 10 },
  badgeTexto: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  badgePetrol: { backgroundColor: colors.petrol100 }, badgePetrolTexto: { color: colors.petrol600 },
  badgeTeal: { backgroundColor: colors.teal100 }, badgeTealTexto: { color: colors.teal600 },
  badgeRojo: { backgroundColor: colors.red100 }, badgeRojoTexto: { color: colors.red600 },
  badgeAmbar: { backgroundColor: colors.warn100 }, badgeAmbarTexto: { color: colors.warn600 },
  pickerWrap: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, overflow: "hidden", marginTop: 4 },
  // Bloques (.nota-bloque)
  bloque: { backgroundColor: colors.paper100, borderRadius: 10, padding: 16, marginBottom: 14, borderTopWidth: 3, borderTopColor: colors.petrol500 },
  bloqueHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 },
  bloqueTituloFila: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  bloqueTitulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 20, color: colors.ink900 },
  datoFila: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  datoEtiqueta: { fontSize: 13, color: colors.ink500 },
  datoValor: { fontSize: 13.5, fontWeight: "600", color: colors.ink900, flexShrink: 1, textAlign: "right" },
  fotoVehiculo: { width: "100%", height: 170, borderRadius: 10, marginTop: 10, backgroundColor: colors.paper0 },
  logoTaller: { width: "100%", height: 70, marginTop: 10 },
  diagnostico: { marginTop: 10 },
  autorizado: { fontSize: 12.5, fontWeight: "700", color: colors.teal600, marginTop: 8 },
  link: { fontSize: 13, fontWeight: "600", color: colors.petrol500, marginTop: 10, textDecorationLine: "underline" },
  aviso: { backgroundColor: colors.paper100, borderRadius: 10, borderLeftWidth: 4, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14 },
  avisoTexto: { fontSize: 13.5, color: colors.ink900, lineHeight: 19 },
  negrita: { fontWeight: "700", color: colors.ink900 },
  // Costos
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  kpi: { width: "48.5%", backgroundColor: colors.paper0, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, borderLeftWidth: 4, borderLeftColor: colors.petrol500 },
  kpiEtiqueta: { fontSize: 11, fontWeight: "600", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValor: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24, color: colors.ink900, marginTop: 2 },
  ivaFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  ivaTexto: { fontSize: 13.5, color: colors.ink700 },
  // Conceptos
  grupoTitulo: { fontSize: 12.5, fontWeight: "700", color: colors.petrol600, backgroundColor: colors.paper0, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6, marginTop: 6, marginBottom: 4 },
  concepto: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  conceptoTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  conceptoBarra: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  conceptoCampos: { flexDirection: "row", gap: 8, marginTop: 4 },
  conceptoCampo: { flex: 1, minWidth: 0, gap: 2 },
  contadorUnidad: { fontSize: 12.5, color: colors.ink500, marginLeft: 2 },
  ivaChip: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: 100, borderWidth: 1, borderColor: colors.ink300, paddingVertical: 5, paddingHorizontal: 10 },
  ivaChipActivo: { borderColor: colors.petrol500, backgroundColor: colors.petrol100 },
  ivaChipTexto: { fontSize: 12.5, fontWeight: "600", color: colors.ink700 },
  conceptoEtiqueta: { fontSize: 10.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.4 },
  conceptoValorFijo: { fontSize: 13.5, color: colors.ink700, paddingVertical: 3 },
  numInput: { borderWidth: 1, borderColor: colors.petrol300, borderRadius: 7, paddingVertical: 3, paddingHorizontal: 8, fontSize: 13.5, color: colors.ink900, backgroundColor: colors.paper100 },
  subtitulo: { fontSize: 12.5, fontWeight: "700", color: colors.ink700, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.ink300 },
  filaLista: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  divisor: { borderTopWidth: 1, borderTopColor: colors.ink300 },
  filaTitulo: { fontSize: 14, fontWeight: "600", color: colors.ink900 },
  filaSub: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  monto: { fontSize: 14.5, fontWeight: "700", color: colors.ink900 },
  vacio: { fontSize: 13.5, color: colors.ink500, paddingVertical: 8 },
  label: { fontSize: 12, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 },
  textarea: { borderWidth: 1.5, borderColor: colors.petrol300, borderRadius: 10, backgroundColor: colors.paper100, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: "top", color: colors.ink900 },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10, fontSize: 15, color: colors.ink900 },
  search: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10, fontSize: 15, color: colors.ink900 },
  // Botones (.btn)
  btnPrimario: { flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.petrol500, borderRadius: 10, height: 46, paddingHorizontal: 16 },
  btnPrimarioTexto: { fontSize: 14.5, fontWeight: "600", color: colors.paper100 },
  btnSecundario: { flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, height: 46, paddingHorizontal: 16 },
  btnSecundarioTexto: { fontSize: 14.5, fontWeight: "600", color: colors.ink900 },
  btnPeligro: { flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.red100, borderRadius: 10, height: 46, paddingHorizontal: 16 },
  btnPeligroTexto: { fontSize: 14.5, fontWeight: "600", color: colors.red600 },
  btnChico: { height: 34, paddingHorizontal: 11 },
  btnChicoTexto: { fontSize: 12.5 },
  // Flotantes (.chat-fab)
  fab: {
    position: "absolute", right: 18, bottom: 22, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.petrol500,
    alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  fabInspeccion: { bottom: 88, backgroundColor: colors.paper100, borderWidth: 1.5, borderColor: colors.petrol300 },
  // Modales
  modalPantalla: { flex: 1, backgroundColor: colors.paper0, paddingTop: 36 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  modalTitulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 22, color: colors.ink900, marginBottom: 2 },
  modalPie: { flexDirection: "row", gap: 10, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.ink300, backgroundColor: colors.paper100 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(20,24,28,0.55)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.paper100, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, maxHeight: "90%" },
  modalAcciones: { flexDirection: "row", gap: 10, marginTop: 18 },
  segmentado: { flexDirection: "row", backgroundColor: colors.paper0, borderRadius: 10, padding: 3 },
  segmento: { flex: 1, flexDirection: "row", gap: 5, paddingVertical: 9, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  segmentoActivo: { backgroundColor: colors.petrol500 },
  segmentoTexto: { fontSize: 13, fontWeight: "600", color: colors.ink700 },
  segmentoTextoActivo: { color: colors.paper100 },
  resultadoPago: { fontSize: 14, fontWeight: "700", marginTop: 8 },
  chip: { borderWidth: 1, borderColor: colors.ink300, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.paper100 },
  chipActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  chipTexto: { fontSize: 13, fontWeight: "600", color: colors.ink700 },
  chipTextoActivo: { color: colors.paper100 },
  tarjetaRef: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper100, borderWidth: 1.5, borderColor: colors.ink300, borderRadius: 10, padding: 12 },
  tarjetaRefActiva: { borderColor: colors.petrol500, backgroundColor: colors.petrol100 },
  advertencia: { fontSize: 11.5, color: colors.warn600, marginTop: 3 },
  contador: { flexDirection: "row", alignItems: "center", gap: 6 },
  cabecera: { backgroundColor: colors.paper100, paddingHorizontal: spacing.lg, paddingTop: 12, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  cabeceraFila: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cabeceraServicio: { fontSize: 14, fontWeight: "600", color: colors.ink900, marginTop: 2 },
  cabeceraMeta: { fontSize: 12.5, color: colors.ink500, marginTop: 1 },
  cabeceraTotales: { alignItems: "flex-end" },
  totalEtiqueta: { fontSize: 10.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.5 },
  totalValor: { fontFamily: "BarlowCondensed_700Bold", fontSize: 26, color: colors.ink900 },
  saldoTexto: { fontSize: 12, fontWeight: "700" },
  pestanas: { flexDirection: "row", marginTop: 10 },
  pestana: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 9, borderBottomWidth: 3, borderBottomColor: "transparent" },
  pestanaActiva: { borderBottomColor: colors.petrol500 },
  pestanaTexto: { fontSize: 11.5, fontWeight: "600", color: colors.ink500 },
  pestanaTextoActiva: { color: colors.petrol600 },
  itemCard: { backgroundColor: colors.paper100, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 6 },
  importe: { fontSize: 15.5, fontWeight: "700", color: colors.ink900 },
  quitar: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingLeft: 8 },
  quitarTexto: { fontSize: 12.5, fontWeight: "600", color: colors.red600 },
  subtotalFila: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4, paddingTop: 6 },
  seccion: { fontSize: 12.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  vacioGrande: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 8, gap: 6 },
  vacioIcono: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  vacioTitulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 22, color: colors.ink900 },
  vacioTexto: { fontSize: 14, color: colors.ink500, textAlign: "center", lineHeight: 20 },
  accesos: { flexDirection: "row", gap: 10, marginBottom: 14 },
  acceso: { flex: 1, alignItems: "center", gap: 6, backgroundColor: colors.paper100, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 8 },
  accesoTexto: { fontSize: 13, fontWeight: "600", color: colors.ink900, textAlign: "center" },
  barra: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10,
    paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 14, backgroundColor: colors.paper100,
    borderTopWidth: 1, borderTopColor: colors.ink300, elevation: 8, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: -3 },
  },
  contadorTexto: { fontSize: 16, fontWeight: "700", color: colors.ink900, minWidth: 20, textAlign: "center" },
});
