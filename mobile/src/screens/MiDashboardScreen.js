import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";

const ETIQUETAS_ETAPA = {
  recibido: "Recibido",
  diagnostico: "En diagnóstico",
  esperando_autorizacion: "Esperando autorización",
  en_reparacion: "En reparación",
  esperando_refacciones: "Esperando refacciones",
  control_calidad: "Control de calidad",
  listo_entrega: "Listo para entrega",
};

/**
 * Dashboard personal — lo ve cualquier usuario ligado a un registro del
 * catálogo de Empleados. Si no está ligado, el backend regresa un mensaje
 * claro en vez de datos (ver empleados.py → /mi-dashboard).
 */
export default function MiDashboardScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setCargando(true);
      api.get("/empleados/mi-dashboard")
        .then((d) => { setData(d); setError(""); })
        .catch((err) => setError(err.message))
        .finally(() => setCargando(false));
    }, [])
  );

  if (cargando) return <Text style={{ padding: spacing.lg, color: colors.ink500 }}>Cargando…</Text>;

  if (error) {
    return (
      <View style={styles.screen}>
        <View style={styles.errorBox}><Text style={styles.errorTexto}>{error}</Text></View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      data={data.servicios_recientes}
      keyExtractor={(item) => String(item.id_servicio)}
      contentContainerStyle={{ padding: spacing.lg }}
      ListHeaderComponent={
        <View>
          <Text style={styles.subtitle}>Hola, {data.nombre_empleado}</Text>

          <View style={styles.kpiGrid}>
            <View style={[styles.kpi, styles.kpiOk]}>
              <Text style={styles.kpiLabel}>Abiertos</Text>
              <Text style={styles.kpiValue}>{data.servicios_abiertos}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Cerrados este mes</Text>
              <Text style={styles.kpiValue}>{data.servicios_cerrados_mes}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Total asignados</Text>
              <Text style={styles.kpiValue}>{data.servicios_totales}</Text>
            </View>
          </View>

          <Text style={styles.seccionTitulo}>Tus servicios recientes</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate("Servicio", { screen: "ServicioDetalle", params: { id: item.id_servicio } })}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>#{item.id_servicio} · {item.nombre_servicio}</Text>
            <Text style={styles.cardSub}>{new Date(item.fecha_entrada_servicio).toLocaleDateString("es-MX")}</Text>
          </View>
          <View style={[styles.badge, item.status === "abierto" && styles.badgePetrol, item.status === "cerrado" && styles.badgeTeal]}>
            <Text style={styles.badgeTexto}>{item.status === "abierto" ? (ETIQUETAS_ETAPA[item.etapa] || "En proceso") : item.status}</Text>
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={<Text style={styles.empty}>Todavía no tienes servicios asignados como responsable.</Text>}
    />
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink900, textTransform: "uppercase" },
  subtitle: { fontSize: 13, color: colors.ink500, marginBottom: spacing.md },
  kpiGrid: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  kpi: { flex: 1, backgroundColor: colors.paper100, borderRadius: 10, padding: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.petrol500 },
  kpiOk: { borderLeftColor: colors.teal600 },
  kpiLabel: { fontSize: 10, color: colors.ink500, fontWeight: "700", textTransform: "uppercase" },
  kpiValue: { fontSize: 20, fontWeight: "800", color: colors.ink900, marginTop: 4 },
  seccionTitulo: { fontSize: 13, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", marginBottom: spacing.sm },
  card: { backgroundColor: colors.paper100, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "700", color: colors.ink900 },
  cardSub: { fontSize: 12, color: colors.ink500, marginTop: 2 },
  badge: { backgroundColor: "#ece9e2", borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10 },
  badgePetrol: { backgroundColor: colors.petrol100 },
  badgeTeal: { backgroundColor: colors.teal100 },
  badgeTexto: { fontSize: 10, fontWeight: "800", color: colors.ink700, textTransform: "uppercase" },
  empty: { textAlign: "center", color: colors.ink500, marginTop: spacing.xl },
  errorBox: { backgroundColor: colors.paper100, borderLeftWidth: 4, borderLeftColor: colors.red600, borderRadius: 8, padding: spacing.md, margin: spacing.lg },
  errorTexto: { fontSize: 13, color: colors.ink700, lineHeight: 19 },
});
