import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";

export default function BiometricLockScreen() {
  const { desbloquearConBiometria, logout } = useAuth();
  const [intentando, setIntentando] = useState(false);
  const [fallo, setFallo] = useState(false);

  async function intentar() {
    setIntentando(true);
    setFallo(false);
    const ok = await desbloquearConBiometria();
    setIntentando(false);
    if (!ok) setFallo(true);
  }

  // Intenta automáticamente en cuanto se muestra la pantalla, para no
  // obligar a un toque extra la mayoría de las veces.
  useEffect(() => {
    intentar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.card}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>Sesión protegida</Text>
        <Text style={styles.subtitle}>Confirma tu huella o Face ID para continuar.</Text>

        <TouchableOpacity style={styles.button} onPress={intentar} disabled={intentando}>
          <Text style={styles.buttonText}>{intentando ? "Verificando…" : "Desbloquear con biometría"}</Text>
        </TouchableOpacity>

        {fallo && <Text style={styles.error}>No se pudo verificar tu identidad. Inténtalo de nuevo.</Text>}

        <TouchableOpacity style={styles.linkButton} onPress={logout}>
          <Text style={styles.linkText}>Salir y entrar con contraseña</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.ink900, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { backgroundColor: colors.paper100, borderRadius: 12, padding: spacing.xl, width: "100%", maxWidth: 380, alignItems: "center" },
  icon: { fontSize: 40, marginBottom: spacing.sm },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink900, textTransform: "uppercase" },
  subtitle: { color: colors.ink500, fontSize: 13, marginTop: 4, textAlign: "center" },
  button: { backgroundColor: colors.petrol500, borderRadius: 8, padding: 14, alignItems: "center", marginTop: spacing.xl, width: "100%" },
  buttonText: { color: colors.paper100, fontWeight: "800", fontSize: 14, textTransform: "uppercase" },
  error: { color: colors.red600, marginTop: spacing.md, fontSize: 13, textAlign: "center" },
  linkButton: { marginTop: spacing.lg },
  linkText: { color: colors.ink500, fontSize: 13, textDecorationLine: "underline" },
});
