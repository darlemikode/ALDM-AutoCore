import ScrollCampos from "../ui/ScrollCampos";
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Switch, Platform, LayoutAnimation, UIManager } from "react-native";
import Calendario from "../ui/Calendario";
import { Picker } from "../ui/Picker";
import { Swipeable } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "../ui/IconoWeb";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api, getToken, API_URL } from "../api";
import { MODO_LOCAL } from "../localMode";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import HojaAgregarConceptos from "../components/HojaAgregarConceptos";
import { alerta } from "../ui/Dialogo";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Detalle de cotización — misma función que web-admin/src/pages/CotizacionDetalle.jsx
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);

const redondea = (v) => Math.round(v * 100) / 100;
const esManoObra = (d) => (Number(d.costo_mano_obra) || 0) > 0 && !d.id_refaccion && !((Number(d.costo_refaccion) || 0) > 0);
const precioRef = (r) => Number(r?.preciocliente_refaccion) || Number(r?.preciopropio_refaccion) || 0;

// Campo numérico que guarda al terminar de editar
function NumeroEditable({ valor, onGuardar, editable, pendienteRef }) {
  const [texto, setTexto] = useState(String(valor ?? 0));
  useEffect(() => { setTexto(String(valor ?? 0)); }, [valor]);
  function confirmar() {
    if (pendienteRef) pendienteRef.current = null;
    const n = Number(String(texto).replace(",", "."));
    if (Number.isNaN(n)) { setTexto(String(valor ?? 0)); return; }
    if (n !== Number(valor)) onGuardar(n);
  }
  return (
    <TextInput placeholderTextColor={colors.ink500} style={[styles.numInput, !editable && { opacity: 0.55 }]} value={texto}
      onChangeText={(v) => { setTexto(v); if (pendienteRef) pendienteRef.current = v; }}
      keyboardType="decimal-pad" editable={editable} selectTextOnFocus returnKeyType="done" onBlur={confirmar} onSubmitEditing={confirmar} />
  );
}

// Concepto con la misma interacción que en la orden: toque = abrir/cerrar controles, deslizar = quitar
function TarjetaConcepto({ d, mo, editable, categoria, actualizar, quitar }) {
  const [abierta, setAbierta] = useState(false);
  const swipe = useRef(null);
  const pendUnit = useRef(null);
  const pendMO = useRef(null);
  const cant = d.cantidad || 1;
  const importe = (Number(d.costo_mano_obra) || 0) + (Number(d.costo_refaccion) || 0) + (Number(d.costo_extra) || 0);
  const unitario = redondea((Number(mo ? d.costo_mano_obra : d.costo_refaccion) || 0) / cant);
  const idD = d.id_cotizacion_detalle;

  const numPend = (ref, actual) => {
    if (ref.current == null) return null;
    const n = Number(String(ref.current).replace(",", "."));
    return Number.isNaN(n) || n === actual ? null : n;
  };
  function alternar() {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setAbierta((v) => !v);
  }
  function cambiarCantidad(delta) {
    const n = cant + delta;
    if (n < 1) return;
    const pu = numPend(pendUnit, unitario);
    const pm = mo ? null : numPend(pendMO, Number(d.costo_mano_obra) || 0);
    const cambios = { cantidad: n };
    if (pu != null) cambios[mo ? "costo_mano_obra" : "costo_refaccion"] = redondea(pu * n);
    if (pm != null) cambios.costo_mano_obra = pm;
    pendUnit.current = null; pendMO.current = null;
    actualizar(idD, cambios);
  }
  function guardarUnitario(v) {
    if (mo && !(v > 0)) { alerta("Precio inválido", "El precio debe ser mayor a cero. Para quitarla desliza la tarjeta a la izquierda."); return; }
    actualizar(idD, { [mo ? "costo_mano_obra" : "costo_refaccion"]: redondea(v * cant) });
  }

  const contenido = (
    <View style={styles.nuiCard}>
      <TouchableOpacity activeOpacity={0.8} onPress={alternar} style={styles.nuiFila}>
        <View style={[styles.nuiIcono, mo && { backgroundColor: colors.warn100 }]}>
          <Ionicons name={mo ? "hammer-outline" : "cube-outline"} size={18} color={mo ? colors.warn600 : colors.petrol600} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nuiTitulo} numberOfLines={abierta ? 3 : 1}>{d.descripcion || (mo ? "Mano de obra" : "Concepto")}</Text>
          {[categoria, cant > 1 ? `${cant} × ${fmt(unitario)}` : null].filter(Boolean).length ? <Text style={styles.nuiSub} numberOfLines={1}>{[categoria, cant > 1 ? `${cant} × ${fmt(unitario)}` : null].filter(Boolean).join(" · ")}</Text> : null}
        </View>
        {cant > 1 && <View style={styles.nuiCant}><Text style={styles.nuiCantTexto}>{cant}</Text><Text style={styles.nuiCantPzas}>pzas</Text></View>}
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
            <View style={{ flex: 1 }}>
              <Text style={styles.nuiEtiqueta} numberOfLines={1}>Precio unitario</Text>
              <NumeroEditable key={`u${mo ? d.costo_mano_obra : d.costo_refaccion}-${cant}`} valor={unitario} editable={editable} onGuardar={guardarUnitario} pendienteRef={pendUnit} />
            </View>
            {!mo && (!d.id_refaccion || Number(d.costo_mano_obra) > 0) && (
              <View style={{ flex: 1 }}>
                <Text style={styles.nuiEtiqueta} numberOfLines={1}>Mano de obra</Text>
                <NumeroEditable key={`m${d.costo_mano_obra}`} valor={d.costo_mano_obra || 0} editable={editable} onGuardar={(v) => actualizar(idD, { costo_mano_obra: v })} pendienteRef={pendMO} />
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
    <Swipeable ref={swipe} overshootRight={false} rightThreshold={60} friction={1.6}
      renderRightActions={() => (
        <View style={styles.nuiQuitar}>
          <Ionicons name="trash-outline" size={22} color="#ffffff" />
          <Text style={styles.nuiQuitarTexto}>Quitar</Text>
        </View>
      )}
      onSwipeableOpen={() => { swipe.current?.close(); quitar(idD); }}>
      {contenido}
    </Swipeable>
  );
}

export default function CotizacionDetalleScreen({ route }) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const puedeEditar = hasPermission("cotizaciones.editar");
  const [c, setC] = useState(null);
  const [refacciones, setRefacciones] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [comentarios, setComentarios] = useState("");
  const [comentariosGuardados, setComentariosGuardados] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [editandoCV, setEditandoCV] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [calendario, setCalendario] = useState(null); // "fecha_cotizacion" | "vigente_hasta"

  async function load() {
    const x = await api.get(`/cotizaciones/${id}`);
    setC(x);
    setTitulo(x.titulo || "");
    setComentarios(x.comentarios || "");
    setComentariosGuardados(x.comentarios || "");
  }
  useFocusEffect(useCallback(() => {
    load().catch((e) => alerta("Error", e.message));
    api.get("/refacciones/").then(setRefacciones).catch(() => {});
    api.get("/tipos-servicio/").then(setTipos).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]));

  const accion = async (fn) => { try { setC(await fn()); } catch (e) { alerta("Error", e.message); load(); } };
  const actualizarDetalle = (idD, cambios) => accion(() => api.put(`/cotizaciones/${id}/detalles/${idD}`, cambios));
  const quitar = (idD) => accion(() => api.del(`/cotizaciones/${id}/detalles/${idD}`));

  // Comentarios: se guardan solos 1 segundo después de dejar de escribir
  useEffect(() => {
    if (!c || !puedeEditar || comentarios === comentariosGuardados) return undefined;
    const t = setTimeout(async () => {
      try { await api.put(`/cotizaciones/${id}`, { comentarios: comentarios.trim() || null }); setComentariosGuardados(comentarios); } catch (e) { /* se reintenta al seguir escribiendo */ }
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comentarios]);

  async function agregarCatalogo(items) {
    for (const it of items) {
      await api.post(`/cotizaciones/${id}/detalles`, {
        id_refaccion: it.refaccion.id_refaccion, descripcion: it.refaccion.nombre_refaccion,
        cantidad: it.cantidad, costo_refaccion: (Number(it.precio) || 0) * it.cantidad, costo_extra: 0,
      });
    }
    setAgregando(false);
    await load();
  }
  async function agregarLibre(concepto) {
    setC(await api.post(`/cotizaciones/${id}/detalles`, concepto));
    setAgregando(false);
  }
  async function aplicarPaquete(paq) {
    const faltantes = [];
    for (const cc of paq.conceptos) {
      const cant = cc.cantidad || 1;
      const mo = (Number(cc.costo_mano_obra) || 0) * cant;
      if (cc.id_refaccion) {
        const ref = refacciones.find((r) => r.id_refaccion === cc.id_refaccion);
        if (!ref) { faltantes.push(cc.descripcion || "Refacción"); continue; }
        await api.post(`/cotizaciones/${id}/detalles`, { id_refaccion: cc.id_refaccion, descripcion: ref.nombre_refaccion, cantidad: cant, costo_refaccion: precioRef(ref) * cant, costo_mano_obra: mo, costo_extra: 0 });
      } else {
        await api.post(`/cotizaciones/${id}/detalles`, { id_refaccion: null, descripcion: cc.descripcion || "Mano de obra", cantidad: cant, costo_mano_obra: mo, costo_refaccion: (Number(cc.costo_refaccion) || 0) * cant, costo_extra: 0 });
      }
    }
    setAgregando(false);
    await load();
    alerta("Paquete agregado", faltantes.length ? `Se agregó «${paq.nombre}», pero ya no existen en el catálogo: ${faltantes.join(", ")}.` : `«${paq.nombre}» quedó en la cotización.`);
  }

  async function abrirEditorCV() {
    const abrir = !editandoCV;
    setEditandoCV(abrir);
    if (!abrir) return;
    try {
      if (!clientes.length) setClientes((await api.get("/clientes/")) || []);
      if (c?.id_cliente) setVehiculos((await api.get(`/vehiculos/?id_cliente=${c.id_cliente}`)) || []);
    } catch (e) { /* se puede reintentar */ }
  }
  async function elegirCliente(v) {
    const idc = v ? Number(v) : null;
    await accion(() => api.put(`/cotizaciones/${id}`, { id_cliente: idc, id_vehiculo: null }));
    setVehiculos(idc ? ((await api.get(`/vehiculos/?id_cliente=${idc}`).catch(() => [])) || []) : []);
  }
  const elegirVehiculo = (v) => accion(() => api.put(`/cotizaciones/${id}`, { id_vehiculo: v ? Number(v) : null }));
  const nombreVeh = (v) => [v?.marca?.nombre_marca, v?.modelo?.nombre_modelo].filter(Boolean).join(" ") || "Vehículo";

  const guardarTitulo = () => {
    const nuevo = titulo.trim();
    if (!nuevo) { setTitulo(c?.titulo || ""); return; }
    if (nuevo !== c?.titulo) accion(() => api.put(`/cotizaciones/${id}`, { titulo: nuevo }));
  };
  const cambiarFecha = (campo, v) => {
    setCalendario(null);
    accion(() => api.put(`/cotizaciones/${id}`, { [campo]: v ? `${String(v).slice(0, 10)}T12:00:00` : null }));
  };
  const fechaTxt = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) : "Sin fecha");

  async function pdf() {
    if (MODO_LOCAL) { alerta("Disponible con servidor", "El PDF de la cotización se genera en el servidor."); return; }
    setDescargando(true);
    try {
      const token = await getToken();
      const ruta = `${API_URL}/cotizaciones/${id}/pdf`;
      if (Platform.OS === "web") {
        const res = await fetch(ruta, { headers: { Authorization: `Bearer ${token}` } });
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a"); a.href = url; a.download = `cotizacion-${id}.pdf`; a.click();
        return;
      }
      const r = await FileSystem.downloadAsync(ruta, `${FileSystem.cacheDirectory}cotizacion-${id}.pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status !== 200) throw new Error("No se pudo generar el PDF.");
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(r.uri, { mimeType: "application/pdf", dialogTitle: "Enviar cotización por WhatsApp", UTI: "com.adobe.pdf" });
    } catch (e) { alerta("Error", e.message); } finally { setDescargando(false); }
  }

  if (!c) return <Text style={styles.cargando}>Cargando cotización…</Text>;
  const detalles = c.detalles || [];
  const manoObra = detalles.filter((d) => esManoObra(d));
  const refs = detalles.filter((d) => !esManoObra(d));
  const catDe = (d) => refacciones.find((r) => r.id_refaccion === d.id_refaccion)?.categoria;

  return (
    <View style={styles.screen}>
      <View style={styles.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={styles.numero}>COTIZACIÓN #{c.id_cotizacion}</Text>
          <TextInput style={styles.tituloInput} value={titulo} onChangeText={setTitulo} onBlur={guardarTitulo} onSubmitEditing={guardarTitulo} editable={puedeEditar} placeholder="Nombre de la cotización" placeholderTextColor={colors.ink500} maxLength={120} returnKeyType="done" />
          <Text style={styles.meta}>
            {new Date(c.fecha_cotizacion).toLocaleDateString("es-MX")}{c.vigente_hasta ? ` · vigente al ${String(c.vigente_hasta).slice(0, 10)}` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.totalEtiqueta}>Total</Text>
          <Text style={styles.total}>{fmt(c.costos?.total)}</Text>
          <Text style={styles.meta}>IVA {fmt(c.costos?.iva)}</Text>
        </View>
      </View>

      <ScrollCampos contentContainerStyle={{ padding: spacing.lg, paddingBottom: 130 }}>
        <View style={styles.cvCard}>
          <TouchableOpacity style={styles.cvFila} onPress={puedeEditar ? abrirEditorCV : undefined} activeOpacity={0.8}>
            <View style={styles.cvIcono}><Ionicons name="person-outline" size={17} color={colors.petrol600} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cvEtq}>Cliente</Text>
              <Text style={styles.cvTexto} numberOfLines={1}>
                {c.cliente ? `${c.cliente.nombre_cliente || ""} ${c.cliente.paterno_cliente || ""}`.trim() : "Sin cliente"}{c.cliente?.telefono1 ? `  ·  ${c.cliente.telefono1}` : ""}
              </Text>
            </View>
            {puedeEditar && <Ionicons name={editandoCV ? "chevron-up-outline" : "create-outline"} size={18} color={colors.ink500} />}
          </TouchableOpacity>
          <View style={styles.cvSep} />
          <TouchableOpacity style={styles.cvFila} onPress={puedeEditar ? abrirEditorCV : undefined} activeOpacity={0.8}>
            <View style={styles.cvIcono}><Ionicons name="car-outline" size={17} color={colors.petrol600} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cvEtq}>Vehículo</Text>
              <Text style={styles.cvTexto} numberOfLines={1}>
                {c.vehiculo ? `${nombreVeh(c.vehiculo)}${c.vehiculo.placas_vehiculo ? `  ·  ${c.vehiculo.placas_vehiculo}` : ""}` : "Sin vehículo"}
              </Text>
            </View>
          </TouchableOpacity>
          {editandoCV && puedeEditar && (
            <View style={styles.cvEditor}>
              <Text style={styles.cvEtq}>Cambiar cliente</Text>
              <View style={styles.cvPicker}>
                <Picker titulo="Cliente" selectedValue={c.id_cliente ?? ""} onValueChange={elegirCliente}>
                  <Picker.Item label="Sin cliente" value="" />
                  {clientes.map((x) => <Picker.Item key={x.id_cliente} label={`${x.nombre_cliente || ""} ${x.paterno_cliente || ""}`.trim() || `Cliente #${x.id_cliente}`} value={x.id_cliente} />)}
                </Picker>
              </View>
              <Text style={[styles.cvEtq, { marginTop: 10 }]}>Cambiar vehículo</Text>
              <View style={[styles.cvPicker, !c.id_cliente && { opacity: 0.5 }]}>
                <Picker titulo="Vehículo" enabled={!!c.id_cliente} selectedValue={c.id_vehiculo ?? ""} onValueChange={elegirVehiculo}>
                  <Picker.Item label={c.id_cliente ? "Sin vehículo" : "Elige primero un cliente"} value="" />
                  {vehiculos.map((v) => <Picker.Item key={v.id_vehiculo} label={`${nombreVeh(v)}${v.placas_vehiculo ? ` · ${v.placas_vehiculo}` : ""}`} value={v.id_vehiculo} />)}
                </Picker>
              </View>
            </View>
          )}
        </View>

        {detalles.length === 0 ? (
          <View style={styles.vacio}>
            <Ionicons name="document-text-outline" size={34} color={colors.petrol600} />
            <Text style={styles.vacioTitulo}>Cotización vacía</Text>
            <Text style={styles.meta}>Agrega refacciones, paquetes o mano de obra con el botón de abajo.</Text>
          </View>
        ) : null}

        {manoObra.length > 0 && (
          <>
            <View style={styles.seccion}>
              <Ionicons name="hammer-outline" size={16} color={colors.warn600} />
              <Text style={styles.seccionTitulo}>Mano de obra</Text>
              <Text style={styles.seccionCuenta}>{manoObra.length}</Text>
            </View>
            {manoObra.map((d) => (
              <TarjetaConcepto key={d.id_cotizacion_detalle} d={d} mo editable={puedeEditar} actualizar={actualizarDetalle} quitar={quitar} />
            ))}
          </>
        )}

        {refs.length > 0 && (
          <>
            <View style={[styles.seccion, manoObra.length > 0 && { marginTop: 14 }]}>
              <Ionicons name="cube-outline" size={16} color={colors.petrol600} />
              <Text style={styles.seccionTitulo}>Refacciones</Text>
              <Text style={styles.seccionCuenta}>{refs.length}</Text>
            </View>
            {refs.map((d) => (
              <TarjetaConcepto key={d.id_cotizacion_detalle} d={d} categoria={catDe(d)} editable={puedeEditar} actualizar={actualizarDetalle} quitar={quitar} />
            ))}
          </>
        )}

        <View style={styles.bloque}>
          {[["fecha_cotizacion", "Fecha de servicio", c.fecha_cotizacion], ["vigente_hasta", "Vigente hasta", c.vigente_hasta]].map(([campo, etq, val]) => (
            <TouchableOpacity key={campo} style={styles.fechaFila} disabled={!puedeEditar} onPress={() => setCalendario(campo)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nuiEtiqueta}>{etq}</Text>
                <Text style={styles.fechaTexto}>{fechaTxt(val)}</Text>
              </View>
              {puedeEditar && campo === "vigente_hasta" && val ? (
                <TouchableOpacity onPress={() => cambiarFecha("vigente_hasta", null)} hitSlop={8} style={{ marginRight: 10 }}><Ionicons name="close-circle-outline" size={20} color={colors.ink500} /></TouchableOpacity>
              ) : null}
              {puedeEditar && <Ionicons name="calendar-outline" size={20} color={colors.petrol500} />}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.resumen}>
          <View style={styles.resumenFila}><Text style={styles.resumenEtq}>Subtotal</Text><Text style={styles.resumenVal}>{fmt(c.costos?.subtotal)}</Text></View>
          <View style={styles.resumenFila}>
            <Text style={styles.resumenEtq}>Aplicar IVA (16%)</Text>
            <Switch value={(c.iva_porcentaje ?? 16) > 0} disabled={!puedeEditar} onValueChange={(v) => accion(() => api.put(`/cotizaciones/${id}`, { iva_porcentaje: v ? 16 : 0 }))} trackColor={{ true: colors.petrol500 }} />
          </View>
          <View style={styles.resumenFila}><Text style={styles.resumenEtq}>IVA</Text><Text style={styles.resumenVal}>{fmt(c.costos?.iva)}</Text></View>
          <View style={[styles.resumenFila, styles.resumenTotalFila]}><Text style={styles.resumenTotalEtq}>Total</Text><Text style={styles.resumenTotal}>{fmt(c.costos?.total)}</Text></View>
        </View>

        <View style={styles.bloque}>
          <Text style={styles.label}>Comentarios</Text>
          <TextInput style={styles.textarea} value={comentarios} onChangeText={setComentarios} multiline editable={puedeEditar} placeholder="Condiciones, tiempos de entrega…" placeholderTextColor={colors.ink500} />
          <Text style={[styles.meta, { marginTop: 6, minHeight: 18 }]}>
            {comentarios !== comentariosGuardados ? "Guardando…" : comentarios ? "Guardado automáticamente" : ""}
          </Text>
        </View>
      </ScrollCampos>

      <View style={styles.barra}>
        {puedeEditar && (
          <TouchableOpacity style={styles.btnSecundario} onPress={() => setAgregando(true)} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={19} color={colors.petrol500} /><Text style={styles.btnSecundarioTexto}>Agregar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.btnWhats, (detalles.length === 0 || descargando) && { opacity: 0.5 }]} onPress={pdf} disabled={detalles.length === 0 || descargando} activeOpacity={0.85}>
          <Ionicons name="logo-whatsapp" size={20} color="#fff" /><Text style={styles.btnPrimarioTexto}>{descargando ? "Generando PDF…" : "Enviar por WhatsApp"}</Text>
        </TouchableOpacity>
      </View>

      <Calendario
        visible={!!calendario}
        valor={calendario && c[calendario] ? String(c[calendario]).slice(0, 10) : ""}
        titulo={calendario === "vigente_hasta" ? "Vigente hasta" : "Fecha de servicio"}
        onElegir={(v) => cambiarFecha(calendario, v)}
        onCerrar={() => setCalendario(null)}
      />

      <HojaAgregarConceptos
        visible={agregando}
        titulo={`Agregar a la cotización #${c.id_cotizacion}`}
        refacciones={refacciones}
        tipos={tipos}
        onAgregarCatalogo={agregarCatalogo}
        onAgregarLibre={agregarLibre}
        onAplicarPaquete={aplicarPaquete}
        onCerrar={() => setAgregando(false)}
      />
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cargando: { padding: spacing.lg, color: colors.ink500, fontSize: 14 },
  cabecera: { flexDirection: "row", gap: 12, padding: spacing.lg, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  numero: { fontSize: 11, fontWeight: "700", color: colors.petrol600, letterSpacing: 0.6 },
  titulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 22, color: colors.ink900 },
  tituloInput: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 22, color: colors.ink900, padding: 0, borderBottomWidth: 1, borderBottomColor: colors.ink300, borderStyle: "dashed" },
  fechaFila: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  fechaTexto: { fontSize: 15, fontWeight: "600", color: colors.ink900, marginTop: 2 },
  btnIcono: { width: 52, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.petrol500, backgroundColor: colors.paper100 },
  btnWhats: { flex: 1.5, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#25D366", borderRadius: 12, height: 48 },
  cvCard: { backgroundColor: colors.paper100, borderRadius: 14, borderWidth: 1, borderColor: colors.ink300, paddingHorizontal: 12, marginBottom: 14 },
  cvFila: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  cvIcono: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  cvEtq: { fontSize: 10.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.5 },
  cvTexto: { fontSize: 14.5, fontWeight: "600", color: colors.ink900, marginTop: 1 },
  cvSep: { height: 1, backgroundColor: colors.ink300, marginLeft: 42 },
  cvEditor: { borderTopWidth: 1, borderTopColor: colors.ink300, paddingVertical: 12 },
  cvPicker: { backgroundColor: colors.paper0, borderRadius: 10, borderWidth: 1, borderColor: colors.ink300, marginTop: 6 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  totalEtiqueta: { fontSize: 10.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase" },
  total: { fontFamily: "BarlowCondensed_700Bold", fontSize: 26, color: colors.petrol500 },
  vacio: { alignItems: "center", gap: 6, paddingVertical: 30 },
  vacioTitulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 21, color: colors.ink900 },
  seccion: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  seccionTitulo: { fontFamily: "Inter_700Bold", fontSize: 12, color: colors.ink700, textTransform: "uppercase", letterSpacing: 0.7 },
  seccionCuenta: { fontSize: 11.5, fontWeight: "800", color: colors.ink500, backgroundColor: colors.paper100, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 1, overflow: "hidden" },
  resumen: { backgroundColor: colors.paper100, borderRadius: 14, borderWidth: 1, borderColor: colors.ink300, padding: 14, marginTop: 14, gap: 8 },
  resumenFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resumenEtq: { fontSize: 14, color: colors.ink700 },
  resumenVal: { fontSize: 14.5, fontWeight: "700", color: colors.ink900 },
  resumenTotalFila: { borderTopWidth: 1, borderTopColor: colors.ink300, paddingTop: 10, marginTop: 2 },
  resumenTotalEtq: { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.ink900 },
  resumenTotal: { fontFamily: "BarlowCondensed_700Bold", fontSize: 26, color: colors.petrol500 },
  bloque: { backgroundColor: colors.paper100, borderRadius: 14, borderWidth: 1, borderColor: colors.ink300, padding: 14, marginTop: 14 },
  label: { fontSize: 12, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 },
  textarea: { borderWidth: 1.5, borderColor: colors.petrol300, borderRadius: 10, backgroundColor: colors.paper100, padding: 12, fontSize: 14, minHeight: 70, textAlignVertical: "top", color: colors.ink900 },
  numInput: { borderWidth: 1, borderColor: colors.petrol300, borderRadius: 7, paddingVertical: 3, paddingHorizontal: 8, fontSize: 13.5, color: colors.ink900, backgroundColor: colors.paper100, alignSelf: "stretch" },
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
  nuiEtiqueta: { fontSize: 10.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.4 },
  nuiPista: { fontSize: 11, color: colors.ink500, marginTop: 10, textAlign: "center" },
  nuiQuitar: { width: 92, marginBottom: 8, marginLeft: 8, borderRadius: 14, backgroundColor: colors.red600, alignItems: "center", justifyContent: "center", gap: 2 },
  nuiQuitarTexto: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  barra: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 14,
    backgroundColor: colors.paper100, borderTopWidth: 1, borderTopColor: colors.ink300, elevation: 8, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: -3 },
  },
  btnPrimario: { flex: 1.5, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.petrol500, borderRadius: 12, height: 48 },
  btnPrimarioTexto: { fontSize: 15, fontWeight: "600", color: colors.sobreAcento },
  btnSecundario: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper100, borderWidth: 1.5, borderColor: colors.petrol500, borderRadius: 12, height: 48 },
  btnSecundarioTexto: { fontSize: 15, fontWeight: "700", color: colors.petrol500 },
});
