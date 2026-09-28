// Barra delgada que aparece sola cuando la app se queda sin conexión con
// el servidor (MODO_LOCAL se prende solo, ver ../localMode.js) y
// desaparece sola en cuanto vuelve — es "la señal de modo offline" que se
// pidió: nadie tiene que abrir Ajustes para saber que está trabajando sin
// servidor.
import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MODO_LOCAL, suscribirModoLocal } from "../localMode";
import { colors } from "../theme";
import { crearEstilos } from "./estilos";

export function AvisoModoLocal() {
  const [modoLocal, setModoLocal] = useState(MODO_LOCAL);

  useEffect(() => suscribirModoLocal(setModoLocal), []);

  if (!modoLocal) return null;

  return (
    <View style={styles.barra}>
      <Ionicons name="cloud-offline-outline" size={14} color={colors.warn600} />
      <Text style={styles.texto}>Sin conexión con el servidor — trabajando en modo local. Se sube solo al reconectar.</Text>
    </View>
  );
}

const styles = crearEstilos({
  barra: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#fdf1d9",
  },
  texto: {
    flex: 1,
    fontSize: 11.5,
    color: colors.warn600,
  },
});
