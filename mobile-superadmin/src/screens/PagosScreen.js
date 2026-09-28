import { useMemo, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ScrollView } from "react-native";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { Badge, Vacio, fmt, fmtFecha, useCargar } from "../ui/comunes";

const NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function ultimosMeses(n) {
  const hoy = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { clave: iso(d), etiqueta: `${NOMBRES[d.getMonth()]} ${d.getFullYear()}`, desde: iso(d), hasta: iso(fin) };
  });
}

export default function PagosScreen({ navigation }) {
  const meses = useMemo(() => ultimosMeses(12), []);
  const [mes, setMes] = useState(meses[0]);
  const { datos, recargar, refrescando } = useCargar(() => api.get(`/superadmin/pagos?desde=${mes.desde}&hasta=${mes.hasta}`), [mes.clave]);
  const total = (datos || []).reduce((a, p) => a + (p.monto || 0), 0);

  return (
    <View style={styles.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, padding: spacing.lg, paddingBottom: 6 }}>
        {meses.map((m) => (
          <TouchableOpacity key={m.clave} style={[styles.chip, mes.clave === m.clave && styles.chipActivo]} onPress={() => setMes(m)}>
            <Text style={[styles.chipTexto, mes.clave === m.clave && styles.chipTextoActivo]}>{m.etiqueta}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.total}>
        <Text style={styles.totalEtiqueta}>Cobrado en {mes.etiqueta.toLowerCase()}</Text>
        <Text style={[styles.totalMonto, { color: colors.petrol300 }]}>{fmt(total)}</Text>
        <Text style={styles.totalSub}>{(datos || []).length} pago(s)</Text>
      </View>
      <FlatList
        data={datos || []}
        keyExtractor={(p) => String(p.id_pago)}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => recargar(true)} />}
        ListEmptyComponent={datos ? <Vacio texto="No hay pagos en este mes." icono="cash-outline" /> : null}
        renderItem={({ item: p }) => (
          <TouchableOpacity style={styles.item} onPress={() => navigation.navigate("TalleresTab", { screen: "TallerDetalle", params: { id: p.id_taller }, initial: false })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre} numberOfLines={1}>{p.taller?.nombre_comercial}</Text>
              <Text style={styles.sub}>{fmtFecha(p.fecha_pago)} · {p.metodo_pago || "—"}{p.registrado_por ? ` · por ${p.registrado_por}` : ""}</Text>
              {p.periodo_desde ? <Text style={styles.sub}>Cubre {fmtFecha(p.periodo_desde)} – {fmtFecha(p.periodo_hasta)}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={styles.monto}>{fmt(p.monto)}</Text>
              {p.tipo_cobro ? <Badge texto={p.tipo_cobro.nombre} /> : null}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  chip: { borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300 },
  chipActivo: { backgroundColor: colors.petrol600, borderColor: colors.petrol600 },
  chipTexto: { fontSize: 13, fontWeight: "600", color: colors.ink700 },
  chipTextoActivo: { color: colors.paper100 },
  total: { marginHorizontal: spacing.lg, marginVertical: 10, backgroundColor: colors.sidebarBg, borderRadius: 16, padding: 16 },
  totalEtiqueta: { fontSize: 12, color: colors.sidebarTextoTenue, fontWeight: "600" },
  totalMonto: { fontFamily: "BarlowCondensed_700Bold", fontSize: 36 },
  totalSub: { fontSize: 12, color: colors.sidebarTextoTenue },
  item: { flexDirection: "row", gap: 10, backgroundColor: colors.paper100, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.ink300 },
  nombre: { fontSize: 15, fontWeight: "700", color: colors.ink900 },
  sub: { fontSize: 12, color: colors.ink700, marginTop: 2 },
  monto: { fontSize: 15, fontWeight: "800", color: colors.ink900 },
});
