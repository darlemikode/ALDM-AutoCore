// Aviso de la suscripción del taller (por vencer, periodo de gracia /
// solo consulta). Si está bloqueada, App.js muestra PantallaBloqueo.
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";
import { crearEstilos } from "./estilos";

export function AvisoSuscripcion() {
  const { estadoSuscripcion } = useAuth();
  if (!estadoSuscripcion?.mensaje || estadoSuscripcion.bloqueado) return null;
  const grave = estadoSuscripcion.solo_lectura;
  return (
    <View style={[styles.barra, { backgroundColor: grave ? colors.red100 : colors.warn100 }]}>
      <Ionicons name={grave ? "lock-closed-outline" : "time-outline"} size={14} color={grave ? colors.red600 : colors.warn600} />
      <Text style={[styles.texto, { color: grave ? colors.red600 : colors.warn600 }]}>{estadoSuscripcion.mensaje}</Text>
    </View>
  );
}

export function PantallaBloqueo() {
  const { estadoSuscripcion, talleres, logout } = useAuth();
  return (
    <View style={styles.bloqueo}>
      <Ionicons name="lock-closed" size={44} color={colors.red600} />
      <Text style={styles.bloqueoTitulo}>Acceso suspendido</Text>
      <Text style={styles.bloqueoTexto}>{estadoSuscripcion?.mensaje}</Text>
      {talleres.length > 1 ? (
        <TouchableOpacity style={styles.boton} onPress={() => SelectorEstado.abrirSelector && SelectorEstado.abrirSelector()}>
          <Text style={styles.botonTexto}>Entrar a otro taller</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={[styles.boton, styles.botonSecundario]} onPress={logout}>
        <Text style={[styles.botonTexto, { color: colors.ink900 }]}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

// Lo llena SelectorTaller al montarse, para poder abrirlo desde aquí.
export const SelectorEstado = { abrirSelector: null };

const styles = crearEstilos({
  barra: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 12 },
  texto: { flex: 1, fontSize: 12, fontWeight: "600" },
  bloqueo: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: colors.paper0, gap: 10 },
  bloqueoTitulo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 28, color: colors.red600 },
  bloqueoTexto: { fontSize: 14, color: colors.ink700, textAlign: "center", marginBottom: 10 },
  boton: { backgroundColor: colors.petrol600, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 22, alignSelf: "stretch", alignItems: "center" },
  botonSecundario: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300 },
  botonTexto: { color: colors.paper100, fontWeight: "700", fontSize: 15 },
});
