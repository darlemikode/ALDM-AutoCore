import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Insignia con el ícono del módulo: fondo y borde suaves del color propio
// (igual que .h1-icono / el menú lateral de la web).
export default function BadgeIcono({ icono, color, size = 34, activo = false }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3), alignItems: "center", justifyContent: "center",
      backgroundColor: `${color}26`, borderWidth: 1, borderColor: `${color}${activo ? "aa" : "55"}`,
    }}>
      <Ionicons name={icono} size={Math.round(size * 0.55)} color={color} />
    </View>
  );
}
