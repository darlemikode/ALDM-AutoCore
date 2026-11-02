import { View } from "react-native";
import { colors } from "../theme";
import { Ionicons } from "./IconoWeb";

// Insignia neutra como en la web: ícono gris sobre fondo suave; si está
// activa, cuadro de acento con el ícono en blanco. `color` se ignora.
export default function BadgeIcono({ icono, size = 34, activo = false }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3), alignItems: "center", justifyContent: "center",
      backgroundColor: activo ? colors.petrol500 : `${colors.ink500}22`,
    }}>
      <Ionicons name={icono} size={Math.round(size * 0.55)} color={activo ? "#ffffff" : colors.ink500} />
    </View>
  );
}
