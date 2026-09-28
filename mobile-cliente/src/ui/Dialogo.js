import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Modal, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, temaActivo } from "../theme";
import { crearEstilos } from "./estilos";

/*
 * Diálogo propio de la app (reemplaza el cuadro nativo de alerta en toda la app):
 *   mostrarDialogo({ tono: "exito"|"info"|"alerta"|"peligro", icono, titulo, mensaje,
 *                    acciones: [{ texto, tipo: "primario"|"secundario"|"peligro", icono, onPress }] })
 * Se monta una sola vez con <DialogoHost /> en App.js.
 */
let abrirExterno = null;
let pendiente = null;
export function mostrarDialogo(opciones) {
  if (abrirExterno) abrirExterno(opciones);
  else pendiente = opciones; // se muestra en cuanto se monte el host
}

/*
 * Reemplazo directo del cuadro nativo de alerta (titulo, mensaje, botones) con el diseño de la app.
 * El tono se deduce del texto y de los botones: error → rojo, "falta…" → ámbar,
 * "listo/guardado/creado" → petróleo, destructivo → rojo con papelera.
 */
export function alerta(titulo, mensaje, botones) {
  const texto = `${titulo || ""} ${mensaje || ""}`.toLowerCase();
  const destructivo = (botones || []).some((b) => b?.style === "destructive");
  let tono = "info";
  if (destructivo) tono = "peligro";
  else if (/error|no se pudo|no pudimos|fall[oó]|inv[aá]lid|no coincide|no encontr/.test(texto)) tono = "peligro";
  else if (/falta|permiso|atenci[oó]n|cuidado|sin conexi|revisa|requier/.test(texto)) tono = "alerta";
  else if (/listo|guardad|cread|agregad|enviad|actualizad|registrad|aplicad|🎉|[eé]xito|confirmad/.test(texto)) tono = "exito";
  const icono = { peligro: destructivo ? "trash-outline" : "close-circle-outline", alerta: "alert-circle-outline", exito: "checkmark-done", info: "information-circle-outline" }[tono];
  const lista = (botones && botones.length ? botones : [{ text: "Entendido" }]).filter(Boolean);
  const principal = lista.find((b) => b.style === "destructive") || lista.find((b) => b.style !== "cancel") || lista[0];
  const acciones = [principal, ...lista.filter((b) => b !== principal)].map((b) => ({
    texto: b.text || "OK",
    tipo: b === principal ? (b.style === "destructive" ? "peligro" : b.style === "cancel" && lista.length > 1 ? "secundario" : "primario") : "secundario",
    onPress: b.onPress,
  }));
  mostrarDialogo({ tono, icono, titulo: String(titulo || "").replace(/\s*[🎉✅⚠️🚨]+\s*/gu, " ").trim(), mensaje, acciones });
}

const TONOS = {
  exito: ["petrol500", "petrol600", "checkmark-done"],
  info: ["blue600", "blue600", "information"],
  alerta: ["warn600", "warn600", "alert"],
  peligro: ["red600", "red600", "trash"],
};
function alfa(hex, a) {
  const h = String(hex).replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function DialogoHost() {
  const [d, setD] = useState(null);
  const escala = useRef(new Animated.Value(0.9)).current;
  const opacidad = useRef(new Animated.Value(0)).current;
  const pulso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    abrirExterno = (o) => setD(o);
    if (pendiente) { setD(pendiente); pendiente = null; }
    return () => { abrirExterno = null; };
  }, []);

  useEffect(() => {
    if (!d) return;
    escala.setValue(0.88); opacidad.setValue(0); pulso.setValue(0);
    Animated.parallel([
      Animated.spring(escala, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
      Animated.timing(opacidad, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.loop(Animated.timing(pulso, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }), { iterations: 2 }),
    ]).start();
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) return null;
  const [claro, fuerte, iconoBase] = TONOS[d.tono || "exito"];
  const acento = colors[claro], acentoFuerte = colors[fuerte];
  const oscuro = temaActivo() === "oscuro";
  const acciones = d.acciones?.length ? d.acciones : [{ texto: "Entendido", tipo: "primario" }];
  const cerrar = (accion) => { setD(null); accion?.onPress?.(); };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => cerrar(acciones.find((a) => a.tipo === "secundario"))}>
      <Animated.View style={[styles.velo, { opacity: opacidad, backgroundColor: oscuro ? "rgba(0,0,0,0.6)" : "rgba(10,30,36,0.4)" }]}>
        <Animated.View style={[styles.tarjeta, { transform: [{ scale: escala }], backgroundColor: alfa(colors.paper100, oscuro ? 0.96 : 0.97), borderColor: alfa(acento, 0.35) }]}>
          <View style={[styles.franja, { backgroundColor: acento }]} />
          <View style={styles.iconoZona}>
            <Animated.View style={[styles.halo, { backgroundColor: alfa(acento, 0.25), opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }]} />
            <View style={[styles.icono, { backgroundColor: alfa(acento, oscuro ? 0.22 : 0.16), borderColor: alfa(acento, 0.5) }]}>
              <Ionicons name={d.icono || iconoBase} size={34} color={acentoFuerte} />
            </View>
          </View>
          {d.etiqueta ? <Text style={[styles.etiqueta, { color: acentoFuerte }]}>{d.etiqueta}</Text> : null}
          <Text style={styles.titulo}>{d.titulo}</Text>
          {d.mensaje ? <Text style={styles.mensaje}>{d.mensaje}</Text> : null}
          <View style={styles.acciones}>
            {acciones.map((a, i) => {
              const primario = a.tipo === "primario" || a.tipo === "peligro";
              const fondo = a.tipo === "peligro" ? colors.red600 : acento;
              return (
                <TouchableOpacity key={i} activeOpacity={0.8} onPress={() => cerrar(a)}
                  style={[styles.boton, primario ? { backgroundColor: fondo } : { backgroundColor: alfa(colors.ink500, 0.12) }]}>
                  {a.icono ? <Ionicons name={a.icono} size={19} color={primario ? colors.paper100 : colors.ink700} /> : null}
                  <Text style={[styles.botonTexto, { color: primario ? colors.paper100 : colors.ink700 }]}>{a.texto}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = crearEstilos({
  velo: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  tarjeta: { width: "100%", maxWidth: 420, borderRadius: 24, borderWidth: 1, paddingHorizontal: 22, paddingTop: 30, paddingBottom: 20, alignItems: "center", overflow: "hidden", elevation: 12, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
  franja: { position: "absolute", top: 0, left: 0, right: 0, height: 5 },
  iconoZona: { width: 76, height: 76, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  halo: { position: "absolute", width: 76, height: 76, borderRadius: 38 },
  icono: { width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  etiqueta: { fontSize: 11.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 4 },
  titulo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 30, color: colors.ink900, textAlign: "center", lineHeight: 34 },
  mensaje: { fontSize: 15, color: colors.ink700, textAlign: "center", lineHeight: 22, marginTop: 8 },
  acciones: { alignSelf: "stretch", gap: 10, marginTop: 22 },
  boton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15 },
  botonTexto: { fontSize: 15.5, fontWeight: "700", letterSpacing: 0.2 },
});
