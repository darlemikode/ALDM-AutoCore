import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Animated, Easing, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { mostrarDialogo, alerta } from "../ui/Dialogo";

// Catálogo unificado de estatus — mismo catálogo que ETAPAS_SERVICIO en el backend
const ICONO_ETAPA = {
  en_proceso: "log-in", abierto: "build", pendiente: "hourglass", espera_refacciones: "cube",
  en_reparacion: "hammer", listo_entrega: "checkmark-circle", cerrado: "flag", garantia: "shield-checkmark", cancelado: "close-circle",
};

const ETIQUETAS_ETAPA = {
  en_proceso: "Recibido",
  abierto: "En piso",
  pendiente: "Confirmación del cliente",
  espera_refacciones: "Espera refacciones",
  en_reparacion: "En reparación",
  listo_entrega: "Listo para entrega",
  cerrado: "Órdenes finalizadas",
  garantia: "Garantía",
  cancelado: "Cancelado",
};

/** Panel para actualizar en qué etapa va un servicio abierto, con bitácora. */
export default function EtapaTracker({ servicio, puedeEditar, onActualizado }) {
  const [etapas, setEtapas] = useState([]);
  const ORDEN = Object.keys(ETIQUETAS_ETAPA);
  // Se propone la siguiente etapa (no la actual) para evitar registrar la misma dos veces
  const siguiente = (actual) => ORDEN[Math.min(ORDEN.indexOf(actual || "en_proceso") + 1, ORDEN.length - 1)] || "en_proceso";
  const [nuevaEtapa, setNuevaEtapa] = useState(siguiente(servicio.etapa));
  useEffect(() => { setNuevaEtapa(siguiente(servicio.etapa)); }, [servicio.etapa]); // eslint-disable-line react-hooks/exhaustive-deps
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [anchoPista, setAnchoPista] = useState(0);
  const avance = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      api.get("/servicios/etapas-disponibles").then(setEtapas).catch(() => setEtapas([]));
    }, [])
  );

  function actualizar() {
    const actual = servicio.etapa || "recibido";
    const etiqueta = ETIQUETAS_ETAPA[nuevaEtapa] || nuevaEtapa;
    if (nuevaEtapa === actual) {
      if (!comentario.trim()) {
        mostrarDialogo({
          tono: "alerta", icono: "repeat", etiqueta: "Mismo estatus",
          titulo: `Ya está en "${etiqueta}"`,
          mensaje: "Elige otra etapa para avanzar la orden, o escribe un comentario si solo quieres dejar una nota en esta misma etapa.",
          acciones: [
            { texto: `Pasar a "${ETIQUETAS_ETAPA[siguiente(actual)]}"`, tipo: "primario", icono: "arrow-forward", onPress: () => setNuevaEtapa(siguiente(actual)) },
            { texto: "Entendido", tipo: "secundario" },
          ],
        });
        return;
      }
      mostrarDialogo({
        tono: "info", icono: "chatbox-ellipses", etiqueta: "Mismo estatus",
        titulo: "¿Registrar solo la nota?",
        mensaje: `La orden seguirá en "${etiqueta}" y se agregará tu comentario a la bitácora.`,
        acciones: [
          { texto: "Sí, registrar nota", tipo: "primario", icono: "checkmark", onPress: guardarEtapa },
          { texto: "Cancelar", tipo: "secundario" },
        ],
      });
      return;
    }
    guardarEtapa();
  }

  async function guardarEtapa() {
    setGuardando(true);
    try {
      const actualizado = await api.put(`/servicios/${servicio.id_servicio}/etapa`, { etapa: nuevaEtapa, comentario: comentario.trim() || null });
      setComentario("");
      onActualizado(actualizado);
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardando(false);
    }
  }

  const catalogo = etapas.length ? etapas : Object.entries(ETIQUETAS_ETAPA).map(([clave, etiqueta]) => ({ clave, etiqueta }));
  const historial = (servicio.historial_etapas || []).slice().reverse();
  const actual = servicio.etapa || "en_proceso";
  const FLUJO = ORDEN.filter((k) => k !== "garantia" && k !== "cancelado");
  const idx = FLUJO.indexOf(actual);
  const pct = actual === "cancelado" ? 0 : idx < 0 ? 1 : idx / (FLUJO.length - 1);
  const CARRO = 34;

  useEffect(() => {
    Animated.timing(avance, { toValue: pct, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pct]); // eslint-disable-line react-hooks/exhaustive-deps

  const izq = avance.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, anchoPista - CARRO)] });
  const ancho = avance.interpolate({ inputRange: [0, 1], outputRange: [CARRO / 2, Math.max(CARRO / 2, anchoPista - CARRO / 2)] });
  const etiquetaNueva = ETIQUETAS_ETAPA[nuevaEtapa] || nuevaEtapa;
  const mismaEtapa = nuevaEtapa === actual;

  return (
    <View style={styles.contenedor}>
      <View style={styles.cabecera}>
        <View style={styles.cabIcono}><Ionicons name={ICONO_ETAPA[actual] || "ellipse"} size={24} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cabEtiqueta}>Estatus actual</Text>
          <Text style={styles.cabEtapa} numberOfLines={1}>{ETIQUETAS_ETAPA[actual] || actual}</Text>
        </View>
        {idx >= 0 && <View style={styles.paso}><Text style={styles.pasoTexto}>Paso {idx + 1} de {FLUJO.length}</Text></View>}
      </View>

      <View style={styles.pista} onLayout={(e) => setAnchoPista(e.nativeEvent.layout.width)}>
        <View style={styles.carretera} />
        <Animated.View style={[styles.recorrido, { width: ancho }]} />
        <View style={styles.marcas} pointerEvents="none">
          {FLUJO.map((k, n) => <View key={k} style={[styles.marca, n <= idx && styles.marcaHecha]} />)}
        </View>
        <Animated.View style={[styles.carro, { width: CARRO, height: CARRO, borderRadius: CARRO / 2, left: izq }]}>
          <Ionicons name="car-sport" size={19} color="#fff" />
        </Animated.View>
      </View>

      {puedeEditar && (
        <View style={styles.formulario}>
          <Text style={styles.subtitulo}>Mover la orden a…</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            {catalogo.map((e) => {
              const sel = nuevaEtapa === e.clave;
              const es = actual === e.clave;
              return (
                <TouchableOpacity key={e.clave} onPress={() => setNuevaEtapa(e.clave)} activeOpacity={0.8} style={[styles.chip, sel && styles.chipSel, es && !sel && styles.chipActual]}>
                  <Ionicons name={ICONO_ETAPA[e.clave] || "ellipse"} size={15} color={sel ? "#fff" : es ? colors.petrol500 : colors.ink500} />
                  <Text style={[styles.chipTexto, sel && styles.chipTextoSel]}>{e.etiqueta}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TextInput placeholderTextColor={colors.ink500}
            style={styles.input}
            placeholder="Comentario para la bitácora (opcional)"
            value={comentario}
            onChangeText={setComentario}
          />
          <TouchableOpacity style={[styles.boton, guardando && { opacity: 0.6 }]} onPress={actualizar} disabled={guardando} activeOpacity={0.85}>
            <Ionicons name={mismaEtapa ? "chatbox-ellipses-outline" : "arrow-forward-outline"} size={18} color="#fff" />
            <Text style={styles.botonTexto} numberOfLines={1}>{guardando ? "Guardando…" : mismaEtapa ? "Solo agregar nota" : `Pasar a «${etiquetaNueva}»`}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.subtitulo}>Bitácora</Text>
      <View style={styles.linea}>
        {historial.length === 0 ? (
          <Text style={styles.vacio}>Sin movimientos registrados todavía.</Text>
        ) : (
          historial.map((h, i) => (
            <View key={h.id_registro ?? `${h.etapa}-${i}`} style={styles.item}>
              <View style={[styles.punto, i === 0 && styles.puntoActual]}>
                <Ionicons name={ICONO_ETAPA[h.etapa] || "ellipse"} size={i === 0 ? 11 : 9} color={i === 0 ? "#fff" : colors.ink500} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitulo, i > 0 && { color: colors.ink700 }]}>{ETIQUETAS_ETAPA[h.etapa] || h.etapa}</Text>
                <Text style={styles.itemFecha}>
                  {new Date(h.fecha).toLocaleString("es-MX")} {h.actualizado_por ? `· ${h.actualizado_por}` : ""}
                </Text>
                {h.comentario ? <View style={styles.nota}><Text style={styles.itemComentario}>{h.comentario}</Text></View> : null}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = crearEstilos({
  contenedor: { backgroundColor: colors.paper100, borderRadius: 16, padding: spacing.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.ink300 },
  cabecera: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  cabIcono: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.petrol500, alignItems: "center", justifyContent: "center" },
  cabEtiqueta: { fontSize: 11, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.6 },
  cabEtapa: { fontFamily: "BarlowCondensed_700Bold", fontSize: 26, color: colors.ink900 },
  paso: { backgroundColor: colors.petrol100, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  pasoTexto: { fontSize: 12, fontWeight: "700", color: colors.petrol600 },
  pista: { height: 34, justifyContent: "center", marginBottom: 16 },
  carretera: { position: "absolute", left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: colors.ink300 },
  recorrido: { position: "absolute", left: 0, height: 6, borderRadius: 3, backgroundColor: colors.petrol500 },
  marcas: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 15 },
  marca: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.paper100, borderWidth: 2, borderColor: colors.ink300 },
  marcaHecha: { borderColor: colors.petrol500, backgroundColor: colors.paper100 },
  carro: { position: "absolute", backgroundColor: colors.petrol500, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.paper100 },
  subtitulo: { fontSize: 12, fontWeight: "800", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  formulario: { marginBottom: spacing.md, gap: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderColor: colors.ink300, borderRadius: 100, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.paper0 },
  chipSel: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  chipActual: { borderColor: colors.petrol500 },
  chipTexto: { fontSize: 13, fontWeight: "700", color: colors.ink700 },
  chipTextoSel: { color: "#fff" },
  input: { backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, padding: 11, fontSize: 14, color: colors.ink900 },
  boton: { flexDirection: "row", gap: 8, backgroundColor: colors.petrol500, borderRadius: 24, height: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  botonTexto: { color: "#fff", fontWeight: "800", fontSize: 14, flexShrink: 1 },
  linea: { borderLeftWidth: 2, borderLeftColor: colors.ink300, paddingLeft: 24, marginLeft: 12 },
  vacio: { fontSize: 12, color: colors.ink500 },
  item: { flexDirection: "row", marginBottom: 14, position: "relative" },
  punto: { position: "absolute", left: -29, top: 1, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.paper0, borderWidth: 1.5, borderColor: colors.ink300, alignItems: "center", justifyContent: "center" },
  puntoActual: { backgroundColor: colors.petrol500, borderColor: colors.petrol100, borderWidth: 3, width: 26, height: 26, borderRadius: 13, left: -32, top: -2 },
  itemTitulo: { fontWeight: "800", fontSize: 14, color: colors.ink900 },
  itemFecha: { fontSize: 11, color: colors.ink500, marginTop: 1 },
  nota: { backgroundColor: colors.paper0, borderRadius: 8, padding: 8, marginTop: 6 },
  itemComentario: { fontSize: 12.5, color: colors.ink700 },
});
