import { useCallback, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import FotoGaleria from "../components/FotoGaleria";
import { crearEstilos } from "../ui/estilos";
import { alerta, mostrarDialogo } from "../ui/Dialogo";

export default function VehiculosScreen({ navigation }) {
  const { hasPermission } = useAuth();
  const [q, setQ] = useState("");
  const [vehiculos, setVehiculos] = useState([]);
  const [abiertoId, setAbiertoId] = useState(null);
  const [refrescando, setRefrescando] = useState(false);

  const load = () => api.get("/vehiculos/").then(setVehiculos).catch(() => {});
  useFocusEffect(useCallback(() => { load(); }, []));

  function confirmarEliminar(v) {
    mostrarDialogo({
      tono: "peligro",
      titulo: "Eliminar vehículo",
      mensaje: `¿Eliminar ${[v.marca?.nombre_marca, v.modelo?.nombre_modelo].filter(Boolean).join(" ") || "este vehículo"} (${v.placas_vehiculo || v.numero_cuenta})? Solo se puede si no tiene órdenes de servicio en su historial.`,
      acciones: [
        { texto: "Cancelar", tipo: "secundario" },
        {
          texto: "Eliminar",
          tipo: "peligro",
          onPress: async () => {
            try {
              await api.del(`/vehiculos/${v.id_vehiculo}`);
              setAbiertoId(null);
              await load();
              alerta("Listo", "Vehículo eliminado.");
            } catch (err) {
              alerta("No se pudo eliminar", err.message);
            }
          },
        },
      ],
    });
  }

  async function cambiarEstado(v, nuevoEstado) {
    try {
      await api.put(`/vehiculos/${v.id_vehiculo}`, {
        id_cliente: v.id_cliente,
        placas_vehiculo: v.placas_vehiculo,
        id_marca_vehiculo: v.id_marca_vehiculo,
        id_modelo_vehiculo: v.id_modelo_vehiculo,
        id_color: v.id_color,
        numserie_vehiculo: v.numserie_vehiculo,
        id_year_vehiculo: v.id_year_vehiculo,
        cilindraje_vehiculo: v.cilindraje_vehiculo,
        km_vehiculo: v.km_vehiculo,
        comentarios: v.comentarios,
        estado_vehiculo: nuevoEstado,
      });
      await load();
    } catch (err) {
      alerta("Error", err.message);
    }
  }

  const t = q.trim().toLowerCase();
  const filtrados = vehiculos.filter((v) => !t || [v.placas_vehiculo, v.numero_cuenta, v.numserie_vehiculo, v.marca?.nombre_marca, v.modelo?.nombre_modelo, v.cliente?.nombre_cliente]
    .some((x) => String(x || "").toLowerCase().includes(t)));

  return (
    <View style={styles.screen}>
      <View style={styles.cabecera}>
        <View style={styles.buscador}>
          <Ionicons name="search" size={18} color={colors.ink500} />
          <TextInput style={styles.buscadorInput} placeholder="Placas, marca, modelo, VIN o dueño" placeholderTextColor={colors.ink500} value={q} onChangeText={setQ} />
        </View>
        <Text style={styles.contador}>{filtrados.length} de {vehiculos.length} vehículo(s)</Text>
      </View>
      <FlatList
        data={filtrados}
        keyExtractor={(v) => String(v.id_vehiculo)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await load(); setRefrescando(false); }} tintColor={colors.petrol500} colors={[colors.petrol500]} />}
        renderItem={({ item: v }) => {
          const abierto = abiertoId === v.id_vehiculo;
          return (
            <View style={styles.tarjeta}>
              <TouchableOpacity style={[styles.fila, v.estado_vehiculo === "vendido" && styles.filaVendido]} onPress={() => setAbiertoId(abierto ? null : v.id_vehiculo)} activeOpacity={0.75}>
                <View style={styles.placa}><Text style={styles.placaTexto}>{v.placas_vehiculo || "S/P"}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>{[v.marca?.nombre_marca, v.modelo?.nombre_modelo].filter(Boolean).join(" ") || "Vehículo"}{v.id_year_vehiculo ? ` ${v.id_year_vehiculo}` : ""} {v.estado_vehiculo === "vendido" && <Text style={styles.badgeVendido}>Vendido</Text>}</Text>
                  <Text style={styles.meta}>{[v.color?.nombre_color, v.km_vehiculo ? `${Number(v.km_vehiculo).toLocaleString("es-MX")} km` : null, v.numero_cuenta].filter(Boolean).join(" · ")}</Text>
                  <Text style={styles.meta}>Dueño: {v.cliente ? `${v.cliente.nombre_cliente} ${v.cliente.paterno_cliente || ""}` : "—"}</Text>
                </View>
                <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={18} color={colors.ink500} />
              </TouchableOpacity>
              {abierto && (
                <View style={styles.extra}>
                  {v.numserie_vehiculo ? <Text style={styles.meta}>VIN: {v.numserie_vehiculo}</Text> : null}
                  {v.comentarios ? <Text style={styles.meta}>{v.comentarios}</Text> : null}
                  <FotoGaleria entidadTipo="vehiculo" entidadId={v.id_vehiculo} />
                  <View style={styles.filaAcciones}>
                    {hasPermission("vehiculos.editar") && (
                      <TouchableOpacity style={styles.editar} onPress={() => navigation.navigate("VehiculoForm", { vehiculoExistente: v })}>
                        <Ionicons name="create-outline" size={16} color={colors.petrol600} /><Text style={styles.editarTexto}>Editar vehículo</Text>
                      </TouchableOpacity>
                    )}
                    {hasPermission("vehiculos.editar") && (
                      v.estado_vehiculo === "vendido" ? (
                        <TouchableOpacity style={styles.editar} onPress={() => cambiarEstado(v, "activo")}>
                          <Ionicons name="refresh-outline" size={16} color={colors.petrol600} /><Text style={styles.editarTexto}>Marcar como activo</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={styles.editar} onPress={() => cambiarEstado(v, "vendido")}>
                          <Ionicons name="pricetag-outline" size={16} color={colors.petrol600} /><Text style={styles.editarTexto}>Marcar como vendido</Text>
                        </TouchableOpacity>
                      )
                    )}
                    {hasPermission("vehiculos.eliminar") && (
                      <TouchableOpacity style={styles.eliminar} onPress={() => confirmarEliminar(v)}>
                        <Ionicons name="trash-outline" size={16} color={colors.red600} /><Text style={styles.eliminarTexto}>Eliminar vehículo</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Ionicons name="car-outline" size={44} color="#ff7a6b" />
            <Text style={styles.vacioTexto}>{q ? "Ningún vehículo coincide." : "Aún no hay vehículos."}</Text>
          </View>
        }
      />
      {hasPermission("vehiculos.crear") && (
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("VehiculoForm")} accessibilityLabel="Nuevo vehículo">
          <Ionicons name="add" size={28} color={colors.paper100} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cabecera: { paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 8, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper0, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  buscadorInput: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  contador: { fontSize: 12, color: colors.ink700, marginTop: 6 },
  tarjeta: { backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginBottom: 10 },
  fila: { flexDirection: "row", alignItems: "center", gap: 12 },
  placa: { minWidth: 70, borderWidth: 2, borderColor: colors.ink900, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 6, alignItems: "center" },
  placaTexto: { fontFamily: "BarlowCondensed_700Bold", fontSize: 16, color: colors.ink900, letterSpacing: 0.5 },
  nombre: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  extra: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.ink300, gap: 6 },
  filaVendido: { opacity: 0.6 },
  badgeVendido: { fontSize: 10.5, fontWeight: "800", color: colors.red600, backgroundColor: colors.red100, paddingHorizontal: 6, borderRadius: 6, textTransform: "uppercase" },
  filaAcciones: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 4 },
  editar: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  editarTexto: { fontSize: 14, fontWeight: "600", color: colors.petrol600 },
  eliminar: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  eliminarTexto: { fontSize: 14, fontWeight: "600", color: colors.red600 },
  vacio: { alignItems: "center", gap: 8, paddingTop: 60 },
  vacioTexto: { fontSize: 14, color: colors.ink500 },
  fab: {
    position: "absolute", right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.petrol500,
    alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
});
