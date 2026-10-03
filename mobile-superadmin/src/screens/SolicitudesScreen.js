// Personas que pidieron información o demo desde la página informativa.
import { View, Text, FlatList, TouchableOpacity, RefreshControl, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { Badge, Vacio, useCargar } from "../ui/comunes";
import { alerta } from "../ui/Dialogo";

function cuando(iso) {
  const d = new Date(String(iso).endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function SolicitudesScreen() {
  const { datos, recargar, refrescando } = useCargar(() => api.get("/superadmin/solicitudes"));
  const marcar = async (s) => {
    try { await api.put(`/superadmin/solicitudes/${s.id_solicitud}`, { atendida: !s.atendida }); recargar(); } catch (e) { alerta("No se pudo", e.message); }
  };
  return (
    <View style={styles.screen}>
      <FlatList
        data={datos || []}
        keyExtractor={(s) => String(s.id_solicitud)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => recargar(true)} />}
        ListEmptyComponent={datos ? <Vacio texto="Todavía nadie ha pedido información." icono="mail-outline" /> : null}
        renderItem={({ item: s }) => {
          const tel = String(s.telefono).replace(/\D/g, "").slice(-10);
          return (
            <View style={[styles.item, s.atendida && { opacity: 0.55 }]}>
              <View style={styles.fila}>
                <Text style={styles.nombre} numberOfLines={1}>{s.negocio}</Text>
                {s.atendida ? <Badge texto="atendida" tono="gris" /> : <Badge texto="nueva" tono="blue" />}
              </View>
              <Text style={styles.sub}>{s.nombre} · {s.telefono}{s.correo ? ` · ${s.correo}` : ""}</Text>
              {s.mensaje ? <Text style={styles.mensaje}>{s.mensaje}</Text> : null}
              <Text style={styles.sub}>{cuando(s.fecha)}</Text>
              <View style={styles.acciones}>
                <TouchableOpacity style={styles.accion} onPress={() => Linking.openURL(`tel:${s.telefono}`)}><Ionicons name="call-outline" size={16} color={colors.petrol600} /><Text style={styles.accionTexto}>Llamar</Text></TouchableOpacity>
                <TouchableOpacity style={styles.accion} onPress={() => Linking.openURL(`https://wa.me/52${tel}`)}><Ionicons name="logo-whatsapp" size={16} color={colors.petrol600} /><Text style={styles.accionTexto}>WhatsApp</Text></TouchableOpacity>
                <TouchableOpacity style={styles.accion} onPress={() => marcar(s)}><Ionicons name={s.atendida ? "refresh-outline" : "checkmark-circle-outline"} size={16} color={colors.petrol600} /><Text style={styles.accionTexto}>{s.atendida ? "Reabrir" : "Ya la atendí"}</Text></TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  item: { backgroundColor: colors.paper100, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.ink300, gap: 4 },
  fila: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  nombre: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.ink900 },
  sub: { fontSize: 12.5, color: colors.ink700 },
  mensaje: { fontSize: 13.5, color: colors.ink900, marginVertical: 2 },
  acciones: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  accion: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 10, backgroundColor: colors.petrol100 },
  accionTexto: { fontSize: 12.5, fontWeight: "700", color: colors.petrol600 },
});
