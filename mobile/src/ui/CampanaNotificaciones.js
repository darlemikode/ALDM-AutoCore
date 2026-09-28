// Campana de avisos en la barra superior (ver ../notificaciones.js para el
// estado compartido, y notificaciones.py en el backend para el origen:
// hoy solo mensajes/alertas del chat del cliente que nadie vio en vivo).
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Modal, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { crearEstilos } from "./estilos";
import { suscribirNotificaciones, cargarNotificaciones, marcarNotificacionesVistas } from "../notificaciones";

function hace(fechaISO) {
  const ms = Date.now() - new Date(fechaISO).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(fechaISO).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export default function CampanaNotificaciones({ navigation }) {
  const [conteo, setConteo] = useState(0);
  const [lista, setLista] = useState([]);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => suscribirNotificaciones(({ conteo, lista }) => { setConteo(conteo); setLista(lista); }), []);

  function abrir() {
    setAbierta(true);
    cargarNotificaciones();
  }

  function cerrarYMarcarVistas() {
    setAbierta(false);
    marcarNotificacionesVistas();
  }

  function irAOrden(n) {
    setAbierta(false);
    marcarNotificacionesVistas();
    if (n.id_servicio) {
      navigation.navigate("Taller", { screen: "Servicio", params: { screen: "ServicioDetalle", params: { id: n.id_servicio, abrirChat: true } } });
    } else if (n.tipo === "recuperacion_password") {
      navigation.navigate("Taller", { screen: "Más", params: { screen: "Usuarios" } });
    }
  }

  return (
    <>
      <TouchableOpacity onPress={abrir} hitSlop={10} style={{ paddingHorizontal: 4 }} accessibilityLabel="Notificaciones">
        <View>
          <Ionicons name={conteo > 0 ? "notifications" : "notifications-outline"} size={22} color={colors.ink900} />
          {conteo > 0 && (
            <View style={styles.punto}>
              <Text style={styles.puntoTexto}>{conteo > 9 ? "9+" : conteo}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <Modal visible={abierta} animationType="fade" transparent onRequestClose={cerrarYMarcarVistas}>
        <TouchableOpacity style={styles.velo} activeOpacity={1} onPress={cerrarYMarcarVistas}>
          <View style={styles.hoja} onStartShouldSetResponder={() => true}>
            <View style={styles.encabezado}>
              <Text style={styles.titulo}>Notificaciones</Text>
              <TouchableOpacity onPress={cerrarYMarcarVistas} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.ink700} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={lista}
              keyExtractor={(n) => String(n.id_notificacion)}
              style={{ maxHeight: 420 }}
              ListEmptyComponent={<Text style={styles.vacio}>No hay notificaciones todavía.</Text>}
              renderItem={({ item: n }) => (
                <TouchableOpacity style={[styles.fila, !n.leida && styles.filaNoLeida]} onPress={() => irAOrden(n)} disabled={!n.id_servicio && n.tipo !== "recuperacion_password"}>
                  <View style={styles.filaIcono}>
                    <Ionicons
                      name={n.tipo === "alerta_cliente" ? "warning-outline" : n.tipo === "recuperacion_password" ? "key-outline" : "chatbubble-ellipses-outline"}
                      size={17}
                      color={n.tipo === "alerta_cliente" ? colors.red600 : colors.petrol600}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.filaTitulo} numberOfLines={1}>{n.titulo}</Text>
                    {n.mensaje ? <Text style={styles.filaTexto} numberOfLines={2}>{n.mensaje}</Text> : null}
                    <Text style={styles.filaFecha}>{hace(n.fecha)}</Text>
                  </View>
                  {!n.leida && <View style={styles.puntoFila} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = crearEstilos({
  punto: {
    position: "absolute", top: -4, right: -6, minWidth: 15, height: 15, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: colors.red600, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.paper0,
  },
  puntoTexto: { color: "#fff", fontSize: 9, fontWeight: "800" },
  velo: { flex: 1, backgroundColor: colors.velo, alignItems: "flex-end" },
  hoja: {
    marginTop: 56, marginRight: 10, width: 320, maxWidth: "92%", backgroundColor: colors.paper100, borderRadius: 14,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  encabezado: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  titulo: { fontSize: 15, fontWeight: "700", color: colors.ink900 },
  vacio: { padding: 24, textAlign: "center", color: colors.ink500, fontSize: 13 },
  fila: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  filaNoLeida: { backgroundColor: colors.petrol100 },
  filaIcono: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.paper0, alignItems: "center", justifyContent: "center", marginTop: 2 },
  filaTitulo: { fontSize: 13.5, fontWeight: "700", color: colors.ink900 },
  filaTexto: { fontSize: 12.5, color: colors.ink700, marginTop: 2 },
  filaFecha: { fontSize: 11, color: colors.ink500, marginTop: 4 },
  puntoFila: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red600, marginTop: 6 },
});
