import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";

function Campo({ etiqueta, icono, derecha, ...props }) {
  const [foco, setFoco] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{etiqueta}</Text>
      <View style={[styles.campo, foco && { borderColor: colors.petrol500 }]}>
        <Ionicons name={icono} size={18} color={foco ? colors.petrol500 : colors.ink500} />
        <TextInput style={styles.input} placeholderTextColor={colors.ink500} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)} {...props} />
        {derecha}
      </View>
    </View>
  );
}

export default function LoginScreen({ onAbrirChatbot, taller, onCambiarTaller }) {
  const { login, activarCuenta } = useAuth();
  const [modo, setModo] = useState("entrar");
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function enviar() {
    setError("");
    if (!identificador.trim()) return setError("Escribe tu teléfono o correo.");
    if (modo === "entrar" && !password) return setError("Escribe tu contraseña.");
    if (modo === "activar" && (!codigo.trim() || passwordNueva.length < 6)) return setError("Escribe el código del taller y una contraseña de al menos 6 caracteres.");
    setCargando(true);
    try {
      if (modo === "entrar") await login(identificador.trim(), password);
      else await activarCuenta(identificador.trim(), codigo.trim(), passwordNueva);
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
          <Text style={styles.brand}>ALDM <Text style={{ color: colors.petrol500 }}>AutoCore</Text></Text>
          {taller ? (
            <View style={styles.taller}>
              <Ionicons name="business-outline" size={16} color={colors.petrol600} />
              <Text style={styles.tallerNombre} numberOfLines={1}>{taller.nombre}</Text>
              {onCambiarTaller ? (
                <TouchableOpacity onPress={onCambiarTaller} hitSlop={8}><Text style={styles.tallerCambiar}>Cambiar</Text></TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.tagline}>{modo === "entrar" ? "Sigue en vivo el servicio de tu vehículo" : "Solo si el taller te dio un código de 6 dígitos (no usuario y contraseña)"}</Text>

          <View style={styles.segmentado}>
            {[["entrar", "Entrar"], ["activar", "Activar cuenta"]].map(([v, t]) => (
              <TouchableOpacity key={v} style={[styles.segmento, modo === v && styles.segmentoActivo]} onPress={() => { setModo(v); setError(""); }}>
                <Text style={[styles.segmentoTexto, modo === v && styles.segmentoTextoActivo]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Campo etiqueta="Teléfono o correo" icono="person-outline" value={identificador} onChangeText={setIdentificador} autoCapitalize="none" keyboardType="email-address" placeholder="Como está registrado en el taller" />
          {modo === "entrar" ? (
            <Campo etiqueta="Contraseña" icono="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry={!ver} onSubmitEditing={enviar} returnKeyType="go"
              derecha={<TouchableOpacity onPress={() => setVer((x) => !x)} hitSlop={10}><Ionicons name={ver ? "eye-off-outline" : "eye-outline"} size={18} color={colors.ink500} /></TouchableOpacity>} />
          ) : (
            <>
              <Campo etiqueta="Código de invitación" icono="key-outline" value={codigo} onChangeText={setCodigo} keyboardType="number-pad" maxLength={6} placeholder="6 dígitos" />
              <Campo etiqueta="Crea tu contraseña" icono="lock-closed-outline" value={passwordNueva} onChangeText={setPasswordNueva} secureTextEntry placeholder="Mínimo 6 caracteres" />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={[styles.boton, cargando && { opacity: 0.7 }]} onPress={enviar} disabled={cargando}>
            {cargando ? <ActivityIndicator color={colors.paper100} /> : <Text style={styles.botonTexto}>{modo === "entrar" ? "Entrar" : "Activar mi cuenta"}</Text>}
          </TouchableOpacity>

          <Text style={styles.ayuda}>
            {modo === "entrar"
              ? "¿Primera vez? El taller ya te dio un usuario (tu teléfono o correo) y una contraseña — entra directo con ellos aquí arriba."
              : "Esto es solo para cuando el taller te dio un código de 6 dígitos en vez de una contraseña. Si ya tienes usuario y contraseña, usa \"Entrar\"."}
          </Text>
        </View>

        <TouchableOpacity style={styles.asistente} onPress={onAbrirChatbot}>
          <Ionicons name="chatbubbles-outline" size={18} color={colors.petrol300} />
          <Text style={styles.asistenteTexto}>¿Necesitas ayuda? Habla con el asistente</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.ink900 },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  card: {
    backgroundColor: colors.paper100, borderRadius: 8, paddingVertical: 32, paddingHorizontal: 26, width: "100%", maxWidth: 380,
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 30, shadowOffset: { width: 0, height: 20 }, elevation: 12,
  },
  brand: { fontFamily: "BarlowCondensed_700Bold", fontSize: 30, color: colors.ink900 },
  tagline: { fontSize: 13, color: colors.ink500, marginTop: 4, marginBottom: 20 },
  taller: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper0, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 10 },
  tallerNombre: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.ink900 },
  tallerCambiar: { fontSize: 13, fontWeight: "700", color: colors.petrol600 },
  segmentado: { flexDirection: "row", backgroundColor: colors.paper0, borderRadius: 10, padding: 3, marginBottom: 18 },
  segmento: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center" },
  segmentoActivo: { backgroundColor: colors.petrol500 },
  segmentoTexto: { fontSize: 13.5, fontWeight: "600", color: colors.ink700 },
  segmentoTextoActivo: { color: colors.paper100 },
  label: { fontSize: 12.5, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.75, marginBottom: 7 },
  campo: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper100, borderWidth: 1.5, borderColor: colors.petrol300, borderRadius: 10, paddingHorizontal: 13, height: 46 },
  input: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  error: { fontSize: 13, color: colors.red600, marginBottom: 8 },
  boton: { backgroundColor: colors.petrol500, borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 4 },
  botonTexto: { fontSize: 15, fontWeight: "600", color: colors.paper100 },
  ayuda: { fontSize: 12, color: colors.ink700, textAlign: "center", marginTop: 16, lineHeight: 17 },
  asistente: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, padding: 10 },
  asistenteTexto: { fontSize: 14, fontWeight: "600", color: colors.petrol300 },
});
