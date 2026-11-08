import ScrollCampos from "../ui/ScrollCampos";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, Platform, Modal, Switch, Image, ActivityIndicator, KeyboardAvoidingView, Linking, Animated, Easing, LayoutAnimation, UIManager } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Picker } from "../ui/Picker";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "../ui/IconoWeb";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api, getToken, API_URL, urlArchivo } from "../api";
import { MODO_LOCAL } from "../localMode";
import { colors, spacing } from "../theme";
import FotoGaleria from "../components/FotoGaleria";
import EtapaTracker from "../components/EtapaTracker";
import ChatOrden from "../components/ChatOrden";
import InspeccionForm from "../components/InspeccionForm";
import RecepcionAutoModal from "../components/RecepcionAutoModal";
import DomicilioModal from "../components/DomicilioModal";
import NuevaRefaccionModal from "../components/NuevaRefaccionModal";
import HojaAgregarConceptos from "../components/HojaAgregarConceptos";
import Auto3D from "../components/Auto3D";
import { ZONAS, zonasRefaccion } from "../lib/zonas";
import { useAuth } from "../context/AuthContext";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";
import { telefonoValido } from "../validaciones";
import { useBarraInferior } from "../ui/AvisoSuscripcion";
import Calendario from "../ui/Calendario";
import FiltroCategoria from "../ui/FiltroCategoria";
import DeslizarCobrar, { tonoPetroleo } from "../ui/DeslizarCobrar";
const tonoRojo = () => ({ base: colors.petrol500, oscuro: colors.petrol600 });
// Voz (requiere módulo nativo; en Expo Go no existe)
let RecVoz = null;
try { RecVoz = require("expo-speech-recognition").ExpoSpeechRecognitionModule; } catch (e) { RecVoz = null; }
const NUM_VOZ = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const STOP_VOZ = new Set(["de", "del", "la", "el", "los", "las", "para", "al", "agrega", "agregar", "pon", "poner", "ponle", "quiero", "necesito", "mas"]);
const normVoz = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const singVoz = (w) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
import { contiene } from "../lib/texto";

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

// Un renglón es «mano de obra» cuando solo lleva importe de mano de obra (sin refacción ni precio de refacción) — igual que la web.
const esManoObra = (d) => (Number(d.costo_mano_obra) || 0) > 0 && !d.id_refaccion && !d.id_inventario_refaccion && !((Number(d.costo_refaccion) || 0) > 0);

// Precio de venta de una refacción: el del inventario del vehículo si lo tiene capturado;
// si no (o está en 0), el del catálogo. Antes un inventario con precio 0 tapaba el del catálogo.
const precioVentaRef = (inv, ref) => {
  const n = (v) => Number(v) || 0;
  return n(inv?.preciocliente) || n(ref?.preciocliente_refaccion) || n(inv?.preciopropio) || n(ref?.preciopropio_refaccion) || 0;
};

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

// Dato que se puede corregir ahí mismo: se guarda al terminar de escribir
function DatoEditable({ etiqueta, valor, onGuardar, editable, teclado, mayusculas }) {
  const [texto, setTexto] = useState(valor ?? "");
  useEffect(() => { setTexto(valor ?? ""); }, [valor]);
  if (!editable) return <Dato etiqueta={etiqueta} valor={valor} />;
  const guardar = () => { const v = String(texto).trim(); if (v !== String(valor ?? "")) onGuardar(v); };
  return (
    <View style={styles.datoFila}>
      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
      <TextInput style={styles.datoInput} value={String(texto)} onChangeText={setTexto} onEndEditing={guardar} onSubmitEditing={guardar}
        placeholder="Capturar" placeholderTextColor={colors.ink500} keyboardType={teclado || "default"} autoCapitalize={mayusculas ? "characters" : "sentences"} returnKeyType="done" />
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

// Ficha de ícono para los accesos de la pestaña Estatus: ícono relleno + insignia pequeña
function IconoAcceso({ nombre, insignia, fondo, cargando, grande }) {
  const base = fondo || colors.petrol500;
  return (
    <View style={[styles.accesoIcono, { backgroundColor: base, shadowColor: base }]}>
      {cargando ? <ActivityIndicator color="#fff" /> : <Ionicons name={nombre} size={25} color="#fff" />}
      {!!insignia && !cargando && (
        <View style={[styles.accesoInsignia, grande && { width: 24, height: 24, borderRadius: 12, right: -7, bottom: -7 }]}><Ionicons name={insignia} size={grande ? 16 : 11} color={base} /></View>
      )}
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

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);

// Concepto de la orden con interacción natural: toque = abrir/cerrar los controles,
// deslizar a la izquierda = quitar. Cerrada solo muestra lo esencial.
function TarjetaConcepto({ d, refaccion, mo, editable, tipos, actualizar, quitar }) {
  const [abierta, setAbierta] = useState(false);
  const swipe = useRef(null);
  const cant = d.cantidad || 1;
  const redondea = (v) => Math.round(v * 100) / 100;
  const importe = (Number(d.costo_mano_obra) || 0) + (Number(d.costo_refaccion) || 0) + (Number(d.costo_extra) || 0);
  const tipo = tipos.find((t) => t.id_tipo_servicio === d.id_tipo_servicio)?.nombre_tipo;
  const unitario = redondea(((Number(mo ? d.costo_mano_obra : d.costo_refaccion) || 0) / cant));
  const sub = [mo ? null : refaccion?.categoria, tipo, cant > 1 ? `${cant} × ${fmt(unitario)}` : null].filter(Boolean).join(" · ");

  function alternar() {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setAbierta((v) => !v);
  }
  // Lo que el usuario ya escribió en los campos pero aún no se confirma (el teclado sigue abierto):
  // al tocar +/- se guarda junto con la nueva cantidad, para que no se pierda ni deje el total en 0.
  const pendUnit = useRef(null);
  const pendMO = useRef(null);
  const numPend = (ref, actual) => {
    if (ref.current == null) return null;
    const n = Number(String(ref.current).replace(",", "."));
    return Number.isNaN(n) || n === actual ? null : n;
  };
  function cambiarCantidad(delta) {
    const pu = numPend(pendUnit, unitario);
    const pm = mo ? null : numPend(pendMO, Number(d.costo_mano_obra) || 0);
    actualizar(d.id_servicio_detalle, (x) => {
      const c = x?.cantidad || 1;
      const n = c + delta;
      if (n < 1) return null;
      if (mo) {
        const u = pu != null && pu > 0 ? pu : (Number(x.costo_mano_obra) || 0) / c;
        return { cantidad: n, costo_mano_obra: redondea(u * n) };
      }
      const out = { cantidad: n };
      if (pu != null) out.costo_refaccion = redondea(pu * n);
      if (pm != null) out.costo_mano_obra = pm;
      return out;
    });
    pendUnit.current = null; pendMO.current = null;
  }
  function guardarUnitario(v) {
    if (mo) {
      if (!(v > 0)) { alerta("Precio inválido", "El precio debe ser mayor a cero. Para quitarla desliza la tarjeta a la izquierda."); return; }
      actualizar(d.id_servicio_detalle, (x) => ({ costo_mano_obra: redondea(v * (x?.cantidad || 1)) }));
    } else {
      actualizar(d.id_servicio_detalle, (x) => (v === 0 ? { costo_refaccion: 0, cantidad: 1 } : { costo_refaccion: redondea(v * (x?.cantidad || 1)) }));
    }
  }

  const contenido = (
    <View style={styles.nuiCard}>
      <TouchableOpacity activeOpacity={0.8} onPress={alternar} style={styles.nuiFila}>
        <View style={[styles.nuiIcono, mo && { backgroundColor: colors.warn100 }]}>
          <Ionicons name={mo ? "hammer-outline" : "cube-outline"} size={18} color={mo ? colors.warn600 : colors.petrol600} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nuiTitulo} numberOfLines={abierta ? 3 : 1}>{d.descripcion || refaccion?.nombre_refaccion || (mo ? "Mano de obra" : "Concepto")}</Text>
          {sub ? <Text style={styles.nuiSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        {cant > 1 && <View style={styles.nuiCant}><Text style={styles.nuiCantTexto}>{cant}</Text><Text style={styles.nuiCantPzas}>{cant === 1 ? "pza" : "pzas"}</Text></View>}
        <Text style={styles.nuiImporte}>{fmt(importe)}</Text>
        <Ionicons name={abierta ? "chevron-up-outline" : "chevron-down-outline"} size={16} color={colors.ink500} />
      </TouchableOpacity>

      {abierta && (
        <View style={styles.nuiExtra}>
          <View style={styles.nuiControles}>
            <View style={styles.nuiStepper}>
              <TouchableOpacity disabled={!editable || cant <= 1} onPress={() => cambiarCantidad(-1)} hitSlop={8}>
                <Ionicons name="remove-circle-outline" size={32} color={editable && cant > 1 ? colors.petrol600 : colors.ink300} />
              </TouchableOpacity>
              <Text style={styles.nuiStepperNum}>{cant}</Text>
              <TouchableOpacity disabled={!editable} onPress={() => cambiarCantidad(1)} hitSlop={8}>
                <Ionicons name="add-circle-outline" size={32} color={editable ? colors.petrol600 : colors.ink300} />
              </TouchableOpacity>
            </View>
            {(mo || d.id_refaccion || Number(d.costo_refaccion) > 0) && (
              <View style={{ flex: 1 }}>
                <Text style={styles.conceptoEtiqueta} numberOfLines={1}>Precio unitario</Text>
                <NumeroEditable key={`u${mo ? d.costo_mano_obra : d.costo_refaccion}-${cant}`} valor={unitario} editable={editable} onGuardar={guardarUnitario} pendienteRef={pendUnit} />
              </View>
            )}
            {!mo && (!d.id_refaccion || Number(d.costo_mano_obra) > 0) && (
              <View style={{ flex: 1 }}>
                <Text style={styles.conceptoEtiqueta} numberOfLines={1}>Mano de obra</Text>
                <NumeroEditable key={`m${d.costo_mano_obra}`} valor={d.costo_mano_obra || 0} editable={editable} onGuardar={(v) => actualizar(d.id_servicio_detalle, { costo_mano_obra: v })} pendienteRef={pendMO} />
              </View>
            )}
          </View>
          {editable && <Text style={styles.nuiPista}>Desliza la tarjeta a la izquierda para quitarla</Text>}
        </View>
      )}
    </View>
  );

  if (!editable) return contenido;
  return (
    <Swipeable
      ref={swipe}
      overshootRight={false}
      rightThreshold={60}
      friction={1.6}
      renderRightActions={() => (
        <View style={styles.nuiQuitar}>
          <Ionicons name="trash-outline" size={22} color="#ffffff" />
          <Text style={styles.nuiQuitarTexto}>Quitar</Text>
        </View>
      )}
      onSwipeableOpen={() => { swipe.current?.close(); quitar(d.id_servicio_detalle, !!mo); }}
    >
      {contenido}
    </Swipeable>
  );
}

// Campo numérico que guarda al terminar de editar (como el onBlur de la tabla web)
function NumeroEditable({ valor, onGuardar, editable, ancho, pendienteRef }) {
  const [texto, setTexto] = useState(String(valor ?? 0));

  // Se sincroniza si el valor cambia desde afuera (otra pantalla, u otro
  // campo que recalculó este) y el usuario no lo está editando ahora mismo.
  useEffect(() => {
    setTexto(String(valor ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  function confirmar() {
    if (pendienteRef) pendienteRef.current = null;
    const n = Number(String(texto).replace(",", "."));
    if (Number.isNaN(n)) { setTexto(String(valor ?? 0)); return; }
    if (n !== Number(valor)) onGuardar(n);
  }

  return (
    <TextInput placeholderTextColor={colors.ink500}
      style={[styles.numInput, ancho ? { width: ancho } : { alignSelf: "stretch" }, !editable && { opacity: 0.55 }]}
      value={texto}
      onChangeText={(v) => { setTexto(v); if (pendienteRef) pendienteRef.current = v; }}
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
  const { hasPermission, tieneModulo } = useAuth();
  const modDomicilio = tieneModulo("servicio_domicilio"); // módulo del paquete
  const puedeEditar = hasPermission("servicios.editar");

  const [servicio, setServicio] = useState(null);
  // La barra fija "Agregar refacción / Cobrar" (más abajo) tapa el aviso de
  // suscripción si no le avisamos su alto para que suba.
  useBarraInferior(servicio?.status === "abierto" && puedeEditar ? 70 : 0);
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
  const [mostrandoRecepcion, setMostrandoRecepcion] = useState(false);
  const [verAutoRef, setVerAutoRef] = useState(false); // elegir refacciones tocando el auto
  const [zonaRef, setZonaRef] = useState(null); // clave de ZONAS | "otras" | null
  const [chatAbierto, setChatAbierto] = useState(!!route.params?.abrirChat);
  const [domicilioAbierto, setDomicilioAbierto] = useState(false);
  const [domicilio, setDomicilio] = useState(null);
  const cargarDomicilio = useCallback(() => {
    if (!modDomicilio) { setDomicilio(null); return; }
    api.get(`/servicio-domicilio/${id}`).then(setDomicilio).catch(() => setDomicilio(null));
  }, [id, modDomicilio]);
  useEffect(() => { cargarDomicilio(); }, [cargarDomicilio]);
  // Viniendo de "Nueva orden" con el switch de domicilio: se abre la hoja para capturar la dirección
  useEffect(() => {
    if (route.params?.abrirDomicilio) { setDomicilioAbierto(true); navigation.setParams?.({ abrirDomicilio: false }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.abrirDomicilio]);

  // Si llegamos aquí desde la campanita (con params.abrirChat), se abre el
  // chat aunque la pantalla ya estuviera montada (mismo componente, params nuevos).
  useEffect(() => {
    if (route.params?.abrirChat && servicio?.cliente?.cuenta_activada !== false) setChatAbierto(true);
  }, [route.params?.abrirChat]);

  // Modal: registrar abono
  const [modalAbono, setModalAbono] = useState(false);
  const [modalPagos, setModalPagos] = useState(false);
  const [paquetes, setPaquetes] = useState([]);
  const [cargandoPaq, setCargandoPaq] = useState(false);
  const [aplicandoPaq, setAplicandoPaq] = useState(null);
  const [modalNuevoPaq, setModalNuevoPaq] = useState(null); // { nombre }
  const [guardandoPaq, setGuardandoPaq] = useState(false);
  const [armandoPaq, setArmandoPaq] = useState(null); // { nombre, conceptos: [] } — paquete armado desde el catálogo
  const [hojaPaq, setHojaPaq] = useState(false);
  const [calendarioFecha, setCalendarioFecha] = useState(null); // "fecha_entrada_servicio" | "fecha_salida_servicio"
  const [tipoPago, setTipoPago] = useState("efectivo");
  const [monto, setMonto] = useState("");
  const [montoEfectivo, setMontoEfectivo] = useState("");
  const [montoTarjeta, setMontoTarjeta] = useState("");
  const [comentarioAbono, setComentarioAbono] = useState("");
  const [guardandoAbono, setGuardandoAbono] = useState(false);

  const [pestana, setPestana] = useState("refacciones"); // refacciones | pagos | estatus | datos

  // Hoja "Agregar": del catálogo (selección múltiple) o concepto libre
  const [modalRefacciones, setModalRefacciones] = useState(false);
  // Entrada animada del resumen (se repite al volver a la pestaña de refacciones)
  const entradaResumen = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (pestana !== "refacciones") return;
    entradaResumen.setValue(0);
    Animated.timing(entradaResumen, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [pestana, entradaResumen]);
  // Título de la barra superior: número, estatus y saldo de la orden (así no ocupan otra fila)
  useLayoutEffect(() => {
    if (!servicio) return;
    const debe = (servicio.costos?.saldo_pendiente || 0) > 0.005;
    const etiqueta = servicio.status === "cerrado" ? "finalizada" : servicio.status;
    const estiloEstatus = servicio.status === "abierto" ? [styles.badgePetrol, styles.badgePetrolTexto] : servicio.status === "cerrado" ? [styles.badgeTeal, styles.badgeTealTexto] : [styles.badgeRojo, styles.badgeRojoTexto];
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.hdrTitulo}>
          <Text style={styles.hdrId}>Orden #{servicio.id_servicio}</Text>
          <View style={[styles.badge, estiloEstatus[0]]}><Text style={[styles.badgeTexto, estiloEstatus[1]]}>{etiqueta}</Text></View>
          {(servicio.es_domicilio || domicilio?.existe) ? (
            <View style={styles.badgeDomicilio}><Ionicons name="location" size={11} color="#fff" /><Text style={styles.badgeDomicilioTexto}>A domicilio</Text></View>
          ) : null}
          <View style={[styles.cabSaldo, { backgroundColor: debe ? colors.red100 : colors.teal100 }]}>
            <Text style={[styles.cabSaldoTexto, { color: debe ? colors.red600 : colors.teal600 }]} numberOfLines={1}>
              {debe ? `Debe ${fmt(servicio.costos.saldo_pendiente)}` : servicio.status === "cerrado" ? "Liquidado" : "Sin saldo"}
            </Text>
          </View>
        </View>
      ),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, servicio?.id_servicio, servicio?.status, servicio?.costos?.saldo_pendiente, servicio?.es_domicilio, domicilio?.existe]);
  const [modalMO, setModalMO] = useState(null); // { descripcion, cantidad, precio } | null
  const [guardandoMO, setGuardandoMO] = useState(false);
  const [creandoRef, setCreandoRef] = useState(false); // alta rápida de una refacción que no existe
  const [modoAgregar, setModoAgregar] = useState("catalogo");
  const [libre, setLibre] = useState({ descripcion: "", id_tipo_servicio: "", cantidad: "1", costo_mano_obra: "", costo_refaccion: "", costo_extra: "" });
  const [seleccion, setSeleccion] = useState({});
  const [escuchando, setEscuchando] = useState(false);
  const [enviandoSeg, setEnviandoSeg] = useState(false);
  const [textoVoz, setTextoVoz] = useState("");
  const [avisoVoz, setAvisoVoz] = useState(null);
  const procVozRef = useRef(null);
  const pulsoVoz = useRef(new Animated.Value(0)).current;
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
  const cambiarNombreOrden = (nombre) => { if (nombre && nombre !== servicio.nombre_servicio) actualizar({ nombre_servicio: nombre }); };
  const alternarTipoMantenimiento = (idTipo) => {
    const actuales = (servicio.tipos_mantenimiento || []).map((x) => x.id_tipo_servicio);
    const nuevos = actuales.includes(idTipo) ? actuales.filter((x) => x !== idTipo) : [...actuales, idTipo];
    actualizar({ tipos_mantenimiento_ids: nuevos });
  };
  const cambiarIva = (aplicar) => actualizar({ iva_porcentaje: aplicar ? 16 : 0 });

  function cambiarStatus(nuevo) {
    const hacer = async () => { const r = await actualizar({ status: nuevo }); if (r) load(); };
    if (nuevo === "cancelado") {
      alerta("Cancelar orden", "¿Cancelar esta orden de servicio? Si fue un error, podrás reabrirla más adelante.", [
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

  // La base guarda UTC: se muestra la fecha en hora de México (UTC-6), igual que la web y el PDF
  function fechaLocal(iso) {
    if (!iso) return "";
    const d = new Date(new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime() - 6 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const fechaTexto = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : "");

  async function cambiarFecha(campo, valor) {
    setCalendarioFecha(null);
    const entrada = campo === "fecha_entrada_servicio" ? valor : fechaLocal(servicio.fecha_entrada_servicio);
    const salida = campo === "fecha_salida_servicio" ? valor : fechaLocal(servicio.fecha_salida_servicio);
    if (entrada && salida && salida < entrada) {
      alerta("Fecha no válida", "La fecha de salida no puede ser anterior a la de entrada.");
      return;
    }
    await actualizar({ [campo]: valor ? `${valor}T12:00:00` : null }, "Se actualizó la fecha.");
  }

  async function guardarCampoVehiculo(cambios) {
    const veh = servicio.vehiculo || {};
    const clavesVeh = ["placas_vehiculo", "numserie_vehiculo"];
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
        await api.put(`/servicios/${id}`, Object.fromEntries(clavesOrden.filter((k) => k in cambios).map((k) => [k, cambios[k] || null])));
      }
      load();
    } catch (err) {
      alerta("No se pudo guardar", err.message);
    }
  }

  function borrarAbono(idAbono) {
    alerta("Borrar abono", "¿Borrar este abono? El saldo pendiente de la orden se volverá a calcular.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        try { const r = await api.del(`/servicios/${id}/abonos/${idAbono}`); if (r?.id_servicio) setServicio(r); else load(); }
        catch (err) { alerta("Error", err.message); }
      } },
    ]);
  }

  // Manda la nota en PDF por WhatsApp: se genera el PDF y se abre el menú de compartir;
  // al elegir WhatsApp aparece la vista previa del documento para agregar un comentario.
  // Genera (o reutiliza) el enlace público de seguimiento y abre WhatsApp con el mensaje listo.
  async function enviarSeguimientoWhatsApp() {
    if (enviandoSeg) return;
    setEnviandoSeg(true);
    try {
      const est = await api.post(`/seguimiento-orden/${servicio.id_servicio}`, {});
      if (!est?.url) { alerta("Seguimiento", "No se pudo generar el enlace. Intenta regenerarlo desde el panel web."); return; }
      const url = /^https?:/i.test(est.url) ? est.url : `https://app.aldmautocore.com${est.url}`;
      let taller = {};
      try { taller = (await api.get("/configuracion-taller/")) || {}; } catch (e) { /* sin firma */ }
      const veh = [vehiculo.marca?.nombre_marca, vehiculo.modelo?.nombre_modelo].filter(Boolean).join(" ");
      const texto = `Hola ${cliente.nombre_cliente || ""}, sigue en tiempo real el avance de tu ${veh || "vehículo"} (orden #${servicio.id_servicio}) aquí:\n${url}${taller.nombre_taller ? `\n— ${taller.nombre_taller}` : ""}`.replace(/\s+,/, ",");
      const digitos = String(cliente.telefono1 || "").replace(/\D/g, "").slice(-10);
      const destino = telefonoValido(digitos) ? `https://wa.me/52${digitos}` : "https://wa.me/";
      await Linking.openURL(`${destino}?text=${encodeURIComponent(texto)}`);
    } catch (err) {
      alerta("Seguimiento", err?.message || "No se pudo abrir WhatsApp. Verifica que esté instalado.");
    } finally {
      setEnviandoSeg(false);
    }
  }

  async function enviarNotaWhatsApp() {
    const tipo = servicio.status === "cerrado" ? "remision" : "recibo";
    setDescargando("whatsapp");
    try {
      if (MODO_LOCAL) { alerta("Disponible con servidor", "La nota en PDF se genera en el servidor. Podrás enviarla cuando subas los cambios."); return; }
      const ruta = tipo === "remision" ? `${API_URL}/servicios/${id}/nota-remision` : `${API_URL}/servicios/${id}/recibo`;
      const token = await getToken();
      const nombre = `${tipo === "remision" ? "Nota" : "Orden"}-${id}.pdf`;
      const resultado = await FileSystem.downloadAsync(ruta, `${FileSystem.cacheDirectory}${nombre}`, { headers: { Authorization: `Bearer ${token}` } });
      if (resultado.status !== 200) throw new Error("No se pudo generar la nota.");
      if (!(await Sharing.isAvailableAsync())) throw new Error("Este equipo no permite compartir archivos.");
      await Sharing.shareAsync(resultado.uri, { mimeType: "application/pdf", dialogTitle: "Enviar nota por WhatsApp", UTI: "com.adobe.pdf" });
      if (domicilio?.existe) api.post(`/servicio-domicilio/${id}/nota-enviada`).then(cargarDomicilio).catch(() => {});
    } catch (err) { alerta("Error", err.message); } finally { setDescargando(null); }
  }

  async function guardarManoObra() {
    const cantidad = Math.max(1, Math.round(Number(String(modalMO.cantidad).replace(",", ".")) || 1));
    const unitario = Number(String(modalMO.precio).replace(",", ".")) || 0;
    if (!(unitario > 0)) { alerta("Falta el precio", "Captura un precio mayor a cero."); return; }
    setGuardandoMO(true);
    try {
      const actualizado = await api.post(`/servicios/${id}/detalles`, {
        descripcion: (modalMO.descripcion || "").trim() || "Mano de obra",
        id_refaccion: null,
        cantidad,
        costo_mano_obra: Math.round(unitario * cantidad * 100) / 100,
        costo_refaccion: 0,
        costo_extra: 0,
      });
      setServicio(actualizado);
      setModalMO(null);
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardandoMO(false);
    }
  }

  function quitarDetalle(idDetalle, manoObra = false) {
    alerta(manoObra ? "Quitar mano de obra" : "Quitar refacción", manoObra ? "¿Quitar esta mano de obra de la orden?" : "¿Quitar esta refacción de la orden? Si estaba ligada al inventario, la pieza regresa al stock.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: async () => {
        try { await api.del(`/servicios/${id}/detalles/${idDetalle}`); load(); } catch (err) { alerta("Error", err.message); }
      } },
    ]);
  }

  // --- Refacciones (selección múltiple) ---
  const inventarioDe = (idRef) => inventarioVehiculo.find((i) => i.id_refaccion === idRef);
  function alternarSeleccion(idRef) {
    try { LayoutAnimation.configureNext(LayoutAnimation.create(160, "easeInEaseOut", "opacity")); } catch (e) {}
    setSeleccion((prev) => {
      const copia = { ...prev };
      if (copia[idRef]) delete copia[idRef]; else copia[idRef] = { cantidad: 1 };
      return copia;
    });
  }
  const cambiarCantidadSel = (idRef, delta) => setSeleccion((prev) => ({ ...prev, [idRef]: { ...prev[idRef], cantidad: Math.max(1, (prev[idRef]?.cantidad || 1) + delta) } }));

  function procesarVoz(texto) {
    const esNumV = (w) => /^\d+$/.test(w) || !!NUM_VOZ[w];
    const segmentos = [];
    normVoz(texto).split(/ y | e |,| con | luego | tambien | mas | ademas | otro | otra /).map((x) => x.trim()).filter(Boolean).forEach((seg) => {
      // un número después de palabras empieza otro renglón: "aceite dos bujías" → aceite | dos bujías
      let cur = [];
      seg.split(" ").forEach((w) => {
        if (esNumV(w) && cur.some((x) => !esNumV(x))) { segmentos.push(cur.join(" ")); cur = []; }
        cur.push(w);
      });
      if (cur.length) segmentos.push(cur.join(" "));
    });
    const ok = []; const fallo = []; const nuevos = {};
    segmentos.forEach((seg) => {
      let cant = 1; const toks = [];
      seg.split(" ").forEach((w) => {
        if (/^\d+$/.test(w)) cant = Math.max(1, Number(w));
        else if (NUM_VOZ[w] && toks.length === 0) cant = NUM_VOZ[w];
        else if (!STOP_VOZ.has(w)) toks.push(singVoz(w));
      });
      if (!toks.length) return;
      let mejor = null; let mejorPts = 0;
      refacciones.forEach((r) => {
        const nom = normVoz(r.nombre_refaccion).split(" ").filter((w) => !STOP_VOZ.has(w)).map(singVoz);
        const cat = normVoz(r.categoria).split(" ").map(singVoz);
        let pts = 0;
        toks.forEach((t) => {
          if (nom.some((n) => n.startsWith(t) || (n.length > 3 && t.startsWith(n)))) pts += 1;
          else if (cat.some((n) => n.length > 3 && (n.startsWith(t) || t.startsWith(n)))) pts += 0.4;
        });
        const score = pts / toks.length - 0.03 * Math.max(0, nom.length - pts);
        if (score > mejorPts) { mejorPts = score; mejor = r; }
      });
      if (mejor && mejorPts >= 0.6) {
        // si ya estaba elegida (o se repitió en la misma frase) no se vuelve a sumar
        if (nuevos[mejor.id_refaccion] || seleccion[mejor.id_refaccion]) return;
        nuevos[mejor.id_refaccion] = { cantidad: cant }; ok.push(`${cant} × ${mejor.nombre_refaccion}`);
      }
      else fallo.push(seg);
    });
    if (Object.keys(nuevos).length) {
      try { LayoutAnimation.configureNext(LayoutAnimation.create(160, "easeInEaseOut", "opacity")); } catch (e) {}
      setSeleccion((prev) => ({ ...prev, ...nuevos }));
    }
    setAvisoVoz({ ok, fallo, texto });
  }
  procVozRef.current = procesarVoz;

  useEffect(() => {
    if (!RecVoz || !modalRefacciones) return undefined;
    const subs = [
      RecVoz.addListener("result", (e) => {
        const t = e?.results?.[0]?.transcript || "";
        setTextoVoz(t);
        if (e?.isFinal && t) procVozRef.current && procVozRef.current(t);
      }),
      RecVoz.addListener("end", () => setEscuchando(false)),
      RecVoz.addListener("error", () => setEscuchando(false)),
    ];
    return () => { subs.forEach((x) => x && x.remove && x.remove()); try { RecVoz.abort(); } catch (e) {} };
  }, [modalRefacciones]);

  useEffect(() => {
    if (!escuchando) { pulsoVoz.setValue(0); return undefined; }
    const lazo = Animated.loop(Animated.sequence([
      Animated.timing(pulsoVoz, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulsoVoz, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    lazo.start();
    return () => lazo.stop();
  }, [escuchando]);

  async function alternarVoz() {
    if (!RecVoz) { alerta("Voz no disponible", "Esta función necesita la app instalada con el módulo de voz (no funciona en Expo Go)."); return; }
    if (escuchando) { try { RecVoz.stop(); } catch (e) {} return; }
    try {
      const perm = await RecVoz.requestPermissionsAsync();
      if (!perm.granted) { alerta("Permiso requerido", "Activa micrófono y reconocimiento de voz para usar esta función."); return; }
      setTextoVoz(""); setAvisoVoz(null); setEscuchando(true);
      RecVoz.start({ lang: "es-MX", interimResults: true, continuous: false });
    } catch (err) { setEscuchando(false); alerta("Voz", err.message || "No se pudo iniciar el micrófono."); }
  }

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
        const precio = seleccion[idRef].precio ?? precioVentaRef(inv, ref);
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

  // --- Paquetes de servicio (Afinación, Frenos…) ---
  async function cargarPaquetes() {
    setCargandoPaq(true);
    try { setPaquetes((await api.get("/paquetes-servicio/")) || []); } catch (e) { setPaquetes([]); } finally { setCargandoPaq(false); }
  }
  useEffect(() => {
    if (modalRefacciones && modoAgregar === "paquetes") cargarPaquetes();
  }, [modalRefacciones, modoAgregar]); // eslint-disable-line react-hooks/exhaustive-deps

  const precioRefActual = (idRef) => {
    const inv = inventarioDe(idRef);
    const ref = refacciones.find((r) => r.id_refaccion === idRef);
    return precioVentaRef(inv, ref);
  };
  const totalPaquete = (paq) => (paq.conceptos || []).reduce((t, c) => {
    const cant = c.cantidad || 1;
    return t + (c.id_refaccion ? precioRefActual(c.id_refaccion) * cant : (Number(c.costo_refaccion) || 0) * cant) + (Number(c.costo_mano_obra) || 0) * cant;
  }, 0);

  function aplicarPaquete(paq) {
    alerta(`Agregar «${paq.nombre}»`, `Se agregarán ${paq.conceptos.length} concepto(s) a la orden por aprox. ${fmt(totalPaquete(paq))}. Podrás editar o quitar cada uno después.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Agregar todo", onPress: async () => {
        setAplicandoPaq(paq.id_paquete);
        const faltantes = [];
        try {
          for (const c of paq.conceptos) {
            const cant = c.cantidad || 1;
            const mo = (Number(c.costo_mano_obra) || 0) * cant;
            if (c.id_refaccion) {
              const ref = refacciones.find((r) => r.id_refaccion === c.id_refaccion);
              if (!ref) { faltantes.push(c.descripcion || "Refacción"); continue; }
              await api.post(`/servicios/${id}/detalles`, { id_refaccion: c.id_refaccion, descripcion: ref.nombre_refaccion, cantidad: cant, costo_refaccion: precioRefActual(c.id_refaccion) * cant, costo_mano_obra: mo, costo_extra: 0 });
            } else {
              await api.post(`/servicios/${id}/detalles`, { id_refaccion: null, descripcion: c.descripcion || "Mano de obra", cantidad: cant, costo_mano_obra: mo, costo_refaccion: (Number(c.costo_refaccion) || 0) * cant, costo_extra: 0 });
            }
          }
          setModalRefacciones(false);
          await load();
          alerta("Paquete agregado", faltantes.length ? `Se agregó «${paq.nombre}», pero ya no existen en el catálogo: ${faltantes.join(", ")}.` : `«${paq.nombre}» quedó en la orden.`);
        } catch (err) {
          await load();
          alerta("Error", err.message);
        } finally {
          setAplicandoPaq(null);
        }
      } },
    ]);
  }

  const redondeaP = (v) => Math.round(v * 100) / 100;
  const agregarAPaquete = (nuevos) => setArmandoPaq((p) => {
    const lista = [...(p?.conceptos || [])];
    nuevos.forEach((n) => {
      const i = n.id_refaccion ? lista.findIndex((x) => x.id_refaccion === n.id_refaccion) : -1;
      if (i >= 0) lista[i] = { ...lista[i], cantidad: lista[i].cantidad + n.cantidad };
      else lista.push({ ...n, key: `${Date.now()}-${Math.random()}` });
    });
    return { ...p, conceptos: lista };
  });
  const cambiarCantidadPaq = (key, delta) => setArmandoPaq((p) => ({ ...p, conceptos: p.conceptos.map((x) => (x.key === key ? { ...x, cantidad: Math.max(1, x.cantidad + delta) } : x)) }));
  const quitarDePaquete = (key) => setArmandoPaq((p) => ({ ...p, conceptos: p.conceptos.filter((x) => x.key !== key) }));
  async function guardarPaqueteArmado() {
    const nombre = (armandoPaq?.nombre || "").trim();
    if (!nombre) { alerta("Falta el nombre", "Escribe cómo se llamará el paquete (ej. Afinación mayor)."); return; }
    if (!armandoPaq.conceptos.length) { alerta("Paquete vacío", "Agrega al menos una refacción o concepto."); return; }
    setGuardandoPaq(true);
    try {
      await api.post("/paquetes-servicio/", { nombre, conceptos: armandoPaq.conceptos.map(({ key, ...x }) => x) });
      setArmandoPaq(null);
      cargarPaquetes();
      alerta("Paquete guardado", `«${nombre}» ya está disponible para cualquier orden.`);
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardandoPaq(false);
    }
  }

  async function guardarPaqueteDesdeOrden() {
    const nombre = (modalNuevoPaq?.nombre || "").trim();
    if (!nombre) { alerta("Falta el nombre", "Escribe cómo se llamará el paquete (ej. Afinación mayor)."); return; }
    const conceptos = detalles.map((d) => {
      const cant = Math.max(1, d.cantidad || 1);
      const mo = Math.round(((Number(d.costo_mano_obra) || 0) / cant) * 100) / 100;
      if (d.id_refaccion) return { id_refaccion: d.id_refaccion, descripcion: d.descripcion || null, cantidad: cant, costo_mano_obra: mo, costo_refaccion: 0 };
      return { id_refaccion: null, descripcion: d.descripcion || "Concepto", cantidad: cant, costo_mano_obra: mo, costo_refaccion: Math.round(((Number(d.costo_refaccion) || 0) / cant) * 100) / 100 };
    });
    setGuardandoPaq(true);
    try {
      await api.post("/paquetes-servicio/", { nombre, conceptos });
      setModalNuevoPaq(null);
      cargarPaquetes();
      alerta("Paquete guardado", `«${nombre}» ya está disponible para cualquier orden.`);
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardandoPaq(false);
    }
  }

  function borrarPaquete(paq) {
    alerta("Borrar paquete", `¿Borrar «${paq.nombre}»? Las órdenes que ya lo usaron no cambian.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        try { await api.del(`/paquetes-servicio/${paq.id_paquete}`); cargarPaquetes(); } catch (err) { alerta("Error", err.message); }
      } },
    ]);
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

  async function crearRefaccionRapida({ nombre, categoria, precio }) {
    const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const existente = refacciones.find((r) => norm(r.nombre_refaccion) === norm(nombre) && norm(r.categoria) === norm(categoria));
    let r = existente;
    if (!r) {
      if (!refacciones.some((x) => norm(x.categoria) === norm(categoria))) {
        try { await api.post("/refacciones-categorias/", { nombre_categoria: categoria }); } catch { /* el texto se guarda igual en la refacción */ }
      }
      r = await api.post("/refacciones/", { nombre_refaccion: nombre, categoria, preciocliente_refaccion: precio });
      setRefacciones((p) => [...p, r]);
    }
    setBusquedaRef(""); setFiltroCategoria(""); setZonaRef(null);
    setSeleccion((p) => ({ ...p, [r.id_refaccion]: { cantidad: 1, precio: Number(precio) || undefined } }));
  }

  function abrirAgregar(modo = "catalogo") {
    setSeleccion({}); setFiltroCategoria(""); setBusquedaRef(""); setVerAutoRef(false); setZonaRef(null); setModoAgregar(modo); setModalRefacciones(true);
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
    if (!pagoFinalListo) { alerta("Falta cobrar", `Todavía falta ${fmt(faltaFinal)} para cubrir el saldo.`); return; }
    setCerrando(true);
    try {
      const payload = { comentarios_finales: comentariosFinales, notificar_cliente: notificarFinal && !!servicio.cliente?.cuenta_activada };
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
  const puedeCompartirSeguimiento = abierta && hasPermission("servicios.editar") && hasPermission("servicios.ver_precios");
  const detalles = servicio.detalles || [];
  const detallesRef = detalles.filter((d) => !esManoObra(d));
  const detallesMO = detalles.filter(esManoObra);
  const abonos = servicio.abonos || [];
  const cliente = servicio.cliente || {};
  const vehiculo = servicio.vehiculo || {};
  const badgeStatus = abierta ? [styles.badgePetrol, styles.badgePetrolTexto] : servicio.status === "cerrado" ? [styles.badgeTeal, styles.badgeTealTexto] : [styles.badgeRojo, styles.badgeRojoTexto];
  const responsable = empleados.find((e) => e.id_empleado === servicio.id_empleado_responsable);

  // Conceptos agrupados por categoría de la refacción (igual que la web)
  const grupos = {};
  detallesRef.forEach((d) => {
    const ref = refacciones.find((r) => r.id_refaccion === d.id_refaccion);
    const clave = ref?.categoria ? `${ref.categoria}${ref.subcategoria ? " / " + ref.subcategoria : ""}` : "Sin categoría";
    (grupos[clave] = grupos[clave] || []).push({ d, ref });
  });
  const clavesGrupos = Object.keys(grupos).sort((a, b) => (a === "Sin categoría" ? 1 : b === "Sin categoría" ? -1 : a.localeCompare(b)));

  // Refacciones para el selector
  const categoriasDisponibles = [...new Set(refacciones.map((r) => r.categoria).filter(Boolean))].sort();
  const refPorBusqueda = refacciones.filter((r) => !busquedaRef || contiene(r.nombre_refaccion || "", busquedaRef));
  const refFiltradas = refPorBusqueda.filter((r) =>
    (!filtroCategoria || r.categoria === filtroCategoria) &&
    (!zonaRef || (zonaRef === "otras" ? zonasRefaccion(r).length === 0 : zonasRefaccion(r).includes(zonaRef)))
  );
  // Cuántas refacciones hay (y cuántas marcadas) por zona del auto
  const conteoZona = {}, marcadasZona = {};
  let refSinZona = 0;
  if (verAutoRef) {
    refPorBusqueda.forEach((r) => {
      const zs = zonasRefaccion(r);
      if (!zs.length) refSinZona += 1;
      zs.forEach((z) => { conteoZona[z] = (conteoZona[z] || 0) + 1; if (seleccion[r.id_refaccion]) marcadasZona[z] = (marcadasZona[z] || 0) + 1; });
    });
  }
  const seleccionadas = Object.keys(seleccion).length;

  const PESTANAS = [
    { clave: "refacciones", texto: "Refacciones", icono: "construct-outline", contador: detalles.length },
    { clave: "estatus", texto: "Estatus", icono: "car-sport-outline" },
    { clave: "datos", texto: "Datos", icono: "information-circle-outline" },
  ];

  return (
    <View style={styles.screen}>
      {/* ===== Barra fija compacta: cliente, llamar y vista previa en una sola línea ===== */}
      <View style={styles.cabecera}>
        <View style={[styles.cabFila, { flexWrap: "nowrap" }]}>
          {servicio.es_garantia && <View style={[styles.badge, styles.badgeAmbar]}><Text style={[styles.badgeTexto, styles.badgeAmbarTexto]}>garantía</Text></View>}
          <Ionicons name="person-outline" size={16} color={colors.ink500} />
          <Text style={styles.cabClienteTexto} numberOfLines={1}>{`${cliente.nombre_cliente || "—"} ${cliente.paterno_cliente || ""}`.trim()}</Text>
          {cliente.telefono1 ? (
            <TouchableOpacity style={styles.cabLlamar} onPress={() => Linking.openURL(`tel:${cliente.telefono1}`).catch(() => {})} hitSlop={6}>
              <Ionicons name="call-outline" size={14} color={colors.petrol600} />
              <Text style={styles.cabLlamarTexto}>{cliente.telefono1}</Text>
            </TouchableOpacity>
          ) : null}
          {puedeCompartirSeguimiento && (
            <TouchableOpacity style={[styles.cabIconoBtn, { backgroundColor: "#25D366" }]} onPress={enviarSeguimientoWhatsApp} disabled={enviandoSeg} accessibilityLabel="Enviar seguimiento por WhatsApp" hitSlop={6}>
              {enviandoSeg ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="logo-whatsapp" size={18} color="#fff" />}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.cabIconoBtn} disabled={detalles.length === 0 || !!descargando} onPress={() => descargarPdf(servicio.status === "cerrado" ? "remision" : "recibo")} accessibilityLabel="Vista previa de la nota" hitSlop={6}>
            {descargando === "recibo" || descargando === "remision" ? <ActivityIndicator size="small" color={colors.petrol600} /> : <Ionicons name="eye-outline" size={18} color={detalles.length === 0 ? colors.ink300 : colors.petrol600} />}
          </TouchableOpacity>
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
        {pestana === "refacciones" && (
          <Animated.View style={[styles.resumenCard, { opacity: entradaResumen, transform: [{ translateY: entradaResumen.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
            <View style={styles.resFila}>
              <View style={styles.resAvatar}><Ionicons name="car-sport-outline" size={20} color={colors.petrol600} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.resMarca} numberOfLines={1}>{[vehiculo.marca?.nombre_marca, vehiculo.modelo?.nombre_modelo].filter(Boolean).join(" ") || "Vehículo"}</Text>
                {vehiculo.color?.nombre_color ? <Text style={styles.resColor} numberOfLines={1}>{vehiculo.color.nombre_color}</Text> : null}
              </View>
              {vehiculo.placas_vehiculo ? <View style={styles.cabPlacas}><Text style={styles.cabPlacasTexto}>{vehiculo.placas_vehiculo}</Text></View> : null}
            </View>

            <View style={styles.resTira}>
              <View style={styles.resDato}>
                <Text style={styles.resDatoEtq}>Total</Text>
                <Text style={styles.resDatoVal} numberOfLines={1} adjustsFontSizeToFit>{fmt(servicio.costos.total)}</Text>
              </View>
              <View style={styles.resSep} />
              <TouchableOpacity style={styles.resDato} onPress={() => setModalPagos(true)} activeOpacity={0.7} accessibilityLabel="Ver pagos de la orden">
                <Text style={styles.resDatoEtq}>Pagado{abonos.length ? ` · ${abonos.length}` : ""} ›</Text>
                <Text style={[styles.resDatoVal, { color: colors.teal600 }]} numberOfLines={1} adjustsFontSizeToFit>{fmt(servicio.costos.total_abonado)}</Text>
              </TouchableOpacity>
              <View style={styles.resSep} />
              <View style={styles.resDato}>
                <Text style={styles.resDatoEtq}>{servicio.costos.saldo_pendiente > 0.005 ? "Debe" : "Saldo"}</Text>
                <Text style={[styles.resDatoVal, { color: servicio.costos.saldo_pendiente > 0.005 ? colors.red600 : colors.teal600 }]} numberOfLines={1} adjustsFontSizeToFit>
                  {servicio.costos.saldo_pendiente > 0.005 ? fmt(servicio.costos.saldo_pendiente) : servicio.status === "cerrado" ? "Liquidado" : "Sin saldo"}
                </Text>
              </View>
              {puedeEditar && abierta && !servicio.pagado && (
                <TouchableOpacity style={styles.resMasAbono} onPress={abrirAbono} accessibilityLabel="Registrar abono" hitSlop={6}>
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.resFechas}>
              <TouchableOpacity style={styles.resFecha} disabled={!puedeEditar} onPress={() => setCalendarioFecha("fecha_entrada_servicio")}>
                <Ionicons name="log-in-outline" size={14} color={colors.petrol600} />
                <Text style={styles.resFechaTexto} numberOfLines={1}>{fechaTexto(fechaLocal(servicio.fecha_entrada_servicio)) || "Entrada —"}</Text>
              </TouchableOpacity>
              <Ionicons name="arrow-forward-outline" size={12} color={colors.ink500} />
              <TouchableOpacity style={styles.resFecha} disabled={!puedeEditar} onPress={() => setCalendarioFecha("fecha_salida_servicio")}>
                <Ionicons name="log-out-outline" size={14} color={colors.petrol600} />
                <Text style={styles.resFechaTexto} numberOfLines={1}>{fechaTexto(fechaLocal(servicio.fecha_salida_servicio)) || "Salida por definir"}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

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
              <View style={styles.vacioNuevo}>
                <View style={styles.vacioHalo}>
                  <View style={styles.vacioDisco}><Ionicons name="cube-outline" size={30} color="#ffffff" /></View>
                  <View style={styles.vacioDiscoMini}><Ionicons name="hammer-outline" size={17} color="#ffffff" /></View>
                </View>
                <Text style={styles.vacioNuevoTitulo}>Empieza a armar la orden</Text>
                <Text style={styles.vacioNuevoTexto}>El total se calcula solo.</Text>
                {puedeEditar && abierta && (() => {
                  const tono = tonoPetroleo();
                  return (
                    <View style={styles.vacioOpciones}>
                      <TouchableOpacity style={[styles.vacioOpcion, { borderColor: tono.base, backgroundColor: `${tono.base}1f` }]} activeOpacity={0.8} onPress={() => abrirAgregar("catalogo")}>
                        <Ionicons name="cube-outline" size={26} color={tono.base} />
                        <Text style={[styles.vacioOpcionTitulo, { color: tono.base }]}>Refacción</Text>
                        <Text style={styles.vacioOpcionSub}>Del catálogo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.vacioOpcion, { borderColor: colors.ink300, backgroundColor: colors.paper100 }]} activeOpacity={0.8} onPress={() => setModalMO({ descripcion: "Mano de obra", cantidad: "1", precio: "" })}>
                        <Ionicons name="hammer-outline" size={26} color={colors.ink900} />
                        <Text style={[styles.vacioOpcionTitulo, { color: colors.ink900 }]}>Mano de obra</Text>
                        <Text style={styles.vacioOpcionSub}>O cualquier cargo</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()}
              </View>
            ) : (<>
            {/* ----- Mano de obra (apartado propio, como en la web) ----- */}
            <View style={styles.seccionFila}>
              <Text style={[styles.seccion, { marginTop: 0, marginBottom: 0 }]}>Mano de obra</Text>
              {puedeEditar && abierta && (
                <Boton chico icono="add-outline" texto="Agregar mano de obra" onPress={() => setModalMO({ descripcion: "Mano de obra", cantidad: "1", precio: "" })} />
              )}
            </View>
            {detallesMO.length === 0 ? (
              <Text style={{ fontSize: 11.5, color: colors.ink500, paddingVertical: 2 }}>Sin mano de obra.</Text>
            ) : detallesMO.map((d) => (
              <TarjetaConcepto key={d.id_servicio_detalle} d={d} mo editable={puedeEditar && abierta} tipos={tipos} actualizar={actualizarDetalle} quitar={quitarDetalle} />
            ))}

            {detallesRef.length > 0 && <Text style={[styles.seccion, { marginTop: 10, marginBottom: 6 }]}>Refacciones</Text>}
            {clavesGrupos.map((clave) => (
              <View key={clave}>
                {clavesGrupos.length > 1 && <Text style={styles.grupoTitulo}>{clave}</Text>}
                {grupos[clave].map(({ d, ref }) => (
                  <TarjetaConcepto key={d.id_servicio_detalle} d={d} refaccion={ref} editable={puedeEditar && abierta} tipos={tipos} actualizar={actualizarDetalle} quitar={quitarDetalle} />
                ))}
              </View>
            ))}

            </>)}
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

        {/* ===== ESTATUS ===== */}
        {pestana === "estatus" && (
          <>
            <View style={styles.accesos}>
              {(inspeccionActual || (puedeEditar && hasPermission("servicios.crear"))) && (
                <TouchableOpacity style={styles.accesoFila} onPress={() => setMostrandoInspeccion(true)} disabled={!abierta && !inspeccionActual} activeOpacity={0.8}>
                  <IconoAcceso nombre="car-sport" insignia={inspeccionActual ? "checkmark" : "search"} grande fondo={inspeccionActual ? colors.teal600 : undefined} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accesoTitulo}>{inspeccionActual ? "Inspección realizada" : "Nueva inspección"}</Text>
                    <Text style={styles.accesoSub}>{inspeccionActual ? "Toca para ver o editar el resultado" : "Revisa el vehículo y registra su estado"}</Text>
                  </View>
                  <Ionicons name="chevron-forward-outline" size={20} color={colors.ink500} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.accesoFila} onPress={() => setMostrandoRecepcion(true)} activeOpacity={0.8}>
                <IconoAcceso nombre="car-sport" insignia="log-in" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.accesoTitulo}>Recepción y avance</Text>
                  <Text style={styles.accesoSub}>Daños del auto en 3D y progreso de la orden</Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={20} color={colors.ink500} />
              </TouchableOpacity>
              {abierta && modDomicilio && hasPermission("servicios.editar") && (
                <TouchableOpacity style={styles.accesoFila} onPress={() => setDomicilioAbierto(true)} activeOpacity={0.8}>
                  <IconoAcceso nombre="location" insignia="key" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accesoTitulo}>{domicilio?.existe ? (domicilio.iniciado_at ? "Servicio a domicilio (iniciado)" : "Servicio a domicilio") : "Servicio a domicilio"}</Text>
                    <Text style={styles.accesoSub}>{domicilio?.existe ? (domicilio.iniciado_at ? "Ya se verificó el código del cliente" : "Código y enlace para el mecánico") : "Dirección, código de seguridad y enlace del mecánico"}</Text>
                  </View>
                  <Ionicons name="chevron-forward-outline" size={20} color={colors.ink500} />
                </TouchableOpacity>
              )}
              {puedeCompartirSeguimiento && (
                <TouchableOpacity style={styles.accesoFila} onPress={enviarSeguimientoWhatsApp} disabled={enviandoSeg} activeOpacity={0.8}>
                  <IconoAcceso nombre="logo-whatsapp" insignia="link" fondo="#25D366" cargando={enviandoSeg} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accesoTitulo}>Enviar seguimiento</Text>
                    <Text style={styles.accesoSub}>Link para que el cliente vea el avance, por WhatsApp</Text>
                  </View>
                  <Ionicons name="chevron-forward-outline" size={20} color={colors.ink500} />
                </TouchableOpacity>
              )}
              {!!cliente.cuenta_activada && (
                <TouchableOpacity style={styles.accesoFila} onPress={() => setChatAbierto(true)} activeOpacity={0.8}>
                  <IconoAcceso nombre="chatbubbles" insignia="person" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accesoTitulo}>Chat con el cliente</Text>
                    <Text style={styles.accesoSub}>Mensajes de esta orden en su app</Text>
                  </View>
                  <Ionicons name="chevron-forward-outline" size={20} color={colors.ink500} />
                </TouchableOpacity>
              )}
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
            {puedeEditar && abierta && (
              <View style={[styles.itemCard, styles.ivaFila]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ivaTexto}>Aplicar IVA (16%)</Text>
                  <Text style={styles.filaSub}>Subtotal {fmt(servicio.costos.subtotal)} · IVA {fmt(servicio.costos.iva)}</Text>
                </View>
                <Switch value={(servicio.iva_porcentaje ?? 0) > 0} onValueChange={cambiarIva} trackColor={{ true: colors.petrol500 }} />
              </View>
            )}
            <Bloque icono="pricetags-outline" titulo="Tipo de orden">
              {puedeEditar && abierta ? (
                <>
                  <TextInput
                    style={styles.input}
                    defaultValue={servicio.nombre_servicio || ""}
                    key={`no-${servicio.nombre_servicio || ""}`}
                    placeholder="Ej. Servicio general, Afinación mayor…"
                    placeholderTextColor={colors.ink500}
                    maxLength={120}
                    onEndEditing={(e) => cambiarNombreOrden(e.nativeEvent.text.trim())}
                    onSubmitEditing={(e) => cambiarNombreOrden(e.nativeEvent.text.trim())}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.filaTitulo}>{servicio.nombre_servicio || "Servicio general"}</Text>
                </>
              )}
            </Bloque>

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

            <Bloque icono="calendar-outline" titulo="Fechas">
              {[["fecha_entrada_servicio", "Fecha de entrada"], ["fecha_salida_servicio", "Fecha de salida"]].map(([campo, etq]) => {
                const valor = fechaLocal(servicio[campo]);
                return (
                  <TouchableOpacity key={campo} style={styles.filaLista} disabled={!puedeEditar} onPress={() => setCalendarioFecha(campo)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.filaSub}>{etq}</Text>
                      <Text style={styles.filaTitulo}>{valor ? fechaTexto(valor) : "Sin capturar (la nota usa el día en que se genera)"}</Text>
                    </View>
                    {puedeEditar && <Ionicons name="calendar-outline" size={20} color={colors.petrol500} />}
                  </TouchableOpacity>
                );
              })}
            </Bloque>

            <Bloque icono="person-outline" titulo="Cliente">
              <Dato etiqueta="Cuenta" valor={cliente.numero_cuenta} />
              <Dato etiqueta="Nombre" valor={`${cliente.nombre_cliente || ""} ${cliente.paterno_cliente || ""}`.trim()} />
              <Dato etiqueta="Teléfono" valor={cliente.telefono1} />
            </Bloque>

            <Bloque icono="car-outline" titulo="Vehículo">
              <Dato etiqueta="Marca / modelo" valor={[vehiculo.marca?.nombre_marca, vehiculo.modelo?.nombre_modelo].filter(Boolean).join(" ")} />
              <DatoEditable etiqueta="Placas" valor={vehiculo.placas_vehiculo} editable={hasPermission("vehiculos.editar") && !!vehiculo.id_vehiculo} mayusculas onGuardar={(v) => guardarCampoVehiculo({ placas_vehiculo: v.toUpperCase() })} />
              <Dato etiqueta="Color" valor={vehiculo.color?.nombre_color} />
              <DatoEditable etiqueta="Km de llegada" valor={servicio.km_llegada} editable={puedeEditar && abierta} teclado="number-pad" onGuardar={(v) => guardarCampoVehiculo({ km_llegada: v })} />
              <DatoEditable etiqueta="Próximo servicio (km)" valor={servicio.km_proximo_servicio} editable={puedeEditar && abierta} teclado="number-pad" onGuardar={(v) => guardarCampoVehiculo({ km_proximo_servicio: v })} />
              <DatoEditable etiqueta="VIN" valor={vehiculo.numserie_vehiculo} editable={hasPermission("vehiculos.editar") && !!vehiculo.id_vehiculo} mayusculas onGuardar={(v) => guardarCampoVehiculo({ numserie_vehiculo: v.toUpperCase() })} />
              {fotoVehiculo && <Image source={{ uri: urlArchivo(fotoVehiculo.ruta_archivo) }} style={styles.fotoVehiculo} />}
              {servicio.diagnostico ? <Dato etiqueta="Diagnóstico" valor={servicio.diagnostico} /> : null}
              {servicio.operaciones ? <Dato etiqueta="Operaciones" valor={servicio.operaciones} /> : null}
              {servicio.autorizado_cliente ? <Text style={styles.autorizado}><Ionicons name="checkmark-circle-outline" size={13} /> Autorizado por el cliente</Text> : null}
            </Bloque>

            <Bloque icono="create-outline" titulo="Comentarios finales">
              <Text style={styles.filaSub}>Aparecen en el recibo y la nota de remisión.</Text>
              <TextInput style={[styles.textarea, { marginTop: 8 }]} value={comentariosFinales} onChangeText={setComentariosFinales} multiline editable={puedeEditar}
                placeholder="Ej. Se recomienda revisar las balatas traseras en el próximo servicio." placeholderTextColor={colors.ink500} />
              <Text style={[styles.filaSub, { marginTop: 6, minHeight: 18 }]}>
                {guardandoComentarios || comentariosFinales !== comentariosGuardados ? "Guardando…" : comentariosFinales ? "Guardado automáticamente" : ""}
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
                    <Ionicons name="chevron-forward-outline" size={18} color={colors.ink500} />
                  </TouchableOpacity>
                ))}
              </Bloque>
            )}

            <Bloque icono="document-text-outline" titulo="Documentos">
              <View style={{ gap: 10 }}>
                {hasPermission("servicios.ver_precios") && <>
                <Boton icono="eye-outline" texto="Vista previa del recibo" onPress={() => descargarPdf("recibo")} deshabilitado={detalles.length === 0} cargando={descargando === "recibo"} />
                {servicio.status === "cerrado" && <Boton icono="document-text-outline" texto="Nota de remisión" onPress={() => descargarPdf("remision")} cargando={descargando === "remision"} />}
                <Boton icono="logo-whatsapp" texto="Enviar nota por WhatsApp" onPress={enviarNotaWhatsApp} deshabilitado={detalles.length === 0} cargando={descargando === "whatsapp"} />
                </>}
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
          {(() => {
            const tono = tonoPetroleo();
            return (
              <TouchableOpacity style={[styles.barraAgregar, { borderColor: tono.base, backgroundColor: `${tono.base}1f` }]} activeOpacity={0.8} onPress={() => abrirAgregar(refacciones.length ? "catalogo" : "libre")} accessibilityLabel="Agregar refacción">
                <View style={[styles.barraMas, { backgroundColor: tono.base }]}><Ionicons name="add-outline" size={22} color="#ffffff" /></View>
                <Text style={[styles.barraAgregarTexto, { color: tono.base }]}>Agregar</Text>
              </TouchableOpacity>
            );
          })()}
          <DeslizarCobrar
            etiqueta={conSaldoFinal ? "Desliza para cobrar" : "Desliza para finalizar"}
            monto={conSaldoFinal ? fmt(saldoFinal) : null}
            deshabilitado={detalles.length === 0}
            onConfirmar={abrirModalCierre}
          />
        </View>
      )}

      <Calendario
        visible={!!calendarioFecha}
        valor={calendarioFecha ? fechaLocal(servicio[calendarioFecha]) : ""}
        titulo={calendarioFecha === "fecha_salida_servicio" ? "Fecha de salida" : "Fecha de entrada"}
        onElegir={(v) => cambiarFecha(calendarioFecha, v)}
        onCerrar={() => setCalendarioFecha(null)}
      />

      <InspeccionForm
        visible={mostrandoInspeccion}
        idVehiculo={servicio.id_vehiculo}
        idServicio={servicio.id_servicio}
        inspeccionExistente={inspeccionActual}
        refacciones={refacciones}
        onGuardado={(g) => setInspeccionActual(g)}
        onClose={() => setMostrandoInspeccion(false)}
        puedeEditar={puedeEditar && abierta}
      />

      <DomicilioModal
        visible={domicilioAbierto}
        idServicio={servicio.id_servicio}
        nombreServicio={servicio.nombre_servicio}
        nombreTaller={datosTaller?.nombre_taller}
        empleados={empleados}
        onCerrar={() => setDomicilioAbierto(false)}
        onCambio={() => { cargarDomicilio(); load(); }}
      />

      <RecepcionAutoModal
        visible={mostrandoRecepcion}
        idServicio={servicio.id_servicio}
        puedeEditar={puedeEditar && abierta}
        onClose={() => setMostrandoRecepcion(false)}
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
            <TouchableOpacity onPress={() => setChatAbierto(false)} hitSlop={10}><Ionicons name="close-outline" size={24} color={colors.ink900} /></TouchableOpacity>
          </View>
          <View style={{ flex: 1, padding: spacing.md }}>
            <ChatOrden servicioId={servicio.id_servicio} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Agregar mano de obra */}
      <Modal visible={!!modalMO} animationType="slide" onRequestClose={() => setModalMO(null)}>
        <View style={styles.modalPantalla}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>Agregar mano de obra</Text>
            <TouchableOpacity onPress={() => setModalMO(null)} hitSlop={10}><Ionicons name="close-outline" size={24} color={colors.ink900} /></TouchableOpacity>
          </View>
          {modalMO && (
            <>
              <ScrollCampos contentContainerStyle={{ padding: spacing.lg, gap: 12 }} keyboardShouldPersistTaps="handled">
                <View>
                  <Text style={styles.label}>Descripción *</Text>
                  <TextInput style={styles.input} value={modalMO.descripcion} onChangeText={(v) => setModalMO((p) => ({ ...p, descripcion: v }))} placeholder="Ej. Cambio de balatas, afinación mayor…" placeholderTextColor={colors.ink500} autoFocus />
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Cantidad</Text>
                    <TextInput style={styles.input} value={modalMO.cantidad} onChangeText={(v) => setModalMO((p) => ({ ...p, cantidad: v }))} keyboardType="number-pad" placeholderTextColor={colors.ink500} />
                  </View>
                  <View style={{ flex: 1.4 }}>
                    <Text style={styles.label}>Precio unitario *</Text>
                    <TextInput style={styles.input} value={modalMO.precio} onChangeText={(v) => setModalMO((p) => ({ ...p, precio: v }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.ink500} />
                  </View>
                </View>
                <Text style={styles.resultadoPago}>
                  Importe: {fmt((Number(String(modalMO.precio).replace(",", ".")) || 0) * Math.max(1, Math.round(Number(String(modalMO.cantidad).replace(",", ".")) || 1)))}
                </Text>
              </ScrollCampos>
              <View style={styles.modalPie}>
                <Boton texto="Cancelar" onPress={() => setModalMO(null)} estilo={{ flex: 1 }} />
                <Boton tipo="primario" icono="add-outline" texto="Agregar a la orden" onPress={guardarManoObra} cargando={guardandoMO} estilo={{ flex: 1.6 }} />
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Agregar refacciones */}
      <Modal visible={modalRefacciones} animationType="slide" onRequestClose={() => setModalRefacciones(false)}>
        <View style={styles.modalPantalla}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>Agregar a la orden #{servicio.id_servicio}</Text>
            <TouchableOpacity onPress={() => setModalRefacciones(false)} hitSlop={10}><Ionicons name="close-outline" size={24} color={colors.ink900} /></TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            <View style={styles.segmentado}>
              {[{ v: "catalogo", t: "Catálogo", i: "cube-outline" }, { v: "paquetes", t: "Paquetes", i: "layers-outline" }, { v: "libre", t: "Libre", i: "create-outline" }].map((m) => (
                <TouchableOpacity key={m.v} style={[styles.segmento, modoAgregar === m.v && [styles.segmentoActivo, { backgroundColor: tonoRojo().base }]]} onPress={() => setModoAgregar(m.v)}>
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
                <Boton tipo="primario" icono="add-outline" texto="Agregar a la orden" onPress={guardarConceptoLibre} cargando={guardandoRefacciones} estilo={{ flex: 1.6 }} />
              </View>
            </>
          ) : modoAgregar === "paquetes" ? (
            <>
              <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 10 }}>
                <Text style={styles.filaSub}>Toca un paquete para agregar todos sus conceptos de una vez. Mantén presionado para borrarlo.</Text>
                <Boton tipo="primario" icono="add-circle-outline" texto="Nuevo paquete (elegir refacciones)" onPress={() => setArmandoPaq({ nombre: "", conceptos: [] })} />
                {cargandoPaq ? <ActivityIndicator color={colors.petrol500} style={{ marginTop: 20 }} /> : paquetes.length === 0 ? (
                  <Text style={styles.vacio}>Todavía no tienes paquetes. Crea uno con «Nuevo paquete» o guarda esta orden como paquete con el botón de abajo.</Text>
                ) : paquetes.map((paq) => (
                  <TouchableOpacity key={paq.id_paquete} style={styles.paqueteFila} onPress={() => aplicarPaquete(paq)} onLongPress={() => borrarPaquete(paq)} disabled={aplicandoPaq !== null} activeOpacity={0.8}>
                    <View style={styles.accesoIcono}>
                      {aplicandoPaq === paq.id_paquete ? <ActivityIndicator color="#fff" /> : <Ionicons name="layers" size={24} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.accesoTitulo} numberOfLines={1}>{paq.nombre}</Text>
                      <Text style={styles.accesoSub} numberOfLines={2}>{paq.conceptos.length} concepto(s) · {paq.conceptos.map((c) => c.descripcion || "Refacción").slice(0, 3).join(", ")}{paq.conceptos.length > 3 ? "…" : ""}</Text>
                    </View>
                    <Text style={styles.paqueteTotal}>{fmt(totalPaquete(paq))}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.modalPie}>
                <TouchableOpacity style={[styles.pieBtn, { flex: 1, borderWidth: 1.5, borderColor: tonoRojo().base }]} onPress={() => setModalRefacciones(false)} activeOpacity={0.8}>
                  <Text style={[styles.pieBtnTexto, { color: tonoRojo().base }]}>Cerrar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pieBtn, { flex: 1.5, paddingHorizontal: 10, backgroundColor: tonoRojo().base, opacity: detalles.length ? 1 : 0.55 }]} onPress={() => setModalNuevoPaq({ nombre: "" })} disabled={!detalles.length} activeOpacity={0.85}>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={[styles.pieBtnTexto, { color: "#fff", flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit>Guardar paquete</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
          <>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput style={[styles.search, { flex: 1 }]} placeholder="Buscar refacción…" placeholderTextColor={colors.ink500} value={busquedaRef} onChangeText={setBusquedaRef} />
              <TouchableOpacity onPress={alternarVoz} activeOpacity={0.8} style={styles.btnVoz}>
                {escuchando && <Animated.View pointerEvents="none" style={[styles.pulsoVoz, { opacity: pulsoVoz.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulsoVoz.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }]} />}
                <Ionicons name={escuchando ? "stop" : "mic"} size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            {(escuchando || avisoVoz) && (
              <View style={styles.vozPanel}>
                {escuchando ? (
                  <Text style={styles.vozTexto}>{textoVoz ? `“${textoVoz}”` : "Escuchando… di por ejemplo: «aceite de motor, dos amortiguadores delanteros y aditivos»"}</Text>
                ) : (
                  <>
                    {avisoVoz.ok.length > 0 && <Text style={styles.vozTexto}>Seleccionado: {avisoVoz.ok.join(" · ")}</Text>}
                    {avisoVoz.fallo.length > 0 && <Text style={[styles.vozTexto, { color: colors.warn600 }]}>No encontré: {avisoVoz.fallo.join(" · ")}</Text>}
                    {avisoVoz.ok.length === 0 && avisoVoz.fallo.length === 0 && <Text style={styles.vozTexto}>No te entendí, intenta de nuevo.</Text>}
                  </>
                )}
                {!escuchando && <TouchableOpacity onPress={() => setAvisoVoz(null)} hitSlop={8} style={{ position: "absolute", top: 6, right: 8 }}><Ionicons name="close-outline" size={18} color={colors.ink500} /></TouchableOpacity>}
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <FiltroCategoria
                  categorias={categoriasDisponibles.map((c) => ({ nombre: c, cuenta: refPorBusqueda.filter((r) => r.categoria === c).length }))}
                  valor={filtroCategoria}
                  onChange={setFiltroCategoria}
                />
              </View>
              <TouchableOpacity style={[styles.chip, verAutoRef && styles.chipActivo, { flexDirection: "row", alignItems: "center", gap: 5 }]} onPress={() => { setVerAutoRef(!verAutoRef); setZonaRef(null); }}>
                <Ionicons name="car-sport-outline" size={15} color={verAutoRef ? colors.sobreAcento : colors.ink700} />
                <Text style={[styles.chipTexto, verAutoRef && styles.chipTextoActivo]}>{verAutoRef ? "Ocultar auto" : "En el auto"}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 8 }} keyboardShouldPersistTaps="handled">
            {verAutoRef && (
              <View style={{ marginBottom: 6 }}>
                <Auto3D compacto altura={230} fps={18} estadoZona={(z) => (marcadasZona[z] ? "refsel" : conteoZona[z] ? "ref" : "ninguno")}
                  etiqueta={(z) => (conteoZona[z] ? (conteoZona[z] > 99 ? "99+" : String(conteoZona[z])) : "")}
                  elegida={zonaRef && zonaRef !== "otras" ? zonaRef : null} onSelect={(z) => setZonaRef(zonaRef === z ? null : z)}
                  ayuda="Gira el auto y toca una zona para ver sus refacciones" />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <Text style={[styles.filaTitulo, { flex: 1, minWidth: 140, color: colors.petrol600 }]} numberOfLines={2}>{zonaRef === "otras" ? "Sin zona" : zonaRef ? ZONAS[zonaRef] : "Todo el vehículo"}</Text>
                  {refSinZona > 0 && (
                    <TouchableOpacity style={[styles.chip, zonaRef === "otras" && styles.chipActivo]} onPress={() => setZonaRef(zonaRef === "otras" ? null : "otras")}>
                      <Text style={[styles.chipTexto, zonaRef === "otras" && styles.chipTextoActivo]}>Sin zona ({refSinZona})</Text>
                    </TouchableOpacity>
                  )}
                  {zonaRef && <TouchableOpacity style={styles.chip} onPress={() => setZonaRef(null)}><Text style={styles.chipTexto}>Ver todas</Text></TouchableOpacity>}
                </View>
              </View>
            )}
            {refFiltradas.length === 0 ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.vacio}>{refacciones.length === 0 ? "Todavía no hay refacciones en el catálogo." : "No hay refacciones que coincidan."}</Text>
                {hasPermission("refacciones.crear") && <Boton icono="add-circle-outline" texto={`Agregar al catálogo${busquedaRef.trim() ? ` «${busquedaRef.trim()}»` : ""}`} onPress={() => setCreandoRef(true)} />}
                <Boton icono="create-outline" texto="Agregarla como concepto libre" onPress={() => { setLibre((p) => ({ ...p, descripcion: busquedaRef })); setModoAgregar("libre"); }} />
              </View>
            ) : (
              <View style={styles.rejillaRef}>
                {refFiltradas.map((r) => {
                  const inv = inventarioDe(r.id_refaccion);
                  const marcada = !!seleccion[r.id_refaccion];
                  const stock = inv ? inv.cantidad : (r.cantidad_refaccion ?? 0);
                  const precio = seleccion[r.id_refaccion]?.precio ?? precioVentaRef(inv, r);
                  const tonoR = tonoRojo();
                  return (
                    <TouchableOpacity
                      key={r.id_refaccion}
                      style={[styles.tileRef, marcada && { borderColor: tonoR.base, backgroundColor: `${tonoR.base}1F`, shadowColor: tonoR.base, shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4 }]}
                      onPress={() => alternarSeleccion(r.id_refaccion)} activeOpacity={0.85}
                    >
                      <Text style={styles.tileNombre} numberOfLines={2}>{r.nombre_refaccion}</Text>
                      <Text style={styles.tileCat} numberOfLines={1}>{r.categoria || "Sin categoría"}</Text>
                      <Text style={[styles.tilePrecio, marcada && { color: tonoR.base }, !precio && { fontSize: 14, color: colors.ink500, fontWeight: "600" }]} numberOfLines={1} adjustsFontSizeToFit>{precio ? fmt(precio) : "Sin precio"}</Text>
                      {!inv && inventarioVehiculo.length > 0 && <Text style={styles.advertencia} numberOfLines={1}>Sin inv. del vehículo</Text>}
                      {marcada && (
                        <View style={[styles.tileContador, { backgroundColor: tonoR.base }]}>
                          <TouchableOpacity onPress={() => cambiarCantidadSel(r.id_refaccion, -1)} hitSlop={8}><Ionicons name="remove-outline" size={20} color="#fff" /></TouchableOpacity>
                          <Text style={styles.tileContadorTexto}>{seleccion[r.id_refaccion].cantidad}</Text>
                          <TouchableOpacity onPress={() => cambiarCantidadSel(r.id_refaccion, 1)} hitSlop={8}><Ionicons name="add-outline" size={20} color="#fff" /></TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
          <View style={styles.modalPie}>
            <TouchableOpacity style={[styles.pieBtn, { flex: 1, borderWidth: 1.5, borderColor: tonoRojo().base }]} onPress={() => setModalRefacciones(false)} activeOpacity={0.8}>
              <Text style={[styles.pieBtnTexto, { color: tonoRojo().base }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pieBtn, { flex: 1.5, backgroundColor: tonoRojo().base, opacity: seleccionadas ? 1 : 0.55 }]} onPress={guardarRefacciones} disabled={!seleccionadas || guardandoRefacciones} activeOpacity={0.85}>
              {guardandoRefacciones ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name={seleccionadas ? "checkmark-circle-outline" : "hand-left-outline"} size={18} color="#fff" />
                  <Text style={[styles.pieBtnTexto, { color: "#fff" }]}>{seleccionadas ? `Agregar ${seleccionadas}` : "Toca para elegir"}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          </>
          )}
        </View>
      </Modal>
      <NuevaRefaccionModal visible={creandoRef} nombreInicial={busquedaRef.trim()} onCerrar={() => setCreandoRef(false)} onCrear={crearRefaccionRapida}
        categorias={[...new Set(refacciones.map((r) => r.categoria).filter(Boolean))].sort()} />

      {/* Armar paquete eligiendo refacciones */}
      <Modal visible={!!armandoPaq} animationType="slide" onRequestClose={() => setArmandoPaq(null)}>
        <View style={styles.modalPantalla}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>Nuevo paquete</Text>
            <TouchableOpacity onPress={() => setArmandoPaq(null)} hitSlop={10}><Ionicons name="close-outline" size={24} color={colors.ink900} /></TouchableOpacity>
          </View>
          <ScrollCampos contentContainerStyle={{ padding: spacing.lg, gap: 10, paddingBottom: 60 }}>
            <View>
              <Text style={styles.label}>Nombre del paquete *</Text>
              <TextInput style={styles.input} placeholder="Ej. Afinación mayor" placeholderTextColor={colors.ink500} value={armandoPaq?.nombre || ""} onChangeText={(v) => setArmandoPaq((p) => ({ ...p, nombre: v }))} maxLength={100} />
            </View>
            <Text style={styles.filaSub}>Las refacciones toman el precio vigente cada vez que uses el paquete.</Text>
            {(armandoPaq?.conceptos || []).map((x) => {
              const unit = x.id_refaccion ? precioRefActual(x.id_refaccion) : (Number(x.costo_refaccion) || 0);
              const imp = (unit + (Number(x.costo_mano_obra) || 0)) * x.cantidad;
              return (
                <View key={x.key} style={styles.nuiCard}>
                  <View style={styles.nuiFila}>
                    <View style={[styles.nuiIcono, !x.id_refaccion && { backgroundColor: colors.warn100 }]}>
                      <Ionicons name={x.id_refaccion ? "cube-outline" : "hammer-outline"} size={18} color={x.id_refaccion ? colors.petrol600 : colors.warn600} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nuiTitulo} numberOfLines={2}>{x.descripcion}</Text>
                      <Text style={styles.nuiSub}>{fmt(imp)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => cambiarCantidadPaq(x.key, -1)} disabled={x.cantidad <= 1} hitSlop={8}><Ionicons name="remove-circle-outline" size={28} color={x.cantidad > 1 ? colors.petrol600 : colors.ink300} /></TouchableOpacity>
                    <Text style={styles.nuiStepperNum}>{x.cantidad}</Text>
                    <TouchableOpacity onPress={() => cambiarCantidadPaq(x.key, 1)} hitSlop={8}><Ionicons name="add-circle-outline" size={28} color={colors.petrol600} /></TouchableOpacity>
                    <TouchableOpacity onPress={() => quitarDePaquete(x.key)} hitSlop={8}><Ionicons name="trash-outline" size={20} color={colors.red600} /></TouchableOpacity>
                  </View>
                </View>
              );
            })}
            <Boton icono="add-circle-outline" texto="Agregar refacciones o mano de obra" onPress={() => setHojaPaq(true)} />
            {(armandoPaq?.conceptos || []).length > 0 && (
              <Text style={styles.resultadoPago}>Total aprox.: {fmt(totalPaquete({ conceptos: armandoPaq.conceptos }))}</Text>
            )}
          </ScrollCampos>
          <View style={styles.modalPie}>
            <Boton texto="Cancelar" onPress={() => setArmandoPaq(null)} estilo={{ flex: 1 }} />
            <Boton tipo="primario" icono="save-outline" texto="Guardar paquete" onPress={guardarPaqueteArmado} cargando={guardandoPaq} estilo={{ flex: 1.6 }} />
          </View>
          <HojaAgregarConceptos
            visible={hojaPaq}
            titulo="Agregar al paquete"
            refacciones={refacciones}
            tipos={tipos}
            precioDe={(r) => precioRefActual(r.id_refaccion)}
            onAgregarCatalogo={(items) => {
              agregarAPaquete(items.map((it) => ({ id_refaccion: it.refaccion.id_refaccion, descripcion: it.refaccion.nombre_refaccion, cantidad: it.cantidad, costo_mano_obra: 0, costo_refaccion: 0 })));
              setHojaPaq(false);
            }}
            onAgregarLibre={(cc) => {
              const cant = Math.max(1, cc.cantidad || 1);
              agregarAPaquete([{ id_refaccion: null, descripcion: cc.descripcion, cantidad: cant, costo_mano_obra: redondeaP((Number(cc.costo_mano_obra) || 0) / cant), costo_refaccion: redondeaP(((Number(cc.costo_refaccion) || 0) + (Number(cc.costo_extra) || 0)) / cant) }]);
              setHojaPaq(false);
            }}
            onCerrar={() => setHojaPaq(false)}
          />
        </View>
      </Modal>

      {/* Nuevo paquete desde la orden */}
      <Modal visible={!!modalNuevoPaq} transparent animationType="fade" onRequestClose={() => setModalNuevoPaq(null)}>
        <View style={[styles.modalBackdrop, { justifyContent: "center", padding: 20 }]}>
          <View style={[styles.modalSheet, { borderRadius: 18 }]}>
            <Text style={styles.modalTitulo}>Guardar como paquete</Text>
            <Text style={styles.filaSub}>Se guardan los {detalles.length} concepto(s) de esta orden. Las refacciones toman el precio vigente cada vez que lo uses.</Text>
            <TextInput style={[styles.input, { marginTop: 12 }]} placeholder="Nombre (ej. Afinación mayor)" placeholderTextColor={colors.ink500} value={modalNuevoPaq?.nombre || ""} onChangeText={(v) => setModalNuevoPaq({ nombre: v })} autoFocus maxLength={100} />
            <View style={styles.modalAcciones}>
              <Boton texto="Cancelar" onPress={() => setModalNuevoPaq(null)} estilo={{ flex: 1 }} />
              <Boton tipo="primario" texto="Guardar" onPress={guardarPaqueteDesdeOrden} cargando={guardandoPaq} estilo={{ flex: 1.4 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Pagos de la orden */}
      <Modal visible={modalPagos} transparent animationType="slide" onRequestClose={() => setModalPagos(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={styles.modalTitulo}>Pagos de la orden #{servicio.id_servicio}</Text>
              <TouchableOpacity onPress={() => setModalPagos(false)} hitSlop={10}><Ionicons name="close-outline" size={24} color={colors.ink900} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8 }}>
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
                    {puedeEditar && abierta && !servicio.pagado && a.id_abono ? (
                      <TouchableOpacity onPress={() => borrarAbono(a.id_abono)} style={{ marginLeft: 10, padding: 6 }} accessibilityLabel="Borrar abono">
                        <Ionicons name="trash-outline" size={20} color={colors.red600} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })}
            </ScrollView>
            {puedeEditar && abierta && !servicio.pagado && (
              <Boton tipo="primario" icono="add-circle-outline" texto="Registrar abono" onPress={() => { setModalPagos(false); setTimeout(abrirAbono, 250); }} estilo={{ marginTop: 12 }} />
            )}
          </View>
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

            {cliente.cuenta_activada ? (
              <View style={styles.ivaFila}>
                <Text style={[styles.ivaTexto, { flex: 1 }]}>Avisar al cliente en su app que su vehículo está listo</Text>
                <Switch value={notificarFinal} onValueChange={setNotificarFinal} trackColor={{ true: colors.petrol500 }} />
              </View>
            ) : null}

            <Text style={[styles.label, { marginTop: spacing.md }]}>Al continuar</Text>
            <View style={{ gap: 4 }}>
              {conSaldoFinal ? <Text style={styles.ivaTexto}><Ionicons name="checkmark-outline" size={13} /> Se registra el cobro de {fmt(saldoFinal)}</Text> : null}
              <Text style={styles.ivaTexto}><Ionicons name="checkmark-outline" size={13} /> La orden #{servicio.id_servicio} se cerrará (puedes reabrirla después)</Text>
              <Text style={styles.ivaTexto}><Ionicons name="checkmark-outline" size={13} /> Se generará la nota de remisión para imprimir o enviar</Text>
              {notificarFinal && cliente.cuenta_activada ? <Text style={styles.ivaTexto}><Ionicons name="checkmark-outline" size={13} /> Se avisará al cliente que su vehículo está listo</Text> : null}
            </View>

            <View style={styles.modalAcciones}>
              <Boton texto="Cancelar" onPress={() => setModalCierre(false)} estilo={{ flex: 1 }} />
              <Boton tipo="primario" texto={conSaldoFinal ? `Cobrar y finalizar` : "Finalizar"} onPress={confirmarCierre} cargando={cerrando}
                deshabilitado={!pagoFinalListo} estilo={{ flex: 1.4 }} />
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
  badgeDomicilio: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 100, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: "#ff6b4a" },
  badgeDomicilioTexto: { fontSize: 11, fontWeight: "700", color: "#fff" },
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
  btnPrimarioTexto: { fontSize: 14.5, fontWeight: "600", color: colors.sobreAcento },
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
  segmentoTextoActivo: { color: colors.sobreAcento },
  resultadoPago: { fontSize: 14, fontWeight: "700", marginTop: 8 },
  chip: { borderWidth: 1, borderColor: colors.ink300, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.paper100 },
  chipActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  chipTexto: { fontSize: 13, fontWeight: "600", color: colors.ink700 },
  chipTextoActivo: { color: colors.sobreAcento },
  tarjetaRef: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper100, borderWidth: 1.5, borderColor: colors.ink300, borderRadius: 10, padding: 12 },
  tarjetaRefActiva: { borderColor: colors.petrol500, backgroundColor: colors.petrol100 },
  pieBtn: { height: 48, borderRadius: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  pieBtnTexto: { fontSize: 15, fontWeight: "700" },
  btnVoz: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.petrol500, alignItems: "center", justifyContent: "center" },
  pulsoVoz: { position: "absolute", width: 46, height: 46, borderRadius: 23, backgroundColor: colors.petrol500 },
  vozPanel: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.petrol500, borderRadius: 10, paddingVertical: 8, paddingLeft: 12, paddingRight: 28, gap: 3 },
  vozTexto: { fontSize: 13, color: colors.ink900 },
  paqueteFila: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 14, padding: 12 },
  paqueteTotal: { fontSize: 15, fontWeight: "800", color: colors.ink900 },
  rejillaRef: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tileRef: { width: "48%", flexGrow: 1, backgroundColor: colors.paper100, borderWidth: 2, borderColor: colors.ink300, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 10, gap: 2 },
  tileNombre: { fontSize: 14, fontWeight: "700", color: colors.ink900, lineHeight: 18 },
  tileCat: { fontSize: 11.5, color: colors.ink500 },
  tilePie: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 6 },
  tilePrecio: { marginTop: 6, fontSize: 20, fontWeight: "800", color: colors.ink900, letterSpacing: -0.3 },
  tileStock: { backgroundColor: colors.ink300 + "55", borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  tileStockTexto: { fontSize: 10.5, fontWeight: "700", color: colors.ink700 },
  tileContador: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 },
  tileContadorTexto: { fontSize: 15, fontWeight: "800", color: "#fff" },
  advertencia: { fontSize: 11.5, color: colors.warn600, marginTop: 3 },
  contador: { flexDirection: "row", alignItems: "center", gap: 6 },
  cabecera: { backgroundColor: colors.paper100, paddingHorizontal: spacing.lg, paddingTop: 12, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  cabId: { fontFamily: "BarlowCondensed_700Bold", fontSize: 22, color: colors.ink900 },
  cabCompactoAuto: { flex: 1, minWidth: 60, fontSize: 13.5, fontWeight: "700", color: colors.ink900 },
  cabSaldo: { borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10 },
  cabSaldoTexto: { fontSize: 12, fontWeight: "800" },
  resumenCard: { backgroundColor: colors.paper100, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.ink300 },
  resFila: { flexDirection: "row", alignItems: "center", gap: 8 },
  resAvatar: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  resMarca: { fontFamily: "Inter_700Bold", fontSize: 15.5, color: colors.ink900 },
  resColor: { fontSize: 11.5, color: colors.ink500, marginTop: -1 },
  resTira: { flexDirection: "row", alignItems: "center", marginTop: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.paper0 },
  resDato: { flex: 1, paddingHorizontal: 10 },
  resDatoEtq: { fontSize: 9.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.5 },
  resDatoVal: { fontFamily: "Inter_700Bold", fontSize: 14.5, color: colors.ink900 },
  resMasAbono: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.petrol500, alignItems: "center", justifyContent: "center", marginHorizontal: 8 },
  resSep: { width: 1, height: 26, backgroundColor: colors.ink300 },
  resFechas: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  resFecha: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 100, borderWidth: 1, borderColor: colors.ink300 },
  resFechaTexto: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.ink700 },
  nuiCard: { backgroundColor: colors.paper100, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.ink300, overflow: "hidden" },
  nuiFila: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12 },
  nuiIcono: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  nuiTitulo: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: colors.ink900 },
  nuiSub: { fontSize: 11.5, color: colors.ink500, marginTop: 1 },
  nuiCant: { backgroundColor: colors.petrol100, borderRadius: 10, paddingVertical: 3, paddingHorizontal: 9, alignItems: "center", minWidth: 42 },
  nuiCantTexto: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 18, color: colors.petrol600 },
  nuiCantPzas: { fontSize: 9.5, fontWeight: "700", color: colors.petrol600, textTransform: "uppercase", letterSpacing: 0.4 },
  nuiImporte: { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.ink900 },
  nuiExtra: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 2, borderTopWidth: 1, borderTopColor: colors.ink300 },
  nuiControles: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 10 },
  nuiStepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  nuiStepperNum: { fontFamily: "Inter_700Bold", fontSize: 18, minWidth: 26, textAlign: "center", color: colors.ink900 },
  nuiPista: { fontSize: 11, color: colors.ink500, marginTop: 10, textAlign: "center" },
  nuiQuitar: { width: 92, marginBottom: 8, marginLeft: 8, borderRadius: 14, backgroundColor: colors.red600, alignItems: "center", justifyContent: "center", gap: 2 },
  nuiQuitarTexto: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  hdrTitulo: { flexDirection: "row", alignItems: "center", gap: 7 },
  hdrId: { fontFamily: "BarlowCondensed_700Bold", fontSize: 20, color: colors.ink900 },
  cabFila: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cabIconoBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.ink300, backgroundColor: colors.paper0 },
  cabVehiculo: { flexDirection: "row", alignItems: "center", gap: 12 },
  cabAvatar: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  cabMarca: { fontFamily: "Inter_700Bold", fontSize: 18, color: colors.ink900 },
  cabPlacas: { borderWidth: 1.5, borderColor: colors.ink700, borderRadius: 6, paddingVertical: 1, paddingHorizontal: 8, backgroundColor: colors.paper0 },
  cabPlacasTexto: { fontFamily: "Inter_700Bold", fontSize: 12.5, letterSpacing: 1, color: colors.ink900 },
  cabMeta: { fontSize: 12.5, color: colors.ink500, flexShrink: 1 },
  cabCliente: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  cabClienteTexto: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.ink900 },
  cabLlamar: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 100, backgroundColor: colors.petrol100 },
  cabLlamarTexto: { fontSize: 12.5, fontWeight: "700", color: colors.petrol600 },
  cabKpis: { flexDirection: "row", gap: 8, marginTop: 10 },
  cabKpi: { flex: 1, borderRadius: 12, backgroundColor: colors.paper0, paddingVertical: 7, paddingHorizontal: 10 },
  cabKpiEtq: { fontSize: 10.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.5 },
  cabKpiVal: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.ink900, marginTop: 1 },
  cabeceraFila: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cabeceraServicio: { fontSize: 14, fontWeight: "600", color: colors.ink900, marginTop: 2 },
  cabeceraMeta: { fontSize: 12.5, color: colors.ink500, marginTop: 1 },
  cabeceraFechas: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  fechaChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 100, borderWidth: 1, borderColor: colors.ink300, backgroundColor: colors.paper0 },
  previaChip: { borderColor: colors.petrol500 },
  fechaChipTexto: { fontSize: 13, fontWeight: "700", color: colors.ink700 },
  datoInput: { flex: 1, textAlign: "right", fontSize: 15, fontWeight: "600", color: colors.ink900, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: colors.ink300, marginLeft: 12 },
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
  seccionFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 6 },
  seccion: { fontSize: 12.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  vacioNuevo: { alignItems: "center", paddingTop: 18, paddingBottom: 8 },
  vacioHalo: { width: 96, height: 96, borderRadius: 48, backgroundColor: "rgba(14,116,144,0.14)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  vacioDisco: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#0e7490", alignItems: "center", justifyContent: "center" },
  vacioDiscoMini: { position: "absolute", right: 4, bottom: 6, width: 32, height: 32, borderRadius: 16, backgroundColor: "#0a5266", borderWidth: 2, borderColor: colors.paper0, alignItems: "center", justifyContent: "center" },
  vacioNuevoTitulo: { fontFamily: "Inter_700Bold", fontSize: 18, color: colors.ink900 },
  vacioNuevoTexto: { fontSize: 13, color: colors.ink500, marginTop: 2 },
  vacioOpciones: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 16 },
  vacioOpcion: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 16, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1.5 },
  vacioOpcionTitulo: { fontSize: 14.5, fontWeight: "800", marginTop: 4 },
  vacioOpcionSub: { fontSize: 11.5, color: colors.ink500 },
  vacioGrande: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 8, gap: 6 },
  vacioIcono: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  vacioTitulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 22, color: colors.ink900 },
  vacioTexto: { fontSize: 14, color: colors.ink500, textAlign: "center", lineHeight: 20 },
  accesos: { gap: 8, marginBottom: 14 },
  accesoFila: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 14, padding: 12 },
  accesoIcono: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.petrol500, alignItems: "center", justifyContent: "center", shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  accesoInsignia: { position: "absolute", right: -5, bottom: -5, width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.paper100 },
  accesoTitulo: { fontSize: 15, fontWeight: "700", color: colors.ink900 },
  accesoSub: { fontSize: 12, color: colors.ink500, marginTop: 1 },
  acceso: { flex: 1, alignItems: "center", gap: 6, backgroundColor: colors.paper100, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 8 },
  accesoTexto: { fontSize: 13, fontWeight: "600", color: colors.ink900, textAlign: "center" },
  barra: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 16, backgroundColor: colors.paper100,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    elevation: 14, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: -4 },
  },
  barraAgregar: { flexDirection: "row", alignItems: "center", gap: 8, height: 54, paddingLeft: 7, paddingRight: 18, borderRadius: 27, borderWidth: 1.5 },
  barraMas: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  barraAgregarTexto: { fontSize: 14.5, fontWeight: "800", letterSpacing: 0.3 },
  contadorTexto: { fontSize: 16, fontWeight: "700", color: colors.ink900, minWidth: 20, textAlign: "center" },
});
