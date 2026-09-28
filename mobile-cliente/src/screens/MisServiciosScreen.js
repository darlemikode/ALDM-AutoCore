import { useCallback, useState } from "react";
import { View, Text, Image, FlatList, ScrollView, TouchableOpacity, RefreshControl, Linking } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api, urlArchivo } from "../api";
import { useAuth } from "../context/AuthContext";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";

export const ETAPAS = [
  ["recibido", "Recibido"], ["diagnostico", "En diagnóstico"], ["esperando_autorizacion", "Esperando tu autorización"],
  ["en_reparacion", "En reparación"], ["esperando_refacciones", "Esperando refacciones"], ["control_calidad", "Control de calidad"], ["listo_entrega", "¡Listo para entrega!"],
];
const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MisServiciosScreen({ navigation }) {
  const { cliente } = useAuth();
  const [servicios, setServicios] = useState([]);
  const [promociones, setPromociones] = useState([]);
  const [refrescando, setRefrescando] = useState(false);

  async function cargar() {
    const [s, p] = await Promise.all([api.get("/portal-cliente/mis-servicios"), api.get("/portal-cliente/promociones").catch(() => [])]);
    setServicios(s || []);
    setPromociones(p || []);
  }
  useFocusEffect(useCallback(() => { cargar().catch(() => {}); }, []));
  useActualizacionGlobal("servicios", () => cargar().catch(() => {}));

  const enCurso = servicios.filter((s) => s.status === "abierto");
  const historial = servicios.filter((s) => s.status !== "abierto");

  const Activa = ({ s }) => {
    const idx = Math.max(0, ETAPAS.findIndex(([k]) => k === s.etapa));
    const lista = s.etapa === "listo_entrega";
    return (
      <TouchableOpacity style={[styles.activa, lista && { borderColor: colors.teal600 }]} onPress={() => navigation.navigate("ServicioDetalle", { id: s.id_servicio })} activeOpacity={0.85}>
        <View style={styles.activaTop}>
          <View style={[styles.icono, lista && { backgroundColor: colors.teal100 }]}>
            <Ionicons name={lista ? "checkmark-done" : "construct"} size={20} color={lista ? colors.teal600 : colors.petrol600} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.activaEtiqueta}>{lista ? "Tu vehículo está listo" : "En el taller ahora"}</Text>
            <Text style={styles.activaTitulo} numberOfLines={1}>{[s.vehiculo?.marca?.nombre_marca, s.vehiculo?.modelo?.nombre_modelo, s.vehiculo?.id_year_vehiculo].filter(Boolean).join(" ") || s.vehiculo?.placas_vehiculo || "Tu vehículo"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.ink500} />
        </View>
        <Text style={[styles.etapa, lista && { color: colors.teal600 }]}>{ETAPAS[idx][1]}</Text>
        <View style={styles.barra}>
          {ETAPAS.map(([k], i) => <View key={k} style={[styles.tramo, i <= idx && { backgroundColor: lista ? colors.teal600 : colors.petrol500 }]} />)}
        </View>
        <Text style={styles.meta}>{s.nombre_servicio} · desde {new Date(s.fecha_entrada_servicio).toLocaleDateString("es-MX")}</Text>
        
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      style={styles.screen}
      data={historial}
      keyExtractor={(i) => String(i.id_servicio)}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 30 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar().catch(() => {}); setRefrescando(false); }} tintColor={colors.petrol500} colors={[colors.petrol500]} />}
      ListHeaderComponent={
        <View>
          <Text style={styles.saludo}>Hola, {cliente?.nombre_cliente}</Text>
          {enCurso.length ? enCurso.map((s) => <Activa key={s.id_servicio} s={s} />) : (
            <View style={styles.sinActivas}>
              <Ionicons name="car-sport-outline" size={26} color={colors.petrol600} />
              <View style={{ flex: 1 }}>
                <Text style={styles.sinActivasTitulo}>No tienes vehículos en el taller</Text>
                <Text style={styles.meta}>¿Necesitas servicio? Agenda una cita.</Text>
              </View>
              <TouchableOpacity style={styles.botonChico} onPress={() => navigation.getParent()?.navigate("Agendar")}>
                <Text style={styles.botonChicoTexto}>Agendar</Text>
              </TouchableOpacity>
            </View>
          )}

          {promociones.length > 0 && (
            <>
              <Text style={styles.seccion}>Promociones para ti</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
                {promociones.map((p) => (
                  <TouchableOpacity key={p.id_promocion} style={styles.promo} activeOpacity={p.link ? 0.8 : 1} onPress={() => p.link && Linking.openURL(p.link).catch(() => {})}>
                    {p.ruta_imagen ? <Image source={{ uri: urlArchivo(p.ruta_imagen) }} style={styles.promoImagen} /> : (
                      <View style={[styles.promoImagen, styles.promoSinImagen]}><Ionicons name="pricetag" size={28} color={colors.petrol600} /></View>
                    )}
                    <View style={{ padding: 12 }}>
                      <Text style={styles.promoTitulo} numberOfLines={1}>{p.titulo}</Text>
                      {p.descripcion ? <Text style={styles.meta} numberOfLines={2}>{p.descripcion}</Text> : null}
                      {p.precio_promocion ? (
                        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                          {p.precio_original ? <Text style={styles.tachado}>{fmt(p.precio_original)}</Text> : null}
                          <Text style={styles.precio}>{fmt(p.precio_promocion)}</Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
          <Text style={styles.seccion}>Historial</Text>
        </View>
      }
      renderItem={({ item: s }) => (
        <TouchableOpacity style={styles.fila} onPress={() => navigation.navigate("ServicioDetalle", { id: s.id_servicio })}>
          <View style={[styles.punto, { backgroundColor: s.status === "cerrado" ? colors.teal600 : colors.red600 }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.filaTitulo} numberOfLines={1}>{s.nombre_servicio}</Text>
            <Text style={styles.meta}>{s.vehiculo?.placas_vehiculo || "Vehículo"} · {new Date(s.fecha_entrada_servicio).toLocaleDateString("es-MX")} · {s.status === "cerrado" ? "entregado" : s.status}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.ink500} />
        </TouchableOpacity>
      )}
      ListEmptyComponent={<Text style={styles.vacio}>Aquí aparecerán tus servicios anteriores.</Text>}
    />
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  saludo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 26, color: colors.ink900, marginBottom: 12 },
  activa: { backgroundColor: colors.paper100, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: colors.petrol300 },
  activaTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  icono: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  activaEtiqueta: { fontSize: 11.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.5 },
  activaTitulo: { fontSize: 16, fontWeight: "600", color: colors.ink900 },
  etapa: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24, color: colors.petrol600, marginTop: 12 },
  barra: { flexDirection: "row", gap: 4, marginVertical: 8 },
  tramo: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.ink300 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  saldo: { fontSize: 13, fontWeight: "700", color: colors.red600, marginTop: 6 },
  sinActivas: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paper100, borderRadius: 14, padding: 16, marginBottom: 12 },
  sinActivasTitulo: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
  botonChico: { backgroundColor: colors.petrol500, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  botonChicoTexto: { fontSize: 13.5, fontWeight: "600", color: colors.paper100 },
  seccion: { fontSize: 12.5, fontWeight: "700", color: colors.ink700, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 18, marginBottom: 10 },
  promo: { width: 250, backgroundColor: colors.paper100, borderRadius: 14, overflow: "hidden" },
  promoImagen: { width: "100%", height: 120, backgroundColor: colors.paper0 },
  promoSinImagen: { alignItems: "center", justifyContent: "center", backgroundColor: colors.petrol100 },
  promoTitulo: { fontSize: 15, fontWeight: "700", color: colors.ink900 },
  tachado: { fontSize: 12, color: colors.ink500, textDecorationLine: "line-through" },
  precio: { fontFamily: "BarlowCondensed_700Bold", fontSize: 22, color: colors.petrol600 },
  fila: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginBottom: 8 },
  punto: { width: 10, height: 10, borderRadius: 5 },
  filaTitulo: { fontSize: 14.5, fontWeight: "600", color: colors.ink900 },
  monto: { fontSize: 14.5, fontWeight: "700", color: colors.ink900 },
  vacio: { fontSize: 13.5, color: colors.ink500 },
});
