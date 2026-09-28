import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { abrirOrdenDeVehiculo, irAServicio } from "../navigation/irAOrden";
import { alerta } from "../ui/Dialogo";

const ESTADOS = [
  ["pendiente", "Pendientes", "time-outline"],
  ["confirmada", "Confirmadas", "checkmark-circle-outline"],
  ["rechazada", "Rechazadas", "close-circle-outline"],
  ["todas", "Todas", "list-outline"],
];
const TONO = { pendiente: ["petrol100", "petrol600"], confirmada: ["teal100", "teal600"], rechazada: ["red100", "red600"] };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Mismo flujo que web-admin/src/pages/Citas.jsx + atajo para abrir la orden cuando el cliente llega
export default function CitasScreen({ navigation }) {
  const { hasPermission } = useAuth();
  const [estado, setEstado] = useState("pendiente");
  const [citas, setCitas] = useState([]);
  const [conteo, setConteo] = useState({});
  const [refrescando, setRefrescando] = useState(false);
  const puedeResolver = hasPermission("servicios.crear");

  async function cargar() {
    const [data, todas] = await Promise.all([api.get(`/citas/?estado=${estado}`), api.get("/citas/?estado=todas").catch(() => [])]);
    setCitas(data || []);
    const c = { todas: (todas || []).length };
    for (const x of todas || []) c[x.estado] = (c[x.estado] || 0) + 1;
    setConteo(c);
  }
  useFocusEffect(useCallback(() => { cargar().catch(() => setCitas([])); }, [estado])); // eslint-disable-line react-hooks/exhaustive-deps
  useActualizacionGlobal("citas", () => cargar().catch(() => {}));

  function resolver(cita, accion) {
    const nombre = `${cita.cliente?.nombre_cliente || ""} ${cita.cliente?.paterno_cliente || ""}`.trim();
    alerta(accion === "confirmar" ? "Confirmar cita" : "Rechazar cita",
      accion === "confirmar" ? `Se le avisará a ${nombre} que su cita quedó confirmada.` : `Se le avisará a ${nombre} que no se pudo agendar.`,
      [{ text: "Cancelar", style: "cancel" }, {
        text: accion === "confirmar" ? "Confirmar" : "Rechazar", style: accion === "rechazar" ? "destructive" : "default",
        onPress: async () => {
          try { await api.put(`/citas/${cita.id_cita}/${accion}`); await cargar(); } catch (err) { alerta("Error", err.message); }
        },
      }]);
  }

  function abrirOrden(c) {
    if (c.vehiculo) abrirOrdenDeVehiculo(navigation, c.cliente, c.vehiculo);
    else irAServicio(navigation, "NuevaOrden", { resetear: Date.now() });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.filtros}>
        {ESTADOS.map(([k, t, icono]) => {
          const activo = estado === k;
          return (
            <TouchableOpacity key={k} style={[styles.filtro, activo && styles.filtroActivo]} onPress={() => setEstado(k)}>
              <Ionicons name={icono} size={16} color={activo ? colors.petrol600 : colors.ink500} />
              <Text style={[styles.filtroTexto, activo && styles.filtroTextoActivo]}>{t}</Text>
              {conteo[k] ? <Text style={[styles.filtroConteo, activo && styles.filtroTextoActivo]}>{conteo[k]}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={citas}
        keyExtractor={(item) => String(item.id_cita)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar().catch(() => {}); setRefrescando(false); }} tintColor={colors.petrol500} colors={[colors.petrol500]} />}
        ListHeaderComponent={<Text style={styles.intro}>Lo que los clientes piden desde su app — tú decides si se confirma.</Text>}
        renderItem={({ item: c }) => {
          const f = c.fecha_propuesta ? new Date(c.fecha_propuesta) : null;
          const [fondo, frente] = TONO[c.estado] || ["paper0", "ink500"];
          const v = c.vehiculo;
          return (
            <View style={styles.tarjeta}>
              <View style={styles.fila}>
                <View style={[styles.fecha, { backgroundColor: colors[fondo] }]}>
                  {f ? (
                    <>
                      <Text style={[styles.fechaDia, { color: colors[frente] }]}>{f.getDate()}</Text>
                      <Text style={[styles.fechaMes, { color: colors[frente] }]}>{MESES[f.getMonth()]}</Text>
                    </>
                  ) : <Ionicons name="calendar-outline" size={20} color={colors[frente]} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre} numberOfLines={1}>{c.cliente?.nombre_cliente} {c.cliente?.paterno_cliente}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {v ? [v.marca?.nombre_marca, v.modelo?.nombre_modelo, v.placas_vehiculo].filter(Boolean).join(" · ") : "Sin vehículo especificado"}
                  </Text>
                  <Text style={styles.meta}>{f ? f.toLocaleString("es-MX", { weekday: "long", hour: "2-digit", minute: "2-digit" }) : "Sin fecha preferida"}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: colors[fondo] }]}><Text style={[styles.badgeTexto, { color: colors[frente] }]}>{c.estado}</Text></View>
              </View>
              {c.descripcion ? <Text style={styles.descripcion}>{c.descripcion}</Text> : null}
              <Text style={styles.pie}>
                Solicitada {new Date(c.fecha_creacion).toLocaleDateString("es-MX")}{c.confirmada_por ? ` · resolvió @${c.confirmada_por}` : ""}{c.cliente?.telefono1 ? ` · ${c.cliente.telefono1}` : ""}
              </Text>
              {puedeResolver && c.estado === "pendiente" ? (
                <View style={styles.acciones}>
                  <TouchableOpacity style={styles.botonRechazar} onPress={() => resolver(c, "rechazar")}>
                    <Ionicons name="close" size={17} color={colors.red600} /><Text style={styles.botonRechazarTexto}>Rechazar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.botonConfirmar} onPress={() => resolver(c, "confirmar")}>
                    <Ionicons name="checkmark" size={17} color={colors.paper100} /><Text style={styles.botonConfirmarTexto}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {puedeResolver && c.estado === "confirmada" && !c.id_servicio_generado ? (
                <TouchableOpacity style={styles.botonOrden} onPress={() => abrirOrden(c)}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.petrol600} /><Text style={styles.botonOrdenTexto}>Llegó el cliente · abrir orden</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Ionicons name="calendar-clear-outline" size={38} color={colors.ink500} />
            <Text style={styles.vacioTexto}>No hay citas {estado !== "todas" ? `${ESTADOS.find((e) => e[0] === estado)[1].toLowerCase()}` : ""}.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  filtros: { flexDirection: "row", gap: 6, padding: 10, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  filtro: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 8, borderRadius: 10 },
  filtroActivo: { backgroundColor: colors.petrol100 },
  filtroTexto: { fontSize: 11.5, fontWeight: "600", color: colors.ink500 },
  filtroTextoActivo: { color: colors.petrol600 },
  filtroConteo: { fontSize: 11, fontWeight: "700", color: colors.ink500 },
  intro: { fontSize: 13, color: colors.ink700, marginBottom: 12 },
  tarjeta: { backgroundColor: colors.paper100, borderRadius: 14, padding: 14, marginBottom: 10 },
  fila: { flexDirection: "row", alignItems: "center", gap: 12 },
  fecha: { width: 50, height: 54, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  fechaDia: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24, lineHeight: 26 },
  fechaMes: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  nombre: { fontSize: 15.5, fontWeight: "700", color: colors.ink900 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  badge: { borderRadius: 100, paddingVertical: 3, paddingHorizontal: 9, alignSelf: "flex-start" },
  badgeTexto: { fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  descripcion: { fontSize: 14, color: colors.ink900, marginTop: 10, lineHeight: 20 },
  pie: { fontSize: 12, color: colors.ink700, marginTop: 8 },
  acciones: { flexDirection: "row", gap: 8, marginTop: 12 },
  botonRechazar: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 11, backgroundColor: colors.red100 },
  botonRechazarTexto: { fontSize: 14, fontWeight: "600", color: colors.red600 },
  botonConfirmar: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 11, backgroundColor: colors.petrol500 },
  botonConfirmarTexto: { fontSize: 14, fontWeight: "600", color: colors.paper100 },
  botonOrden: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 11, marginTop: 12, backgroundColor: colors.petrol100 },
  botonOrdenTexto: { fontSize: 14, fontWeight: "600", color: colors.petrol600 },
  vacio: { alignItems: "center", gap: 8, paddingTop: 50 },
  vacioTexto: { fontSize: 14, color: colors.ink500 },
});
