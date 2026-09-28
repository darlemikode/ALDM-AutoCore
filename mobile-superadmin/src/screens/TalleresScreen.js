import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, RefreshControl, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { EstadoBadge, Fab, Vacio, fmt, fmtFecha, useCargar } from "../ui/comunes";

const FILTROS = [
  [null, "Todos"], ["prueba", "En prueba"], ["activa", "Activos"], ["por_vencer", "Por vencer"],
  ["gracia", "En gracia"], ["vencida", "Vencidos"], ["suspendida", "Suspendidos"],
];

function coincide(t, filtro) {
  const e = t.estado?.estado;
  if (!filtro) return true;
  if (filtro === "por_vencer") return (e === "activa" || e === "prueba") && t.estado?.dias_restantes != null && t.estado.dias_restantes <= 7;
  if (filtro === "suspendida") return e === "suspendida" || e === "cancelada";
  return e === filtro;
}

export default function TalleresScreen({ navigation, route }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState(route.params?.filtro ?? null);
  useEffect(() => { if (route.params && "filtro" in route.params) setFiltro(route.params.filtro); }, [route.params?.filtro]);
  const { datos, recargar, refrescando } = useCargar(() => api.get("/superadmin/talleres"));

  const lista = useMemo(() => (datos || []).filter((t) => {
    const texto = `${t.nombre_comercial} ${t.codigo || ""} ${t.contacto_nombre || ""} ${t.ciudad || ""}`.toLowerCase();
    return coincide(t, filtro) && (!q || texto.includes(q.toLowerCase()));
  }), [datos, q, filtro]);

  return (
    <View style={styles.screen}>
      <View style={styles.cabecera}>
        <View style={styles.buscador}>
          <Ionicons name="search" size={18} color={colors.ink500} />
          <TextInput style={styles.buscadorInput} value={q} onChangeText={setQ} placeholder="Nombre, código, contacto o ciudad" placeholderTextColor={colors.ink500} />
          {q ? <TouchableOpacity onPress={() => setQ("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.ink500} /></TouchableOpacity> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
          {FILTROS.map(([v, t]) => (
            <TouchableOpacity key={String(v)} style={[styles.chip, filtro === v && styles.chipActivo]} onPress={() => setFiltro(v)}>
              <Text style={[styles.chipTexto, filtro === v && styles.chipTextoActivo]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={lista}
        keyExtractor={(t) => String(t.id_taller)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => recargar(true)} />}
        ListEmptyComponent={datos ? <Vacio texto="No hay talleres con este filtro." icono="business-outline" /> : null}
        renderItem={({ item: t }) => (
          <TouchableOpacity style={styles.item} onPress={() => navigation.navigate("TallerDetalle", { id: t.id_taller })} activeOpacity={0.8}>
            <View style={styles.itemFila}>
              <Text style={styles.nombre} numberOfLines={1}>{t.nombre_comercial}</Text>
              <EstadoBadge estado={t.estado?.estado} />
            </View>
            <Text style={styles.sub} numberOfLines={1}>{[t.codigo, t.suscripcion?.paquete?.nombre, t.suscripcion?.tipo_cobro?.nombre].filter(Boolean).join(" · ")}</Text>
            <View style={styles.itemFila}>
              <Text style={styles.meta}>
                {t.suscripcion?.fecha_vencimiento ? `Vence ${fmtFecha(t.suscripcion.fecha_vencimiento)}` : "Sin vencimiento"}
                {t.estado?.dias_restantes != null && t.estado.dias_restantes >= 0 && t.estado.dias_restantes <= 7 ? ` · ${t.estado.dias_restantes} día(s)` : ""}
              </Text>
              {t.precio_periodo != null ? <Text style={styles.precio}>{fmt(t.precio_periodo)}</Text> : null}
            </View>
            {t.pendiente_activacion ? <Text style={styles.pendiente}>Pendiente de activar: el dueño aún no registra su usuario</Text> : null}
            <Text style={styles.uso}>{t.uso?.usuarios_activos || 0} usuarios · {t.uso?.clientes || 0} clientes · {t.uso?.ordenes_mes || 0} órdenes este mes</Text>
          </TouchableOpacity>
        )}
      />
      <Fab etiqueta="Nuevo taller" onPress={() => navigation.navigate("TallerForm", {})} />
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cabecera: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper100, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: colors.ink300 },
  buscadorInput: { flex: 1, fontSize: 14.5, color: colors.ink900 },
  chip: { borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300 },
  chipActivo: { backgroundColor: colors.petrol600, borderColor: colors.petrol600 },
  chipTexto: { fontSize: 13, fontWeight: "600", color: colors.ink700 },
  chipTextoActivo: { color: colors.paper100 },
  item: { backgroundColor: colors.paper100, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.ink300, gap: 4 },
  itemFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  nombre: { flex: 1, fontSize: 15.5, fontWeight: "700", color: colors.ink900 },
  sub: { fontSize: 12.5, color: colors.ink700 },
  meta: { fontSize: 12.5, color: colors.ink700 },
  precio: { fontSize: 13.5, fontWeight: "700", color: colors.ink900 },
  uso: { fontSize: 11.5, color: colors.ink500 },
  pendiente: { fontSize: 12, fontWeight: "700", color: colors.warn600 },
});
