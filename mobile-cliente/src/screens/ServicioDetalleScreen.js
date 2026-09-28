import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import { api, getToken, API_URL, WS_URL, urlArchivo, archivoParaForm } from "../api";
import { colors } from "../theme";
import { crearEstilos } from "../ui/estilos";
import InspeccionView from "../components/InspeccionView";
import { ETAPAS } from "./MisServiciosScreen";
import { alerta } from "../ui/Dialogo";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (f) => (f ? new Date(f).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const hora = (f) => (f ? new Date(f).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "");
const ETIQUETA = Object.fromEntries(ETAPAS);
const PAGO = { efectivo: "Efectivo", tarjeta: "Tarjeta", mixto: "Mixto", transferencia: "Transferencia" };
const PESTANAS = [
  ["seguimiento", "Seguimiento", "pulse-outline"],
  ["costos", "Costos", "receipt-outline"],
  ["inspeccion", "Inspección", "clipboard-outline"],
  ["chat", "Chat", "chatbubbles-outline"],
];

export default function ServicioDetalleScreen({ route, navigation }) {
  const { id } = route.params;
  const [servicio, setServicio] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [pestana, setPestana] = useState(route.params?.pestana || "seguimiento");
  const [texto, setTexto] = useState("");
  const [conectado, setConectado] = useState(false);
  const [sinLeer, setSinLeer] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const listaRef = useRef(null);
  const pestanaRef = useRef(pestana);
  pestanaRef.current = pestana;

  const agregarMensaje = useCallback((m) => {
    setMensajes((prev) => (m.id_mensaje && prev.some((x) => x.id_mensaje === m.id_mensaje) ? prev : [...prev, m]));
    setTimeout(() => listaRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  async function cargarTodo() {
    const [s, chat] = await Promise.all([
      api.get(`/portal-cliente/mis-servicios/${id}`),
      api.get(`/portal-cliente/mis-servicios/${id}/chat`).catch(() => []),
    ]);
    setServicio(s);
    setMensajes(chat || []);
    navigation.setOptions({ title: s.vehiculo?.placas_vehiculo || "Mi servicio" });
  }

  useFocusEffect(useCallback(() => { cargarTodo().catch((e) => alerta("Error", e.message)); }, [id])); // eslint-disable-line react-hooks/exhaustive-deps

  // WebSocket: mensajes y cambios de etapa en vivo
  useEffect(() => {
    let activo = true;
    let socket;
    (async () => {
      const token = await getToken();
      socket = new WebSocket(`${WS_URL}/api/ws/servicio/${id}?token=${token}`);
      socket.onopen = () => activo && setConectado(true);
      socket.onclose = () => activo && setConectado(false);
      socket.onerror = () => activo && setConectado(false);
      socket.onmessage = (event) => {
        if (!activo) return;
        try {
          const data = JSON.parse(event.data);
          if (data.tipo === "chat") {
            agregarMensaje({
              id_mensaje: data.id_mensaje, autor_tipo: data.autor_tipo, autor_nombre: data.autor_nombre,
              tipo: data.mensaje_tipo, texto: data.texto, ruta_foto: data.ruta_foto, fecha: data.fecha,
            });
            if (data.autor_tipo !== "cliente" && pestanaRef.current !== "chat") setSinLeer((n) => n + 1);
          } else if (data.tipo === "etapa") {
            setServicio((prev) => prev && ({
              ...prev, etapa: data.etapa,
              historial_etapas: [...(prev.historial_etapas || []), { id_registro: `ws${Date.now()}`, etapa: data.etapa, comentario: data.comentario, fecha: data.fecha || new Date().toISOString(), actualizado_por: data.actualizado_por }],
            }));
          }
        } catch {
          // mensaje no reconocido
        }
      };
    })();
    return () => { activo = false; socket?.close(); };
  }, [id, agregarMensaje]);

  function cambiarPestana(p) {
    setPestana(p);
    if (p === "chat") {
      setSinLeer(0);
      setTimeout(() => listaRef.current?.scrollToEnd({ animated: false }), 150);
    }
  }

  async function enviarMensaje(tipo = "mensaje") {
    const contenido = tipo === "alerta" ? "🚨 Necesito hablar con el taller sobre mi servicio." : texto.trim();
    if (!contenido) return;
    setEnviando(true);
    try {
      const nuevo = await api.post(`/portal-cliente/mis-servicios/${id}/chat`, { texto: contenido, tipo });
      if (nuevo) agregarMensaje(nuevo);
      if (tipo === "mensaje") setTexto("");
      if (tipo === "alerta") alerta("Aviso enviado", "El taller ya recibió tu aviso y te contactará.");
    } catch (err) {
      alerta("No se pudo enviar", err.message);
    } finally {
      setEnviando(false);
    }
  }

  function confirmarAlerta() {
    alerta("Avisar al mecánico", "Se le notificará de inmediato que necesitas hablar sobre tu servicio. ¿Continuar?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí, avisar", onPress: () => enviarMensaje("alerta") },
    ]);
  }

  async function enviarFoto(origen) {
    const permiso = origen === "camara" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      alerta("Falta permiso", origen === "camara" ? "Activa el permiso de cámara." : "Activa el permiso de fotos.");
      return;
    }
    const r = origen === "camara" ? await ImagePicker.launchCameraAsync({ quality: 0.6 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (r.canceled) return;
    const a = r.assets[0];
    const fd = new FormData();
    fd.append("archivo", await archivoParaForm(a.uri), a.fileName || `foto_${Date.now()}.jpg`);
    const pie = texto.trim();
    if (pie) fd.append("texto", pie);
    setEnviando(true);
    try {
      const nuevo = await api.postForm(`/portal-cliente/mis-servicios/${id}/chat/foto`, fd);
      if (nuevo) agregarMensaje(nuevo);
      if (pie) setTexto("");
    } catch (err) {
      alerta("No se pudo enviar la foto", err.message);
    } finally {
      setEnviando(false);
    }
  }

  function elegirFoto() {
    alerta("Enviar foto", "¿De dónde la tomamos?", [
      { text: "Cámara", onPress: () => enviarFoto("camara") },
      { text: "Galería", onPress: () => enviarFoto("galeria") },
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  async function descargarNotaRemision() {
    setDescargando(true);
    try {
      const ruta = `${API_URL}/portal-cliente/mis-servicios/${id}/nota-remision`;
      const token = await getToken();
      if (Platform.OS === "web") {
        const res = await fetch(ruta, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("No se pudo generar el documento.");
        const url = URL.createObjectURL(await res.blob());
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = `nota-remision-${id}.pdf`;
        enlace.click();
        URL.revokeObjectURL(url);
        return;
      }
      const destino = `${FileSystem.cacheDirectory}nota-remision-${id}.pdf`;
      const res = await FileSystem.downloadAsync(ruta, destino, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status !== 200) throw new Error("No se pudo generar el documento.");
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri, { mimeType: "application/pdf" });
      else alerta("Listo", `Se guardó en: ${res.uri}`);
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setDescargando(false);
    }
  }

  if (!servicio) return <View style={styles.cargando}><ActivityIndicator color={colors.petrol500} /></View>;

  const abierta = servicio.status === "abierto";
  const idx = Math.max(0, ETAPAS.findIndex(([k]) => k === servicio.etapa));
  const lista = servicio.etapa === "listo_entrega";
  const acento = !abierta ? colors.teal600 : lista ? colors.teal600 : colors.petrol500;
  const c = servicio.costos || {};
  const v = servicio.vehiculo || {};
  const refrescar = async () => { setRefrescando(true); await cargarTodo().catch(() => {}); setRefrescando(false); };

  const Encabezado = (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroVehiculo} numberOfLines={1}>{[v.marca?.nombre_marca, v.modelo?.nombre_modelo, v.id_year_vehiculo].filter(Boolean).join(" ") || "Tu vehículo"}</Text>
          <Text style={styles.meta} numberOfLines={1}>{servicio.nombre_servicio} · Orden #{servicio.id_servicio}</Text>
        </View>
        <View style={[styles.vivo, conectado && styles.vivoActivo]}>
          <View style={[styles.punto, { backgroundColor: conectado ? colors.teal600 : colors.ink300 }]} />
          <Text style={[styles.vivoTexto, conectado && { color: colors.teal600 }]}>{conectado ? "En vivo" : "…"}</Text>
        </View>
      </View>
      <Text style={[styles.heroEtapa, { color: acento }]}>{abierta ? ETIQUETA[servicio.etapa] || servicio.etapa : servicio.status === "cerrado" ? "Entregado" : "Cancelado"}</Text>
      {abierta ? (
        <View style={styles.barra}>{ETAPAS.map(([k], i) => <View key={k} style={[styles.tramo, i <= idx && { backgroundColor: acento }]} />)}</View>
      ) : null}
      <View style={styles.heroCifras}>
        <View style={{ flex: 1 }}><Text style={styles.cifraEtiqueta}>Total</Text><Text style={styles.cifra}>{fmt(c.total)}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cifraEtiqueta}>{c.saldo_pendiente > 0.005 ? "Saldo pendiente" : "Pagado"}</Text>
          <Text style={[styles.cifra, { color: c.saldo_pendiente > 0.005 ? colors.red600 : colors.teal600 }]}>{c.saldo_pendiente > 0.005 ? fmt(c.saldo_pendiente) : "✓"}</Text>
        </View>
      </View>
      {servicio.status === "cerrado" ? (
        <TouchableOpacity style={styles.botonSecundario} onPress={descargarNotaRemision} disabled={descargando}>
          <Ionicons name="document-text-outline" size={18} color={colors.petrol600} />
          <Text style={styles.botonSecundarioTexto}>{descargando ? "Generando…" : "Descargar nota de remisión"}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const Pestanas = (
    <View style={styles.pestanas}>
      {PESTANAS.map(([k, t, icono]) => {
        const activa = pestana === k;
        return (
          <TouchableOpacity key={k} style={[styles.pestana, activa && styles.pestanaActiva]} onPress={() => cambiarPestana(k)}>
            <Ionicons name={icono} size={17} color={activa ? colors.petrol600 : colors.ink500} />
            <Text style={[styles.pestanaTexto, activa && styles.pestanaTextoActiva]}>{t}</Text>
            {k === "chat" && sinLeer > 0 ? <View style={styles.badge}><Text style={styles.badgeTexto}>{sinLeer}</Text></View> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ---- Chat: ocupa toda la pantalla con su propia barra de escritura ----
  if (pestana === "chat") {
    return (
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <View style={styles.chatCabecera}>{Pestanas}</View>
        <FlatList
          ref={listaRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          data={mensajes}
          keyExtractor={(m, i) => String(m.id_mensaje || i)}
          onContentSizeChange={() => listaRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item: m }) => {
            const propio = m.autor_tipo === "cliente";
            return (
              <View style={[styles.burbuja, propio ? styles.burbujaPropia : styles.burbujaAjena, m.tipo === "alerta" && styles.burbujaAlerta]}>
                {!propio ? <Text style={styles.burbujaAutor}>{m.autor_nombre || "Taller"}</Text> : null}
                {m.ruta_foto ? <Image source={{ uri: urlArchivo(m.ruta_foto) }} style={styles.burbujaFoto} /> : null}
                {m.texto && !(m.ruta_foto && m.texto === "📷 Foto") ? <Text style={[styles.burbujaTexto, propio && { color: "#fff" }]}>{m.texto}</Text> : null}
                <Text style={[styles.burbujaHora, propio && { color: "rgba(255,255,255,0.75)" }]}>{hora(m.fecha)}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.vacioChat}>
              <Ionicons name="chatbubbles-outline" size={34} color={colors.ink300} />
              <Text style={styles.vacioTexto}>Sin mensajes todavía. Escribe si tienes dudas sobre tu servicio.</Text>
            </View>
          }
        />
        {abierta ? (
          <View style={styles.inputBarra}>
            <TouchableOpacity style={styles.botonIcono} onPress={elegirFoto} disabled={enviando}>
              <Ionicons name="camera-outline" size={22} color={colors.petrol600} />
            </TouchableOpacity>
            <TextInput style={styles.inputChat} placeholder="Escribe un mensaje…" placeholderTextColor={colors.ink500} value={texto} onChangeText={setTexto} multiline />
            <TouchableOpacity style={[styles.botonEnviar, (!texto.trim() || enviando) && { opacity: 0.5 }]} onPress={() => enviarMensaje("mensaje")} disabled={!texto.trim() || enviando}>
              {enviando ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.chatCerrado}>El chat se cerró porque la orden ya fue {servicio.status === "cerrado" ? "entregada" : "cancelada"}.</Text>
        )}
      </KeyboardAvoidingView>
    );
  }

  const historial = [...(servicio.historial_etapas || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: abierta ? 96 : 32 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.petrol500} colors={[colors.petrol500]} />}
      >
        {Encabezado}
        {Pestanas}

        {pestana === "seguimiento" ? (
          <>
            <View style={styles.tarjeta}>
              <Text style={styles.tarjetaTitulo}>Datos de la orden</Text>
              <Fila etiqueta="Placas" valor={v.placas_vehiculo} />
              <Fila etiqueta="Ingreso" valor={fecha(servicio.fecha_entrada_servicio)} />
              {servicio.fecha_salida_servicio ? <Fila etiqueta="Entrega" valor={fecha(servicio.fecha_salida_servicio)} /> : null}
              {servicio.km_llegada ? <Fila etiqueta="Km de llegada" valor={Number(servicio.km_llegada).toLocaleString("es-MX")} /> : null}
              {servicio.km_proximo_servicio ? <Fila etiqueta="Próximo servicio" valor={`${Number(servicio.km_proximo_servicio).toLocaleString("es-MX")} km`} /> : null}
              {servicio.tipos_mantenimiento?.length ? <Fila etiqueta="Trabajos" valor={servicio.tipos_mantenimiento.map((t) => t.nombre_tipo).join(", ")} /> : null}
              {servicio.es_garantia ? <Fila etiqueta="Tipo" valor="Garantía" /> : null}
            </View>

            {servicio.diagnostico ? (
              <View style={styles.tarjeta}>
                <Text style={styles.tarjetaTitulo}>Diagnóstico</Text>
                <Text style={styles.cuerpo}>{servicio.diagnostico}</Text>
              </View>
            ) : null}
            {servicio.comentarios_finales ? (
              <View style={styles.tarjeta}>
                <Text style={styles.tarjetaTitulo}>Comentarios del taller</Text>
                <Text style={styles.cuerpo}>{servicio.comentarios_finales}</Text>
              </View>
            ) : null}

            <View style={styles.tarjeta}>
              <Text style={styles.tarjetaTitulo}>Línea de tiempo</Text>
              {historial.length ? historial.map((h, i) => (
                <View key={h.id_registro} style={styles.hito}>
                  <View style={styles.hitoRiel}>
                    <View style={[styles.hitoPunto, i === 0 && { backgroundColor: acento, borderColor: acento }]} />
                    {i < historial.length - 1 ? <View style={styles.hitoLinea} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 14 }}>
                    <Text style={[styles.hitoTitulo, i === 0 && { color: colors.ink900 }]}>{ETIQUETA[h.etapa] || h.etapa}</Text>
                    <Text style={styles.meta}>{fecha(h.fecha)} · {hora(h.fecha)}{h.actualizado_por ? ` · ${h.actualizado_por}` : ""}</Text>
                    {h.comentario ? <Text style={styles.hitoComentario}>{h.comentario}</Text> : null}
                  </View>
                </View>
              )) : <Text style={styles.meta}>Tu vehículo fue recibido. Aquí verás cada avance.</Text>}
            </View>
          </>
        ) : null}

        {pestana === "costos" ? (
          <>
            <View style={styles.tarjeta}>
              <Text style={styles.tarjetaTitulo}>Conceptos</Text>
              {(servicio.detalles || []).length ? servicio.detalles.map((d) => {
                const importe = (d.costo_mano_obra || 0) + (d.costo_refaccion || 0) + (d.costo_extra || 0);
                return (
                  <View key={d.id_servicio_detalle} style={styles.concepto}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.conceptoNombre}>{d.descripcion || "Concepto"}</Text>
                      <Text style={styles.meta}>
                        {d.cantidad > 1 ? `${d.cantidad} pzas · ` : ""}
                        {[d.costo_mano_obra ? `M.O. ${fmt(d.costo_mano_obra)}` : null, d.costo_refaccion ? `Ref. ${fmt(d.costo_refaccion)}` : null, d.costo_extra ? `Extra ${fmt(d.costo_extra)}` : null].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <Text style={styles.importe}>{fmt(importe)}</Text>
                  </View>
                );
              }) : <Text style={styles.meta}>El taller aún no agrega conceptos a tu orden.</Text>}
              <View style={styles.totales}>
                <Fila etiqueta="Subtotal" valor={fmt(c.subtotal)} />
                <Fila etiqueta={`IVA (${servicio.iva_porcentaje ?? 16}%)`} valor={fmt(c.iva)} />
                <Fila etiqueta="Total" valor={fmt(c.total)} fuerte />
              </View>
            </View>

            <View style={styles.tarjeta}>
              <Text style={styles.tarjetaTitulo}>Pagos</Text>
              {(servicio.abonos || []).length ? servicio.abonos.map((a) => (
                <View key={a.id_abono} style={styles.concepto}>
                  <View style={[styles.iconoPago]}><Ionicons name={a.tipo_pago === "tarjeta" ? "card-outline" : "cash-outline"} size={17} color={colors.teal600} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.conceptoNombre}>Pago #{a.numero_abono} · {PAGO[a.tipo_pago] || a.tipo_pago}</Text>
                    <Text style={styles.meta}>{fecha(a.fecha_pago)}{a.comentario ? ` · ${a.comentario}` : ""}</Text>
                  </View>
                  <Text style={[styles.importe, { color: colors.teal600 }]}>{fmt(a.monto_abono)}</Text>
                </View>
              )) : <Text style={styles.meta}>Sin pagos registrados.</Text>}
              <View style={styles.totales}>
                <Fila etiqueta="Pagado" valor={fmt(c.total_abonado)} />
                <Fila etiqueta="Saldo pendiente" valor={fmt(c.saldo_pendiente)} fuerte color={c.saldo_pendiente > 0.005 ? colors.red600 : colors.teal600} />
              </View>
            </View>
          </>
        ) : null}

        {pestana === "inspeccion" ? <InspeccionView servicioId={servicio.id_servicio} /> : null}
      </ScrollView>

      {abierta ? (
        <View style={styles.barraInferior}>
          <TouchableOpacity style={styles.botonAlerta} onPress={confirmarAlerta} disabled={enviando}>
            <Ionicons name="alert-circle-outline" size={19} color={colors.red600} />
            <Text style={styles.botonAlertaTexto}>Avisar al mecánico</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.botonPrimario} onPress={() => cambiarPestana("chat")}>
            <Ionicons name="chatbubbles" size={18} color="#fff" />
            <Text style={styles.botonPrimarioTexto}>Chat{sinLeer ? ` (${sinLeer})` : ""}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function Fila({ etiqueta, valor, fuerte, color }) {
  return (
    <View style={styles.fila}>
      <Text style={[styles.filaEtiqueta, fuerte && { color: colors.ink900, fontWeight: "700" }]}>{etiqueta}</Text>
      <Text style={[styles.filaValor, fuerte && { fontWeight: "700", fontSize: 16 }, color && { color }]}>{valor || "—"}</Text>
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cargando: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0 },
  hero: { backgroundColor: colors.paper100, borderRadius: 16, padding: 16, marginBottom: 14 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  heroVehiculo: { fontSize: 17, fontWeight: "700", color: colors.ink900 },
  heroEtapa: { fontFamily: "BarlowCondensed_700Bold", fontSize: 28, marginTop: 12 },
  barra: { flexDirection: "row", gap: 4, marginTop: 8 },
  tramo: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.ink300 },
  heroCifras: { flexDirection: "row", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.linea },
  cifraEtiqueta: { fontSize: 11.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.5 },
  cifra: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24, color: colors.ink900 },
  vivo: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.paper0 },
  vivoActivo: { backgroundColor: colors.teal100 },
  vivoTexto: { fontSize: 11, fontWeight: "700", color: colors.ink500 },
  punto: { width: 7, height: 7, borderRadius: 4 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  botonSecundario: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, borderRadius: 10, paddingVertical: 11, backgroundColor: colors.petrol100 },
  botonSecundarioTexto: { fontSize: 14, fontWeight: "600", color: colors.petrol600 },
  pestanas: { flexDirection: "row", backgroundColor: colors.paper100, borderRadius: 12, padding: 4, marginBottom: 14, gap: 4 },
  pestana: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9, gap: 2 },
  pestanaActiva: { backgroundColor: colors.petrol100 },
  pestanaTexto: { fontSize: 11.5, fontWeight: "600", color: colors.ink500 },
  pestanaTextoActiva: { color: colors.petrol600 },
  badge: { position: "absolute", top: 3, right: 10, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.red600, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeTexto: { fontSize: 10, fontWeight: "700", color: "#fff" },
  tarjeta: { backgroundColor: colors.paper100, borderRadius: 14, padding: 16, marginBottom: 12 },
  tarjetaTitulo: { fontSize: 12.5, fontWeight: "700", color: colors.ink700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
  cuerpo: { fontSize: 14.5, color: colors.ink900, lineHeight: 21 },
  fila: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5 },
  filaEtiqueta: { fontSize: 13.5, color: colors.ink500 },
  filaValor: { fontSize: 14, color: colors.ink900, flexShrink: 1, textAlign: "right" },
  hito: { flexDirection: "row", gap: 12 },
  hitoRiel: { alignItems: "center", width: 14 },
  hitoPunto: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.ink300, backgroundColor: colors.paper100, marginTop: 3 },
  hitoLinea: { flex: 1, width: 2, backgroundColor: colors.ink300, marginTop: 2 },
  hitoTitulo: { fontSize: 14.5, fontWeight: "600", color: colors.ink700 },
  hitoComentario: { fontSize: 13.5, color: colors.ink700, marginTop: 4 },
  concepto: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.linea },
  conceptoNombre: { fontSize: 14.5, fontWeight: "600", color: colors.ink900 },
  importe: { fontSize: 14.5, fontWeight: "700", color: colors.ink900 },
  iconoPago: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.teal100, alignItems: "center", justifyContent: "center" },
  totales: { marginTop: 8 },
  barraInferior: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, padding: 12, paddingBottom: 16, backgroundColor: colors.paper100, borderTopWidth: 1, borderTopColor: colors.linea },
  botonAlerta: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 13, backgroundColor: colors.red100 },
  botonAlertaTexto: { fontSize: 14, fontWeight: "600", color: colors.red600 },
  botonPrimario: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 13, backgroundColor: colors.petrol500 },
  botonPrimarioTexto: { fontSize: 14, fontWeight: "600", color: "#fff" },
  chatCabecera: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.paper0 },
  burbuja: { maxWidth: "82%", borderRadius: 14, padding: 10, marginBottom: 8 },
  burbujaPropia: { backgroundColor: colors.petrol500, alignSelf: "flex-end", borderBottomRightRadius: 3 },
  burbujaAjena: { backgroundColor: colors.paper100, alignSelf: "flex-start", borderBottomLeftRadius: 3 },
  burbujaAlerta: { borderWidth: 1.5, borderColor: colors.red600 },
  burbujaAutor: { fontSize: 11, fontWeight: "700", color: colors.petrol600, marginBottom: 2 },
  burbujaTexto: { fontSize: 14.5, color: colors.ink900 },
  burbujaFoto: { width: 210, height: 210, borderRadius: 10, marginBottom: 4, backgroundColor: colors.paper0 },
  burbujaHora: { fontSize: 10.5, color: colors.ink500, alignSelf: "flex-end", marginTop: 3 },
  vacioChat: { alignItems: "center", gap: 10, paddingTop: 50, paddingHorizontal: 30 },
  vacioTexto: { fontSize: 14, color: colors.ink500, textAlign: "center" },
  inputBarra: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.linea, backgroundColor: colors.paper100 },
  botonIcono: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.petrol100 },
  inputChat: { flex: 1, minHeight: 42, maxHeight: 110, borderRadius: 21, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.paper0, color: colors.ink900, fontSize: 15 },
  botonEnviar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.petrol500 },
  chatCerrado: { fontSize: 13, color: colors.ink700, textAlign: "center", padding: 14, backgroundColor: colors.paper100 },
});
