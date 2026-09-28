import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useAuth } from "../context/AuthContext";
import { useTema } from "../context/TemaContext";
import { colors } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";

const TEMAS = [
  { valor: "sistema", icono: "phone-portrait-outline", label: "Sistema" },
  { valor: "claro", icono: "sunny-outline", label: "Claro" },
  { valor: "oscuro", icono: "moon-outline", label: "Oscuro" },
];

export default function MasScreen({ navigation }) {
  const { cliente, logout } = useAuth();
  const { preferencia, cambiarPreferencia } = useTema();
  const iniciales = `${cliente?.nombre_cliente?.[0] || ""}${cliente?.paterno_cliente?.[0] || ""}`.toUpperCase() || "?";

  const confirmarSalida = () => alerta("Cerrar sesión", "¿Seguro que quieres salir de tu cuenta?", [
    { text: "Cancelar", style: "cancel" },
    { text: "Salir", style: "destructive", onPress: logout },
  ]);

  const ir = (tab, screen) => navigation.getParent()?.navigate(tab, screen ? { screen } : undefined);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.perfil}>
        <View style={styles.avatar}><Text style={styles.avatarTexto}>{iniciales}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nombre}>{[cliente?.nombre_cliente, cliente?.paterno_cliente].filter(Boolean).join(" ")}</Text>
          <Text style={styles.meta}>Cuenta {cliente?.numero_cuenta}</Text>
        </View>
      </View>

      <Text style={styles.seccion}>Contacto</Text>
      <View style={styles.grupo}>
        <Renglon icono="call-outline" etiqueta="Teléfono" valor={cliente?.telefono1 || "Sin registrar"} />
        <Renglon icono="mail-outline" etiqueta="Correo" valor={cliente?.correo_cliente || "Sin registrar"} ultimo />
      </View>
      <Text style={styles.nota}>Para actualizar tus datos, pídeselo al taller en tu próxima visita o por el chat de tu servicio.</Text>

      <Text style={styles.seccion}>Accesos</Text>
      <View style={styles.grupo}>
        <Renglon icono="home-outline" etiqueta="Mi vehículo en el taller" onPress={() => ir("Inicio")} />
        <Renglon icono="car-outline" etiqueta="Mis vehículos" onPress={() => ir("Vehículos")} />
        <Renglon icono="calendar-outline" etiqueta="Agendar una cita" onPress={() => ir("Agendar")} ultimo />
      </View>

      <Text style={styles.seccion}>Apariencia</Text>
      <View style={styles.segmento}>
        {TEMAS.map((t) => {
          const activo = preferencia === t.valor;
          return (
            <TouchableOpacity key={t.valor} style={[styles.opcion, activo && styles.opcionActiva]} onPress={() => cambiarPreferencia(t.valor)}>
              <Ionicons name={t.icono} size={18} color={activo ? colors.petrol600 : colors.ink500} />
              <Text style={[styles.opcionTexto, activo && { color: colors.petrol600 }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.salir} onPress={confirmarSalida}>
        <Ionicons name="log-out-outline" size={19} color={colors.red600} />
        <Text style={styles.salirTexto}>Cerrar sesión</Text>
      </TouchableOpacity>
      <Text style={styles.version}>ALDM Autocore · v{Constants.expoConfig?.version || "1.0.0"}</Text>
    </ScrollView>
  );
}

function Renglon({ icono, etiqueta, valor, onPress, ultimo }) {
  const Cont = onPress ? TouchableOpacity : View;
  return (
    <Cont style={[styles.renglon, !ultimo && styles.renglonLinea]} onPress={onPress}>
      <Ionicons name={icono} size={19} color={colors.petrol600} />
      <View style={{ flex: 1 }}>
        <Text style={styles.renglonEtiqueta}>{etiqueta}</Text>
        {valor ? <Text style={styles.meta} selectable>{valor}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={17} color={colors.ink500} /> : null}
    </Cont>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  perfil: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.paper100, borderRadius: 16, padding: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.petrol500, alignItems: "center", justifyContent: "center" },
  avatarTexto: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24, color: "#fff" },
  nombre: { fontSize: 18, fontWeight: "700", color: colors.ink900 },
  meta: { fontSize: 13, color: colors.ink500, marginTop: 2 },
  seccion: { fontSize: 12.5, fontWeight: "700", color: colors.ink700, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 22, marginBottom: 8 },
  grupo: { backgroundColor: colors.paper100, borderRadius: 14, paddingHorizontal: 14 },
  renglon: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  renglonLinea: { borderBottomWidth: 1, borderBottomColor: colors.linea },
  renglonEtiqueta: { fontSize: 14.5, fontWeight: "600", color: colors.ink900 },
  nota: { fontSize: 12.5, color: colors.ink500, marginTop: 8, lineHeight: 18 },
  segmento: { flexDirection: "row", gap: 6, backgroundColor: colors.paper100, borderRadius: 12, padding: 4 },
  opcion: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 10, borderRadius: 9 },
  opcionActiva: { backgroundColor: colors.petrol100 },
  opcionTexto: { fontSize: 12.5, fontWeight: "600", color: colors.ink500 },
  salir: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 28, borderRadius: 12, paddingVertical: 14, backgroundColor: colors.red100 },
  salirTexto: { fontSize: 15, fontWeight: "700", color: colors.red600 },
  version: { fontSize: 12, color: colors.ink500, textAlign: "center", marginTop: 16 },
});
