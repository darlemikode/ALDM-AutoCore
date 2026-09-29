import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTema } from "../context/TemaContext";
import { api, servidorActual } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { confirmar } from "../ui/comunes";
import HojaFormulario from "../ui/HojaFormulario";
import { alerta } from "../ui/Dialogo";

const OPCIONES = [
  ["Solicitudes", "mail-outline", "Solicitudes de información", "Quién pidió una demo desde la página"],
  ["Paquetes", "layers-outline", "Paquetes y precios", "Crea planes, su precio por tipo de cobro y qué incluyen"],
  ["TiposCobro", "repeat-outline", "Tipos de cobro", "Mensual, anual… meses y descuento"],
  ["Modulos", "apps-outline", "Módulos del sistema", "Definidos por el sistema; en qué paquetes está cada uno"],
  ["Configuracion", "options-outline", "Reglas de suscripción", "Días de prueba, gracia y conservación"],
  ["Usuarios", "people-outline", "Usuarios y accesos", "A qué talleres entra cada usuario"],
];

export default function MasScreen({ navigation }) {
  const { usuario, logout } = useAuth();
  const { preferencia, cambiarPreferencia } = useTema();
  const [cambiandoPassword, setCambiandoPassword] = useState(false);

  async function guardarPassword(v) {
    if (v.password_nueva !== v.confirmar) throw new Error("La contraseña nueva y su confirmación no coinciden.");
    if ((v.password_nueva || "").length < 6) throw new Error("La contraseña nueva debe tener al menos 6 caracteres.");
    await api.put("/auth/password", { password_actual: v.password_actual, password_nueva: v.password_nueva });
    setCambiandoPassword(false);
    alerta("Listo", "Tu contraseña se cambió. Úsala la próxima vez que inicies sesión.");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
      {OPCIONES.map(([ruta, icono, titulo, desc]) => (
        <TouchableOpacity key={ruta} style={styles.item} onPress={() => navigation.navigate(ruta)}>
          <View style={styles.icono}><Ionicons name={icono} size={20} color={colors.petrol600} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>{titulo}</Text>
            <Text style={styles.desc}>{desc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.ink500} />
        </TouchableOpacity>
      ))}

      <Text style={styles.grupo}>Apariencia</Text>
      <View style={styles.segmentado}>
        {[["sistema", "Sistema"], ["claro", "Claro"], ["oscuro", "Oscuro"]].map(([v, t]) => (
          <TouchableOpacity key={v} style={[styles.segmento, preferencia === v && styles.segmentoActivo]} onPress={() => cambiarPreferencia(v)}>
            <Text style={[styles.segmentoTexto, preferencia === v && { color: colors.paper100 }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.grupo}>Sesión</Text>
      <Text style={styles.desc}>{usuario?.nombre_completo} (@{usuario?.username})</Text>
      <Text style={[styles.desc, { marginBottom: 12 }]}>Servidor: {servidorActual()}</Text>
      <TouchableOpacity style={styles.item} onPress={() => setCambiandoPassword(true)}>
        <View style={styles.icono}><Ionicons name="key-outline" size={20} color={colors.petrol600} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>Cambiar mi contraseña</Text>
          <Text style={styles.desc}>Necesitas tu contraseña actual</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.ink500} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.salir} onPress={() => confirmar("Cerrar sesión", "¿Seguro que quieres salir?", "Salir", logout)}>
        <Ionicons name="log-out-outline" size={18} color={colors.red600} />
        <Text style={styles.salirTexto}>Cerrar sesión</Text>
      </TouchableOpacity>

      <HojaFormulario
        visible={cambiandoPassword}
        titulo="Cambiar mi contraseña"
        icono="key-outline"
        valoresIniciales={{ password_actual: "", password_nueva: "", confirmar: "" }}
        campos={[
          { name: "password_actual", label: "Contraseña actual", type: "password", required: true },
          { name: "password_nueva", label: "Contraseña nueva", type: "password", required: true, hint: "Mínimo 6 caracteres" },
          { name: "confirmar", label: "Confirmar contraseña nueva", type: "password", required: true },
        ]}
        onGuardar={guardarPassword}
        onCerrar={() => setCambiandoPassword(false)}
      />
    </ScrollView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paper100, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.ink300 },
  icono: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  titulo: { fontSize: 15, fontWeight: "700", color: colors.ink900 },
  desc: { fontSize: 12.5, color: colors.ink700, marginTop: 2 },
  grupo: { fontSize: 12, fontWeight: "800", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.7, marginTop: 18, marginBottom: 8 },
  segmentado: { flexDirection: "row", backgroundColor: colors.paper100, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: colors.ink300 },
  segmento: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center" },
  segmentoActivo: { backgroundColor: colors.petrol600 },
  segmentoTexto: { fontSize: 13.5, fontWeight: "600", color: colors.ink700 },
  salir: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.red100, borderRadius: 12, paddingVertical: 13 },
  salirTexto: { color: colors.red600, fontWeight: "700", fontSize: 14.5 },
});
