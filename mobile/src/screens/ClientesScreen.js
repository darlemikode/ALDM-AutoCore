import { useCallback, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, Linking, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";

const iniciales = (c) => `${(c.nombre_cliente || "?")[0]}${(c.paterno_cliente || "")[0] || ""}`.toUpperCase();

export default function ClientesScreen({ navigation }) {
  const { hasPermission } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [q, setQ] = useState("");
  const [refrescando, setRefrescando] = useState(false);

  const load = (query = q) => api.get(`/clientes/?solo_activos=true${query ? `&q=${encodeURIComponent(query)}` : ""}`).then(setClientes).catch(() => {});
  useFocusEffect(useCallback(() => { load(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  useActualizacionGlobal("clientes", () => load());

  return (
    <View style={styles.screen}>
      <View style={styles.cabecera}>
        <View style={styles.buscador}>
          <Ionicons name="search" size={18} color={colors.ink500} />
          <TextInput style={styles.buscadorInput} placeholder="Nombre, teléfono o cuenta" placeholderTextColor={colors.ink500} value={q} onChangeText={(t) => { setQ(t); load(t); }} />
          {q ? <TouchableOpacity onPress={() => { setQ(""); load(""); }} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.ink500} /></TouchableOpacity> : null}
        </View>
        <Text style={styles.contador}>{clientes.length} cliente(s)</Text>
      </View>
      <FlatList
        data={clientes}
        keyExtractor={(item) => String(item.id_cliente)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await load(); setRefrescando(false); }} tintColor={colors.petrol500} colors={[colors.petrol500]} />}
        renderItem={({ item: c }) => (
          <TouchableOpacity style={styles.tarjeta} onPress={() => navigation.navigate("ClienteDetalle", { cliente: c })} activeOpacity={0.75}>
            <View style={styles.avatar}><Text style={styles.avatarTexto}>{iniciales(c)}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>{c.nombre_cliente} {c.paterno_cliente || ""}</Text>
              <Text style={styles.meta}>{[c.numero_cuenta, c.telefono1 || c.correo_cliente].filter(Boolean).join(" · ") || "Sin datos de contacto"}</Text>
            </View>
            {c.telefono1 ? (
              <TouchableOpacity style={styles.llamar} onPress={() => Linking.openURL(`tel:${c.telefono1}`)} hitSlop={6} accessibilityLabel="Llamar">
                <Ionicons name="call" size={17} color={colors.petrol600} />
              </TouchableOpacity>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={colors.ink500} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Ionicons name="people-outline" size={36} color={colors.ink500} />
            <Text style={styles.vacioTexto}>{q ? "Nadie coincide con la búsqueda." : "Aún no hay clientes."}</Text>
          </View>
        }
      />
      {hasPermission("clientes.crear") && (
        <TouchableOpacity style={styles.fabExtendido} onPress={() => navigation.navigate("ClienteForm")}>
          <Ionicons name="person-add" size={19} color={colors.paper100} />
          <Text style={styles.fabTexto}>Nuevo cliente</Text>
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
  tarjeta: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginBottom: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  avatarTexto: { fontSize: 15, fontWeight: "700", color: colors.petrol600 },
  nombre: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  llamar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  vacio: { alignItems: "center", gap: 8, paddingTop: 60 },
  vacioTexto: { fontSize: 14, color: colors.ink500 },
  fabExtendido: {
    position: "absolute", right: 18, bottom: 22, flexDirection: "row", alignItems: "center", gap: 7, height: 52, paddingHorizontal: 18, borderRadius: 26,
    backgroundColor: colors.petrol500, elevation: 5, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  fabTexto: { fontSize: 15, fontWeight: "700", color: colors.paper100 },
});
