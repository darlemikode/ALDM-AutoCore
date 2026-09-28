import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { EstadoBadge, Seccion, Tarjeta, Vacio, fmt, fmtCorto, fmtFecha, useCargar } from "../ui/comunes";

function Kpi({ icono, valor, etiqueta, tono = "petrol600", onPress }) {
  return (
    <TouchableOpacity style={styles.kpi} onPress={onPress} disabled={!onPress} activeOpacity={0.8}>
      <Ionicons name={icono} size={18} color={colors[tono]} />
      <Text style={styles.kpiValor}>{valor}</Text>
      <Text style={styles.kpiEtiqueta}>{etiqueta}</Text>
    </TouchableOpacity>
  );
}

export default function InicioScreen({ navigation }) {
  const { usuario } = useAuth();
  const { datos: r, recargar, refrescando } = useCargar(() => api.get("/superadmin/resumen"));
  const irTalleres = (filtro) => navigation.navigate("TalleresTab", { screen: "Talleres", params: { filtro } });

  if (!r) return <View style={styles.screen} />;
  const maxMes = Math.max(1, ...r.ingresos_por_mes.map((m) => m.ingresos));
  const cambio = r.ingresos_mes_anterior > 0 ? ((r.ingresos_mes - r.ingresos_mes_anterior) / r.ingresos_mes_anterior) * 100 : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => recargar(true)} />}>
      <Text style={styles.saludo}>Hola, {usuario?.nombre_completo?.split(" ")[0] || usuario?.username}</Text>

      <View style={styles.hero}>
        <Text style={styles.heroEtiqueta}>COBRADO ESTE MES</Text>
        <Text style={[styles.heroMonto, { color: colors.petrol300 }]} numberOfLines={1} adjustsFontSizeToFit>{fmt(r.ingresos_mes)}</Text>
        <Text style={styles.heroSub}>
          {cambio === null ? "Sin cobros el mes pasado" : `${cambio >= 0 ? "▲" : "▼"} ${Math.abs(cambio).toFixed(0)}% vs. mes pasado (${fmt(r.ingresos_mes_anterior)})`}
        </Text>
        <View style={styles.heroFila}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroDatoValor, { color: colors.sidebarTexto }]}>{fmt(r.ingreso_mensual_recurrente)}</Text>
            <Text style={styles.heroDatoTexto}>ingreso mensual recurrente</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroDatoValor, { color: colors.sidebarTexto }]}>{r.vigentes}</Text>
            <Text style={styles.heroDatoTexto}>talleres vigentes</Text>
          </View>
        </View>
      </View>

      <View style={styles.grid}>
        <Kpi icono="flask-outline" valor={r.en_prueba} etiqueta="En prueba" tono="blue600" onPress={() => irTalleres("prueba")} />
        <Kpi icono="alarm-outline" valor={r.por_vencer} etiqueta="Por vencer" tono="warn600" onPress={() => irTalleres("por_vencer")} />
        <Kpi icono="time-outline" valor={r.en_gracia} etiqueta="En gracia" tono="warn600" onPress={() => irTalleres("gracia")} />
        <Kpi icono="alert-circle-outline" valor={r.vencidos} etiqueta="Vencidos" tono="red600" onPress={() => irTalleres("vencida")} />
        <Kpi icono="pause-circle-outline" valor={r.suspendidos} etiqueta="Suspendidos" tono="ink700" onPress={() => irTalleres("suspendida")} />
        <Kpi icono="business-outline" valor={r.total_talleres} etiqueta="Talleres" onPress={() => irTalleres(null)} />
      </View>

      <Seccion titulo="Cobrado por mes" />
      <Tarjeta>
        <View style={styles.grafica}>
          {r.ingresos_por_mes.map((m, i) => {
            const actual = i === r.ingresos_por_mes.length - 1;
            return (
              <View key={m.mes} style={styles.columna}>
                <Text style={[styles.columnaValor, actual && { color: colors.petrol600 }]} numberOfLines={1}>{m.ingresos ? fmtCorto(m.ingresos) : ""}</Text>
                <View style={styles.columnaRiel}>
                  <View style={[styles.columnaBarra, { height: `${Math.max(3, (m.ingresos / maxMes) * 100)}%`, backgroundColor: actual ? colors.petrol500 : colors.petrol300 }]} />
                </View>
                <Text style={styles.columnaMes}>{m.mes.split(" ")[0]}</Text>
              </View>
            );
          })}
        </View>
      </Tarjeta>

      <Seccion titulo="Próximos vencimientos" accion="Ver talleres" onAccion={() => irTalleres(null)} />
      {r.proximos_vencimientos.length === 0 ? <Vacio texto="No hay vencimientos próximos." icono="calendar-outline" /> : (
        <Tarjeta style={{ paddingVertical: 4 }}>
          {r.proximos_vencimientos.map((v, i) => (
            <TouchableOpacity key={v.id_taller} style={[styles.venc, i > 0 && styles.divisor]} onPress={() => navigation.navigate("TalleresTab", { screen: "TallerDetalle", params: { id: v.id_taller }, initial: false })}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vencNombre} numberOfLines={1}>{v.nombre_comercial}</Text>
                <Text style={styles.vencSub}>
                  {fmtFecha(v.fecha_vencimiento)} · {v.dias_restantes < 0 ? `venció hace ${-v.dias_restantes} día(s)` : v.dias_restantes === 0 ? "vence hoy" : `en ${v.dias_restantes} día(s)`}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <EstadoBadge estado={v.estado} />
                <Text style={styles.vencMonto}>{fmt(v.precio_periodo)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </Tarjeta>
      )}

      <Seccion titulo="Talleres por paquete" />
      <Tarjeta>
        {Object.keys(r.talleres_por_paquete).length === 0 ? <Text style={styles.vencSub}>Sin talleres vigentes.</Text> :
          Object.entries(r.talleres_por_paquete).map(([nombre, n]) => (
            <View key={nombre} style={styles.paquete}>
              <Text style={styles.paqueteNombre}>{nombre}</Text>
              <View style={styles.paqueteRiel}><View style={[styles.paqueteBarra, { width: `${(n / Math.max(1, r.vigentes)) * 100}%` }]} /></View>
              <Text style={styles.paqueteN}>{n}</Text>
            </View>
          ))}
      </Tarjeta>

      <View style={styles.pie}>
        <Text style={styles.pieTexto}>{r.usuarios_totales} usuarios activos · {r.ordenes_mes_total} órdenes este mes en todos los talleres</Text>
        {r.para_depurar > 0 ? <Text style={[styles.pieTexto, { color: colors.red600 }]}>{r.para_depurar} taller(es) ya pasaron su tiempo de conservación de datos.</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  saludo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 28, color: colors.ink900, marginBottom: 12 },
  hero: { backgroundColor: colors.sidebarBg, borderRadius: 18, padding: 20, marginBottom: 14 },
  heroEtiqueta: { fontSize: 11.5, fontWeight: "700", letterSpacing: 1.3, color: colors.sidebarTextoTenue },
  heroMonto: { fontFamily: "BarlowCondensed_700Bold", fontSize: 44 },
  heroSub: { fontSize: 12.5, color: colors.sidebarTextoTenue },
  heroFila: { flexDirection: "row", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)", gap: 12 },
  heroDatoValor: { fontFamily: "BarlowCondensed_700Bold", fontSize: 22 },
  heroDatoTexto: { fontSize: 11.5, color: colors.sidebarTextoTenue },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 6 },
  kpi: { width: "31%", flexGrow: 1, backgroundColor: colors.paper100, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.ink300, gap: 2 },
  kpiValor: { fontFamily: "BarlowCondensed_700Bold", fontSize: 26, color: colors.ink900 },
  kpiEtiqueta: { fontSize: 12, color: colors.ink700 },
  grafica: { flexDirection: "row", height: 150, gap: 8, alignItems: "flex-end" },
  columna: { flex: 1, alignItems: "center", height: "100%" },
  columnaValor: { fontSize: 10.5, color: colors.ink700, height: 16 },
  columnaRiel: { flex: 1, width: "70%", justifyContent: "flex-end" },
  columnaBarra: { width: "100%", borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  columnaMes: { fontSize: 11.5, color: colors.ink700, marginTop: 4 },
  venc: { flexDirection: "row", alignItems: "center", paddingVertical: 11, gap: 10 },
  divisor: { borderTopWidth: 1, borderTopColor: colors.ink300 },
  vencNombre: { fontSize: 14.5, fontWeight: "700", color: colors.ink900 },
  vencSub: { fontSize: 12.5, color: colors.ink700, marginTop: 2 },
  vencMonto: { fontSize: 12.5, fontWeight: "700", color: colors.ink900 },
  paquete: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  paqueteNombre: { width: 100, fontSize: 13.5, fontWeight: "600", color: colors.ink900 },
  paqueteRiel: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.paper0, overflow: "hidden" },
  paqueteBarra: { height: "100%", backgroundColor: colors.petrol500, borderRadius: 5 },
  paqueteN: { width: 28, textAlign: "right", fontWeight: "700", color: colors.ink900 },
  pie: { marginTop: 10, gap: 4 },
  pieTexto: { fontSize: 12, color: colors.ink700, textAlign: "center" },
});
