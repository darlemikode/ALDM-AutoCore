import { contiene } from "../lib/texto";
import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, RefreshControl, ScrollView, Linking } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import { Ionicons } from "../ui/IconoWeb";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import DomicilioModal from "../components/DomicilioModal";

const PASOS = [
  ["en_proceso", "Recibido"], ["abierto", "En piso"], ["pendiente", "Aprobación"],
  ["espera_refacciones", "Piezas"], ["en_reparacion", "Reparación"], ["listo_entrega", "Listo"],
];
const FILTROS = [["", "Abiertos"], ["pend", "Esperando código"], ["ini", "En servicio"], ["bloq", "Bloqueado"], ["fin", "Finalizados"]];
const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const COLOR_ESTADO = { pend: "#ff6b4a", ini: colors.petrol600, bloq: colors.red600, fin: colors.teal600 };

function enlaceMapa(d) {
  if (d.lat != null && d.lng != null) return `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}`;
  if (d.maps_url) return d.maps_url;
  if (d.direccion) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.direccion)}`;
  return null;
}
function hace(iso) {
  if (!iso) return "";
  const f = new Date(`${iso}${/Z|[+-]\d\d:?\d\d$/.test(iso) ? "" : "Z"}`);
  const min = Math.max(0, Math.round((Date.now() - f.getTime()) / 60000));
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.floor(min / 60)} h`;
  return `hace ${Math.floor(min / 1440)} d`;
}
const estado = (d) => (d.finalizado ? ["fin", "Finalizado"] : d.bloqueado ? ["bloq", "Código bloqueado"] : d.iniciado ? ["ini", "En servicio"] : ["pend", "Esperando código"]);

export default function DomiciliosScreen({ navigation }) {
  const { hasPermission } = useAuth();
  const [lista, setLista] = useState(null);
  const [empleados, setEmpleados] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("");
  const [refrescando, setRefrescando] = useState(false);
  const [abierta, setAbierta] = useState(null);

  const load = useCallback(() => api.get("/servicio-domicilio/lista/abiertas?incluir_finalizados=true").then(setLista).catch(() => setLista((l) => l || [])), []);
  useFocusEffect(useCallback(() => { load(); api.get("/empleados/").then(setEmpleados).catch(() => {}); }, [load]));
  useActualizacionGlobal("servicios", load);

  const nombreMec = useMemo(() => Object.fromEntries(empleados.map((e) => [e.id_empleado, [e.nombre, e.paterno].filter(Boolean).join(" ")])), [empleados]);
  const q = busqueda.trim();
  const base = (lista || []).filter((d) => !q || contiene(`${d.id_servicio} ${d.servicio} ${d.cliente || ""} ${d.direccion || ""} ${d.vehiculo || ""} ${d.placas || ""}`, q));
  const abiertos = base.filter((d) => !d.finalizado);
  const conteo = (k) => (k ? base.filter((d) => estado(d)[0] === k).length : abiertos.length);
  const filtradas = filtro ? base.filter((d) => estado(d)[0] === filtro) : abiertos;
  const abrir = (url) => Linking.openURL(url).catch(() => {});

  return (
    <View style={styles.screen}>
      <View style={styles.cabecera}>
        <View style={styles.buscador}>
          {!busqueda ? <Ionicons name="search-outline" size={18} color={colors.ink500} /> : null}
          <TextInput style={styles.buscadorInput} placeholder="Orden, cliente, vehículo, placas o dirección" placeholderTextColor={colors.ink500} value={busqueda} onChangeText={setBusqueda} />
          {busqueda ? <TouchableOpacity onPress={() => setBusqueda("")} hitSlop={8}><Ionicons name="close-circle-outline" size={18} color={colors.ink500} /></TouchableOpacity> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtros}>
          {FILTROS.map(([k, t]) => {
            const activo = filtro === k;
            return (
              <TouchableOpacity key={k || "abiertos"} style={[styles.filtro, activo && styles.filtroActivo]} onPress={() => setFiltro(k)}>
                <Text style={[styles.filtroTexto, activo && styles.filtroTextoActivo]}>{t}</Text>
                <Text style={[styles.filtroConteo, activo && styles.filtroTextoActivo]}>{conteo(k)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtradas}
        keyExtractor={(d) => String(d.id_servicio)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await load(); setRefrescando(false); }} tintColor={colors.petrol500} colors={[colors.petrol500]} />}
        renderItem={({ item: d }) => {
          const [cls, txt] = estado(d);
          const idx = d.finalizado ? PASOS.length - 1 : Math.max(0, PASOS.findIndex(([k]) => k === d.etapa));
          const mapa = enlaceMapa(d);
          const mec = nombreMec[d.id_empleado_mecanico];
          const col = COLOR_ESTADO[cls];
          return (
            <View style={[styles.tarjeta, { borderLeftColor: col }]}>
              <View style={styles.top}>
                <Text style={styles.numero}>#{d.id_servicio}</Text>
                <Text style={styles.hace}>{hace(d.fecha)}</Text>
                <View style={[styles.chip, { backgroundColor: col }]}><Text style={styles.chipTexto}>{txt}</Text></View>
              </View>
              <Text style={styles.servicio} numberOfLines={1}>{d.servicio}</Text>
              <View style={styles.fila}><Ionicons name="person-outline" size={14} color={colors.ink500} /><Text style={styles.meta} numberOfLines={1}>{d.cliente || "Sin cliente"}</Text></View>
              {(d.vehiculo || d.placas) ? (
                <View style={styles.fila}><Ionicons name="car-outline" size={14} color={colors.ink500} /><Text style={styles.meta} numberOfLines={1}>{d.vehiculo || "Vehículo"}{d.placas ? ` · ${d.placas}` : ""}</Text></View>
              ) : null}
              <View style={styles.fila}><Ionicons name="location-outline" size={14} color={colors.ink500} /><Text style={styles.meta} numberOfLines={2}>{d.direccion || "Ubicación por mapa"}</Text></View>
              <View style={styles.fila}><Ionicons name="construct-outline" size={14} color={colors.ink500} /><Text style={[styles.meta, !mec && { fontStyle: "italic" }]} numberOfLines={1}>{mec || "Sin mecánico asignado"}</Text></View>

              <View style={styles.avance}>
                <View style={styles.barra}>{PASOS.map(([k], i) => <View key={k} style={[styles.seg, i < idx && { backgroundColor: colors.teal600 }, i === idx && { backgroundColor: colors.petrol500 }]} />)}</View>
                <Text style={styles.avanceTxt}>{d.finalizado ? (d.total != null ? `Entregado · ${fmt(d.total)}` : "Entregado") : d.iniciado ? PASOS[idx][1] : "Sin iniciar"}</Text>
              </View>

              {!d.finalizado && hasPermission("servicios.editar") ? (
                <TouchableOpacity style={styles.btnCodigo} onPress={() => setAbierta(d)}>
                  <Ionicons name="key-outline" size={17} color={colors.sobreAcento} /><Text style={styles.btnCodigoTxt}>Código y enlace</Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.pie}>
                <TouchableOpacity style={[styles.btnSec, { flex: 1 }]} onPress={() => navigation.navigate("ServicioDetalle", { id: d.id_servicio })}>
                  <Text style={styles.btnSecTxt}>Ver orden</Text>
                </TouchableOpacity>
                {mapa ? (
                  <TouchableOpacity style={[styles.btnSec, { flex: 1, flexDirection: "row", gap: 6 }]} onPress={() => abrir(mapa)}>
                    <Ionicons name="map-outline" size={16} color={colors.petrol600} /><Text style={styles.btnSecTxt}>{d.finalizado ? "Ver ubicación" : "Mapa"}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Ionicons name="location-outline" size={44} color="#ff6b4a" />
            <Text style={styles.vacioTexto}>{lista === null ? "Cargando…" : "No hay servicios a domicilio en esta vista."}</Text>
          </View>
        }
      />

      {hasPermission("servicios.crear") && (
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("NuevaOrden", { resetear: Date.now(), domicilio: Date.now() })}>
          <Ionicons name="add-outline" size={22} color={colors.sobreAcento} />
          <Text style={styles.fabTexto}>Nuevo a domicilio</Text>
        </TouchableOpacity>
      )}

      <DomicilioModal
        visible={!!abierta}
        idServicio={abierta?.id_servicio}
        nombreServicio={abierta?.servicio}
        empleados={empleados}
        onCerrar={() => setAbierta(null)}
        onCambio={load}
      />
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cabecera: { paddingTop: 12, paddingBottom: 10, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300, gap: 10 },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper0, borderRadius: 12, paddingHorizontal: 12, height: 46, marginHorizontal: spacing.lg },
  buscadorInput: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  filtros: { paddingHorizontal: spacing.lg, gap: 8 },
  filtro: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 100, backgroundColor: colors.paper0 },
  filtroActivo: { backgroundColor: colors.petrol500 },
  filtroTexto: { fontSize: 13, fontWeight: "600", color: colors.ink700 },
  filtroTextoActivo: { color: colors.sobreAcento },
  filtroConteo: { fontSize: 12, fontWeight: "700", color: colors.ink500 },
  tarjeta: { backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginBottom: 10, gap: 5, borderLeftWidth: 4 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  numero: { fontFamily: "BarlowCondensed_700Bold", fontSize: 19, color: colors.petrol600 },
  hace: { fontSize: 12, color: colors.ink500, flex: 1 },
  chip: { borderRadius: 100, paddingVertical: 2, paddingHorizontal: 9 },
  chipTexto: { fontSize: 11, fontWeight: "700", color: "#fff" },
  servicio: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
  fila: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { flex: 1, fontSize: 13, color: colors.ink700 },
  avance: { marginTop: 6, gap: 4 },
  barra: { flexDirection: "row", gap: 3 },
  seg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.ink300 },
  avanceTxt: { fontSize: 12, color: colors.ink500, fontWeight: "600" },
  btnCodigo: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 10, backgroundColor: colors.petrol500, marginTop: 8 },
  btnCodigoTxt: { fontSize: 15, fontWeight: "700", color: colors.sobreAcento },
  pie: { flexDirection: "row", gap: 8, marginTop: 8 },
  btnSec: { height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.petrol100 },
  btnSecTxt: { fontSize: 14, fontWeight: "700", color: colors.petrol600 },
  vacio: { alignItems: "center", gap: 8, paddingTop: 60 },
  vacioTexto: { fontSize: 14, color: colors.ink500, textAlign: "center" },
  fab: {
    position: "absolute", right: 18, bottom: 22, flexDirection: "row", alignItems: "center", gap: 6, height: 52, paddingHorizontal: 18, borderRadius: 26,
    backgroundColor: colors.petrol500, elevation: 5, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  fabTexto: { fontSize: 15, fontWeight: "700", color: colors.sobreAcento },
});
