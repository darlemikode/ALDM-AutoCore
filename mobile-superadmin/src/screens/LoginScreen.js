import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { guardarServidor, servidorActual } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";

export default function LoginScreen() {
  const { login } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [servidor, setServidor] = useState(servidorActual());
  const [verServidor, setVerServidor] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function entrar() {
    setError("");
    if (!usuario.trim() || !password) return setError("Escribe usuario y contraseña.");
    setCargando(true);
    try {
      await guardarServidor(servidor);
      await login(usuario.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.brand}>ALDM <Text style={{ color: colors.petrol500 }}>Súper Admin</Text></Text>
          <Text style={styles.tagline}>Talleres, suscripciones y cobranza</Text>

          <Text style={styles.label}>Usuario</Text>
          <View style={styles.campo}>
            <Ionicons name="person-outline" size={18} color={colors.ink500} />
            <TextInput style={styles.input} value={usuario} onChangeText={setUsuario} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.ink500} placeholder="Tu usuario" />
          </View>
          <Text style={styles.label}>Contraseña</Text>
          <View style={styles.campo}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.ink500} />
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry={!ver} onSubmitEditing={entrar} returnKeyType="go" placeholderTextColor={colors.ink500} placeholder="••••••" />
            <TouchableOpacity onPress={() => setVer((x) => !x)} hitSlop={10}><Ionicons name={ver ? "eye-off-outline" : "eye-outline"} size={18} color={colors.ink500} /></TouchableOpacity>
          </View>

          {verServidor ? (
            <>
              <Text style={styles.label}>Servidor</Text>
              <View style={styles.campo}>
                <Ionicons name="server-outline" size={18} color={colors.ink500} />
                <TextInput style={styles.input} value={servidor} onChangeText={setServidor} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://midominio.com/api" placeholderTextColor={colors.ink500} />
              </View>
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={[styles.boton, cargando && { opacity: 0.7 }]} onPress={entrar} disabled={cargando}>
            {cargando ? <ActivityIndicator color={colors.paper100} /> : <Text style={styles.botonTexto}>Entrar</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setVerServidor((x) => !x)} style={{ alignItems: "center", marginTop: 16 }}>
            <Text style={styles.link}>{verServidor ? "Ocultar servidor" : "Cambiar servidor"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.ink900 },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  card: { backgroundColor: colors.paper100, borderRadius: 10, paddingVertical: 32, paddingHorizontal: 26, width: "100%", maxWidth: 400 },
  brand: { fontFamily: "BarlowCondensed_700Bold", fontSize: 30, color: colors.ink900 },
  tagline: { fontSize: 13, color: colors.ink500, marginTop: 4, marginBottom: 22 },
  label: { fontSize: 12, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 7 },
  campo: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: colors.petrol300, borderRadius: 10, paddingHorizontal: 13, height: 46, marginBottom: 14, backgroundColor: colors.paper100 },
  input: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  error: { fontSize: 13, color: colors.red600, marginBottom: 8 },
  boton: { backgroundColor: colors.petrol500, borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 4 },
  botonTexto: { fontSize: 15, fontWeight: "700", color: colors.paper100 },
  link: { color: colors.petrol600, fontWeight: "600", fontSize: 13 },
});
