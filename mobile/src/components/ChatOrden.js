import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Image, Modal, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api, getToken, API_URL, urlArchivo, archivoParaForm } from "../api";
import { WS_URL } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";

// El backend sirve las fotos en /uploads/... (aparte de /api/...) — se arma
// la URL quitando el sufijo "/api" de la URL base configurada.
const BASE_SIN_API = API_URL.replace(/\/api\/?$/, "");

function hora(fecha) {
  return new Date(fecha).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function dia(fecha) {
  const d = new Date(fecha);
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Chat en vivo de una orden — mismo canal que usa la app de clientes.
 * Se muestra dentro del scroll de la pantalla de detalle, con su propia
 * caja de mensajes de alto fijo (para no anidar listas con scroll infinito
 * dentro del ScrollView de la pantalla). Admite fotos (cámara o galería).
 */
export default function ChatOrden({ servicioId }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");
  const [conectado, setConectado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [fotoGrande, setFotoGrande] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    api.get(`/servicios/${servicioId}/chat/mensajes`).then((m) => setMensajes(Array.isArray(m) ? m : [])).catch(() => setMensajes([]));
  }, [servicioId]);

  useEffect(() => {
    let activo = true;
    let socket;

    (async () => {
      const token = await getToken();
      socket = new WebSocket(`${WS_URL}/api/ws/servicio/${servicioId}?token=${token}`);
      socket.onopen = () => activo && setConectado(true);
      socket.onclose = () => activo && setConectado(false);
      socket.onerror = () => activo && setConectado(false);
      socket.onmessage = (event) => {
        if (!activo) return;
        try {
          const data = JSON.parse(event.data);
          if (data.tipo === "chat") {
            setMensajes((prev) => (prev.some((m) => m.id_mensaje === data.id_mensaje) ? prev : [...prev, {
              id_mensaje: data.id_mensaje, autor_tipo: data.autor_tipo, autor_nombre: data.autor_nombre,
              tipo: data.mensaje_tipo, texto: data.texto, ruta_foto: data.ruta_foto, fecha: data.fecha,
            }]));
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
          }
        } catch {
          // mensaje no reconocido, se ignora
        }
      };
    })();

    return () => {
      activo = false;
      socket?.close();
    };
  }, [servicioId]);

  function agregarMensaje(m) {
    if (!m || m.id_mensaje == null) return;
    setMensajes((prev) => (prev.some((x) => x.id_mensaje === m.id_mensaje) ? prev : [...prev, m]));
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function enviar() {
    const contenido = texto.trim();
    if (!contenido) return;
    setTexto("");
    try {
      const nuevo = await api.post(`/servicios/${servicioId}/chat/mensajes`, { texto: contenido, tipo: "mensaje" });
      // Con servidor también llega por el WebSocket; se evita duplicarlo por id.
      // En modo local no hay WebSocket, así que esto es lo que lo muestra.
      agregarMensaje(nuevo);
    } catch (err) {
      setTexto(contenido); // regresa el texto si falló, para no perderlo
    }
  }

  async function subirFoto(origen) {
    const permisoDispositivo = origen === "camara"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permisoDispositivo.granted) {
      alerta("Falta permiso", origen === "camara" ? "Activa el permiso de cámara para tomar fotos." : "Activa el permiso de fotos para elegir una imagen.");
      return;
    }

    const resultado = origen === "camara"
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (resultado.canceled) return;

    const asset = resultado.assets[0];
    const nombreArchivo = asset.fileName || `foto_${Date.now()}.jpg`;
    const tipoMime = asset.mimeType || "image/jpeg";
    const pie = texto.trim();

    const formData = new FormData();
    formData.append("archivo", await archivoParaForm(asset.uri), nombreArchivo);
    if (pie) formData.append("texto", pie);

    setSubiendo(true);
    try {
      const nuevo = await api.postForm(`/servicios/${servicioId}/chat/foto`, formData);
      agregarMensaje(nuevo);
      if (pie) setTexto("");
    } catch (err) {
      alerta("Error al subir la foto", err.message);
    } finally {
      setSubiendo(false);
    }
  }

  function elegirOrigenFoto() {
    alerta("Enviar foto", "¿De dónde la tomamos?", [
      { text: "Cámara", onPress: () => subirFoto("camara") },
      { text: "Galería del teléfono", onPress: () => subirFoto("galeria") },
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  let diaAnterior = null;

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Text style={styles.titulo}>Chat con el cliente</Text>
        <View style={styles.conexionRow}>
          <View style={[styles.punto, conectado && styles.puntoActivo]} />
          <Text style={styles.conexionTexto}>{conectado ? "En vivo" : "Conectando…"}</Text>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={styles.caja} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        {mensajes.length === 0 ? (
          <Text style={styles.vacio}>Sin mensajes todavía.</Text>
        ) : (
          mensajes.map((m, i) => {
            const d = dia(m.fecha);
            const separador = d !== diaAnterior;
            diaAnterior = d;
            const mio = m.autor_tipo === "taller";
            return (
              <View key={m.id_mensaje || i}>
                {separador && (
                  <View style={styles.diaSeparador}>
                    <Text style={styles.diaTexto}>{d}</Text>
                  </View>
                )}
                <View
                  style={[
                    styles.burbuja,
                    mio ? styles.burbujaTaller : styles.burbujaCliente,
                    m.tipo === "alerta" && styles.burbujaAlerta,
                  ]}
                >
                  {!mio && <Text style={styles.autor}>{m.autor_nombre || "Cliente"}</Text>}
                  {m.tipo === "alerta" && <Text style={styles.alertaEtiqueta}>🚨 AVISO URGENTE</Text>}
                  {m.ruta_foto && (
                    <TouchableOpacity onPress={() => setFotoGrande(urlArchivo(m.ruta_foto))}>
                      <Image source={{ uri: urlArchivo(m.ruta_foto) }} style={styles.fotoMensaje} />
                    </TouchableOpacity>
                  )}
                  {!(m.ruta_foto && m.texto === "📷 Foto") && (
                    <Text style={[styles.texto, mio && { color: "#fff" }]}>{m.texto}</Text>
                  )}
                  <Text style={[styles.hora, mio && { color: "rgba(255,255,255,0.75)" }]}>{hora(m.fecha)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.botonFoto} onPress={elegirOrigenFoto} disabled={subiendo}>
          {subiendo ? <ActivityIndicator color={colors.petrol600} size="small" /> : <Text style={styles.botonFotoTexto}>📷</Text>}
        </TouchableOpacity>
        <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={texto} onChangeText={setTexto} placeholder="Escribe un mensaje…" multiline />
        <TouchableOpacity style={styles.boton} onPress={enviar}>
          <Text style={styles.botonTexto}>Enviar</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={!!fotoGrande} transparent animationType="fade" onRequestClose={() => setFotoGrande(null)}>
        <TouchableOpacity style={styles.lightbox} activeOpacity={1} onPress={() => setFotoGrande(null)}>
          {fotoGrande && <Image source={{ uri: fotoGrande }} style={styles.lightboxImagen} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = crearEstilos({
  contenedor: { backgroundColor: colors.paper100, borderRadius: 10, padding: spacing.md, marginTop: spacing.lg },
  encabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  titulo: { fontSize: 14, fontWeight: "800", color: colors.ink900, textTransform: "uppercase" },
  conexionRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  punto: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.ink300 },
  puntoActivo: { backgroundColor: colors.teal600 },
  conexionTexto: { fontSize: 10.5, color: colors.ink500 },
  caja: { maxHeight: 260, backgroundColor: colors.paper0, borderRadius: 8, padding: spacing.sm, marginBottom: spacing.sm },
  vacio: { fontSize: 12, color: colors.ink500, padding: 8 },
  diaSeparador: { alignItems: "center", marginVertical: 8 },
  diaTexto: { fontSize: 10.5, fontWeight: "700", color: colors.ink500, backgroundColor: colors.ink300, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100, overflow: "hidden", textTransform: "capitalize" },
  burbuja: { maxWidth: "80%", borderRadius: 10, padding: 9, marginBottom: 7 },
  burbujaTaller: { backgroundColor: colors.petrol500, alignSelf: "flex-end" },
  burbujaCliente: { backgroundColor: colors.paper100, alignSelf: "flex-start" },
  burbujaAlerta: { borderWidth: 1.5, borderColor: colors.red600 },
  autor: { fontSize: 10, fontWeight: "700", color: colors.ink500, marginBottom: 2 },
  alertaEtiqueta: { fontSize: 10, fontWeight: "700", color: colors.red600, marginBottom: 2 },
  fotoMensaje: { width: 180, height: 180, borderRadius: 8, backgroundColor: colors.ink300, marginBottom: 4 },
  texto: { fontSize: 13, color: colors.ink900 },
  hora: { fontSize: 9.5, color: colors.ink500, marginTop: 3, alignSelf: "flex-end" },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  botonFoto: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.paper0, alignItems: "center", justifyContent: "center" },
  botonFotoTexto: { fontSize: 17 },
  input: { flex: 1, backgroundColor: colors.paper0, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, maxHeight: 90, fontSize: 13 },
  boton: { backgroundColor: colors.petrol500, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  botonTexto: { color: "#fff", fontWeight: "700", fontSize: 12 },
  lightbox: { flex: 1, backgroundColor: "rgba(10,14,16,0.92)", alignItems: "center", justifyContent: "center" },
  lightboxImagen: { width: "100%", height: "80%" },
});
