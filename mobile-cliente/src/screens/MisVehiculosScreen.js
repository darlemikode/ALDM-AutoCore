import { useCallback, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { colors } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { ETAPAS } from "./MisServiciosScreen";

const ETIQUETA = Object.fromEntries(ETAPAS);
const fecha = (f) => (f ? new Date(f).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const km = (n) => (n ? `${Number(n).toLocaleString("es-MX")} km` : "—");

export default function MisVehiculosScreen({ navigation }) {
  const [vehiculos, setVehiculos] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [refrescando, setRefrescando] = useState(false);

  async function cargar() {
    const [v, s] = await Promise.all([api.get("/portal-cliente/mis-vehiculos"), api.get("/portal-cliente/mis-servicios").catch(() => [])]);
    setVehiculos(v || []);
    setServicios(s || []);
  }
  useFocusEffect(useCallback(() => { cargar().catch(() => {}); }, []));

  const irAServicio = (id) => navigation.getParent()?.navigate("Inicio", { screen: "ServicioDetalle", params: { id }, initial: false });
  const agendar = (v) => navigation.getParent()?.navigate("Agendar", { screen: "AgendarCita", params: { vehiculoId: v.id_vehiculo } });

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
      data={vehiculos}
      keyExtractor={(v) => String(v.id_vehiculo)}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar().catch(() => {}); setRefrescando(false); }} tintColor={colors.petrol500} colors={[colors.petrol500]} />}
      ListHeaderComponent={<Text style={styles.resumen}>{vehiculos.length} vehículo{vehiculos.length === 1 ? "" : "s"} registrado{vehiculos.length === 1 ? "" : "s"} en el taller</Text>}
      renderItem={({ item: v }) => {
        const suyos = servicios.filter((s) => s.id_vehiculo === v.id_vehiculo);
        const activo = suyos.find((s) => s.status === "abierto");
        const ultimo = suyos.find((s) => s.status === "cerrado");
        const proximoKm = suyos.map((s) => Number(s.km_proximo_servicio) || 0).find((n) => n > 0);
        const expandido = abierto === v.id_vehiculo;
        return (
          <View style={styles.tarjeta}>
            <TouchableOpacity style={styles.cabecera} onPress={() => setAbierto(expandido ? null : v.id_vehiculo)} activeOpacity={0.8}>
              <View style={styles.icono}><Ionicons name="car-sport" size={22} color={colors.petrol600} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre} numberOfLines={1}>{[v.marca?.nombre_marca, v.modelo?.nombre_modelo].filter(Boolean).join(" ") || "Vehículo"}</Text>
                <Text style={styles.meta}>{[v.id_year_vehiculo, v.color?.nombre_color].filter(Boolean).join(" · ") || "Sin datos de modelo"}</Text>
              </View>
              <View style={styles.placa}><Text style={styles.placaTexto}>{v.placas_vehiculo || "S/P"}</Text></View>
            </TouchableOpacity>

            {activo ? (
              <TouchableOpacity style={styles.enTaller} onPress={() => irAServicio(activo.id_servicio)}>
                <Ionicons name="construct" size={16} color={colors.petrol600} />
                <Text style={styles.enTallerTexto} numberOfLines={1}>En el taller · {ETIQUETA[activo.etapa] || activo.etapa}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.petrol600} />
              </TouchableOpacity>
            ) : null}

            <View style={styles.datos}>
              <Dato etiqueta="Kilometraje" valor={km(v.km_vehiculo)} />
              <Dato etiqueta="Último servicio" valor={ultimo ? fecha(ultimo.fecha_salida_servicio || ultimo.fecha_entrada_servicio) : "—"} />
              <Dato etiqueta="Próximo" valor={proximoKm ? km(proximoKm) : "—"} />
            </View>

            {expandido ? (
              <View style={styles.detalle}>
                <Fila etiqueta="Cuenta" valor={v.numero_cuenta} />
                <Fila etiqueta="No. de serie (VIN)" valor={v.numserie_vehiculo} />
                <Fila etiqueta="Cilindraje" valor={v.cilindraje_vehiculo} />
                {v.comentarios ? <Fila etiqueta="Notas" valor={v.comentarios} /> : null}
                <Text style={styles.subtitulo}>Historial ({suyos.length})</Text>
                {suyos.length ? suyos.map((s) => (
                  <TouchableOpacity key={s.id_servicio} style={styles.historial} onPress={() => irAServicio(s.id_servicio)}>
                    <View style={[styles.punto, { backgroundColor: s.status === "cerrado" ? colors.teal600 : s.status === "abierto" ? colors.petrol500 : colors.ink300 }]} />
                    <Text style={styles.historialTexto} numberOfLines={1}>{s.nombre_servicio}</Text>
                    <Text style={styles.meta}>{fecha(s.fecha_entrada_servicio)}</Text>
                  </TouchableOpacity>
                )) : <Text style={styles.meta}>Aún no hay servicios para este vehículo.</Text>}
              </View>
            ) : null}

            <View style={styles.acciones}>
              <TouchableOpacity style={styles.accion} onPress={() => setAbierto(expandido ? null : v.id_vehiculo)}>
                <Ionicons name={expandido ? "chevron-up" : "information-circle-outline"} size={17} color={colors.ink700} />
                <Text style={styles.accionTexto}>{expandido ? "Ocultar" : "Detalles"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.accion, styles.accionPrimaria]} onPress={() => agendar(v)}>
                <Ionicons name="calendar-outline" size={17} color={colors.petrol600} />
                <Text style={[styles.accionTexto, { color: colors.petrol600 }]}>Agendar servicio</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }}
      ListEmptyComponent={
        <View style={styles.vacio}>
          <Ionicons name="car-outline" size={40} color={colors.ink300} />
          <Text style={styles.vacioTexto}>Todavía no tienes vehículos registrados. El taller los agrega cuando llevas tu auto por primera vez.</Text>
        </View>
      }
    />
  );
}

function Dato({ etiqueta, valor }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
      <Text style={styles.datoValor} numberOfLines={1}>{valor}</Text>
    </View>
  );
}

function Fila({ etiqueta, valor }) {
  return (
    <View style={styles.fila}>
      <Text style={styles.filaEtiqueta}>{etiqueta}</Text>
      <Text style={styles.filaValor} selectable>{valor || "—"}</Text>
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  resumen: { fontSize: 13.5, color: colors.ink500, marginBottom: 12 },
  tarjeta: { backgroundColor: colors.paper100, borderRadius: 16, padding: 16, marginBottom: 12 },
  cabecera: { flexDirection: "row", alignItems: "center", gap: 12 },
  icono: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  nombre: { fontSize: 16.5, fontWeight: "700", color: colors.ink900 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  placa: { borderWidth: 1.5, borderColor: colors.ink700, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  placaTexto: { fontFamily: "BarlowCondensed_700Bold", fontSize: 16, letterSpacing: 1, color: colors.ink900 },
  enTaller: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, backgroundColor: colors.petrol100, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  enTallerTexto: { flex: 1, fontSize: 13.5, fontWeight: "600", color: colors.petrol600 },
  datos: { flexDirection: "row", gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.linea },
  datoEtiqueta: { fontSize: 11, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.4 },
  datoValor: { fontSize: 14, fontWeight: "600", color: colors.ink900, marginTop: 2 },
  detalle: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.linea },
  fila: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 },
  filaEtiqueta: { fontSize: 13.5, color: colors.ink500 },
  filaValor: { fontSize: 13.5, color: colors.ink900, flexShrink: 1, textAlign: "right" },
  subtitulo: { fontSize: 12, fontWeight: "700", color: colors.ink700, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  historial: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  historialTexto: { flex: 1, fontSize: 14, color: colors.ink900 },
  punto: { width: 8, height: 8, borderRadius: 4 },
  acciones: { flexDirection: "row", gap: 8, marginTop: 14 },
  accion: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 10, backgroundColor: colors.paper0 },
  accionPrimaria: { backgroundColor: colors.petrol100 },
  accionTexto: { fontSize: 13.5, fontWeight: "600", color: colors.ink700 },
  vacio: { alignItems: "center", gap: 12, paddingTop: 60, paddingHorizontal: 30 },
  vacioTexto: { fontSize: 14, color: colors.ink500, textAlign: "center" },
});
