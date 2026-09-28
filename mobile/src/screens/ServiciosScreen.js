import { useCallback, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";

const ETAPAS = {
  recibido: "Recibido", diagnostico: "En diagnóstico", esperando_autorizacion: "Esperando autorización",
  en_reparacion: "En reparación", esperando_refacciones: "Esperando refacciones", control_calidad: "Control de calidad", listo_entrega: "Listo para entrega",
};
const PESTANAS = [
  { clave: "abierto", etiqueta: "Abiertas" },
  { clave: "cerrado", etiqueta: "Cerradas" },
  { clave: "cancelado", etiqueta: "Canceladas" },
  { clave: "", etiqueta: "Todas" },
];
const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ServiciosScreen({ navigation }) {
  const { hasPermission } = useAuth();
  const [busqueda, setBusqueda] = useState("");
  const [servicios, setServicios] = useState([]);
  const [pestana, setPestana] = useState("abierto");
  const [refrescando, setRefrescando] = useState(false);

  const load = () => api.get("/servicios/").then(setServicios).catch(() => {});
  useFocusEffect(useCallback(() => { load(); }, []));
  useActualizacionGlobal("servicios", load);

  const conteo = (clave) => servicios.filter((s) => !clave || s.status === clave).length;
  const q = busqueda.trim().toLowerCase();
  const filtrados = servicios.filter((s) => {
    if (pestana && s.status !== pestana) return false;
    if (!q) return true;
    const v = s.vehiculo || {};
    return `${s.id_servicio} ${s.nombre_servicio} ${s.cliente?.nombre_cliente || ""} ${s.cliente?.paterno_cliente || ""} ${v.placas_vehiculo || ""} ${v.marca?.nombre_marca || ""} ${v.modelo?.nombre_modelo || ""}`.toLowerCase().includes(q);
  });

  return (
    <View style={styles.screen}>
      <View style={styles.cabecera}>
        <View style={styles.buscador}>
          <Ionicons name="search" size={18} color={colors.ink500} />
          <TextInput style={styles.buscadorInput} placeholder="Cliente, placas, vehículo o # de orden" placeholderTextColor={colors.ink500} value={busqueda} onChangeText={setBusqueda} />
          {busqueda ? <TouchableOpacity onPress={() => setBusqueda("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.ink500} /></TouchableOpacity> : null}
        </View>
        <View style={styles.segmentado}>
          {PESTANAS.map((p) => {
            const activa = pestana === p.clave;
            return (
              <TouchableOpacity key={p.clave || "todas"} style={[styles.segmento, activa && styles.segmentoActivo]} onPress={() => setPestana(p.clave)}>
                <Text style={[styles.segmentoTexto, activa && styles.segmentoTextoActivo]}>{p.etiqueta}</Text>
                <Text style={[styles.segmentoConteo, activa && styles.segmentoTextoActivo]}>{conteo(p.clave)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={(item) => String(item.id_servicio)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await load(); setRefrescando(false); }} tintColor={colors.petrol500} colors={[colors.petrol500]} />}
        renderItem={({ item: s }) => {
          const v = s.vehiculo || {};
          const saldo = s.costos?.saldo_pendiente || 0;
          return (
            <TouchableOpacity style={styles.tarjeta} onPress={() => navigation.navigate("ServicioDetalle", { id: s.id_servicio })} activeOpacity={0.75}>
              <View style={styles.tarjetaTop}>
                <Text style={styles.numero}>#{s.id_servicio}</Text>
                {s.es_garantia && <View style={[styles.chip, { backgroundColor: colors.warn100 }]}><Text style={[styles.chipTexto, { color: colors.warn600 }]}>garantía</Text></View>}
                {s.status === "abierto" && s.etapa ? (
                  <View style={[styles.chip, { backgroundColor: colors.petrol100 }]}><Text style={[styles.chipTexto, { color: colors.petrol600 }]}>{ETAPAS[s.etapa] || s.etapa}</Text></View>
                ) : s.status !== "abierto" ? (
                  <View style={[styles.chip, { backgroundColor: s.status === "cerrado" ? colors.teal100 : colors.red100 }]}>
                    <Text style={[styles.chipTexto, { color: s.status === "cerrado" ? colors.teal600 : colors.red600 }]}>{s.status === "cerrado" ? "finalizada" : s.status}</Text>
                  </View>
                ) : null}
                <Text style={styles.fecha}>{s.fecha_entrada_servicio ? new Date(s.fecha_entrada_servicio).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : ""}</Text>
              </View>
              <Text style={styles.servicio} numberOfLines={1}>{s.nombre_servicio}</Text>
              <View style={styles.fila}>
                <Ionicons name="person-outline" size={14} color={colors.ink500} />
                <Text style={styles.meta} numberOfLines={1}>{s.cliente ? `${s.cliente.nombre_cliente} ${s.cliente.paterno_cliente || ""}` : "—"}</Text>
              </View>
              <View style={styles.fila}>
                <Ionicons name="car-outline" size={14} color={colors.ink500} />
                <Text style={styles.meta} numberOfLines={1}>{[v.marca?.nombre_marca, v.modelo?.nombre_modelo].filter(Boolean).join(" ") || "Vehículo"} · {v.placas_vehiculo || "sin placas"}</Text>
              </View>
              <View style={styles.pie}>
                {hasPermission("servicios.ver_precios") && <Text style={styles.total}>{fmt(s.costos?.total)}</Text>}
                {hasPermission("dashboard.ver_por_cobrar") && (
                  <Text style={[styles.saldo, { color: saldo > 0.005 ? colors.red600 : colors.teal600 }]}>
                    {s.pagado ? "Pagada" : saldo > 0.005 ? `Debe ${fmt(saldo)}` : "Sin cargos"}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Ionicons name="construct-outline" size={36} color={colors.ink500} />
            <Text style={styles.vacioTexto}>{busqueda ? "Ninguna orden coincide." : "No hay órdenes en esta pestaña."}</Text>
          </View>
        }
      />

      {hasPermission("servicios.crear") && (
        <TouchableOpacity style={styles.fabExtendido} onPress={() => navigation.navigate("NuevaOrden", { resetear: Date.now() })}>
          <Ionicons name="add" size={22} color={colors.paper100} />
          <Text style={styles.fabTexto}>Nueva orden</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cabecera: { paddingHorizontal: spacing.lg, paddingVertical: 12, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300, gap: 10 },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper0, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  buscadorInput: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  segmentado: { flexDirection: "row", backgroundColor: colors.paper0, borderRadius: 10, padding: 3 },
  segmento: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8 },
  segmentoActivo: { backgroundColor: colors.petrol500 },
  segmentoTexto: { fontSize: 12.5, fontWeight: "600", color: colors.ink700 },
  segmentoTextoActivo: { color: colors.paper100 },
  segmentoConteo: { fontSize: 11, fontWeight: "700", color: colors.ink500 },
  tarjeta: { backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginBottom: 10, gap: 4 },
  tarjetaTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  numero: { fontFamily: "BarlowCondensed_700Bold", fontSize: 19, color: colors.petrol600 },
  chip: { borderRadius: 100, paddingVertical: 2, paddingHorizontal: 8 },
  chipTexto: { fontSize: 11, fontWeight: "700" },
  fecha: { marginLeft: "auto", fontSize: 12, color: colors.ink500 },
  servicio: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
  fila: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { flex: 1, fontSize: 13, color: colors.ink700 },
  pie: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.ink300 },
  total: { fontFamily: "BarlowCondensed_700Bold", fontSize: 20, color: colors.ink900 },
  saldo: { fontSize: 12.5, fontWeight: "700" },
  vacio: { alignItems: "center", gap: 8, paddingTop: 60 },
  vacioTexto: { fontSize: 14, color: colors.ink500, textAlign: "center" },
  fabExtendido: {
    position: "absolute", right: 18, bottom: 22, flexDirection: "row", alignItems: "center", gap: 6, height: 52, paddingHorizontal: 18, borderRadius: 26,
    backgroundColor: colors.petrol500, elevation: 5, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  fabTexto: { fontSize: 15, fontWeight: "700", color: colors.paper100 },
});
