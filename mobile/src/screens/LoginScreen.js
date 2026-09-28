import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";

function Campo({ etiqueta, icono, derecha, ...props }) {
  const [enfocado, setEnfocado] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{etiqueta}</Text>
      <View style={[styles.campo, enfocado && styles.campoEnfocado]}>
        <Ionicons name={icono} size={18} color={enfocado ? colors.petrol500 : colors.ink500} />
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.ink500}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          {...props}
        />
        {derecha}
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const { login, entrarConToken } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [recuperando, setRecuperando] = useState(false);
  const [identificador, setIdentificador] = useState("");
  const [mensajeRecuperacion, setMensajeRecuperacion] = useState("");
  const [cargandoRecuperacion, setCargandoRecuperacion] = useState(false);

  // Primera vez: activar el taller y registrar al administrador
  const [activando, setActivando] = useState(false);
  const [tallerActivar, setTallerActivar] = useState(null);
  const [act, setAct] = useState({ codigo_taller: "", codigo_activacion: "", nombre_completo: "", username: "", password: "", confirmar: "" });
  const [errorAct, setErrorAct] = useState("");
  const [cargandoAct, setCargandoAct] = useState(false);
  const campoAct = (k) => (v) => setAct((a) => ({ ...a, [k]: v }));

  async function verificarActivacion() {
    setErrorAct("");
    if (!act.codigo_taller.trim() || !act.codigo_activacion.trim()) return setErrorAct("Escribe el código del taller y el código de activación.");
    setCargandoAct(true);
    try {
      setTallerActivar(await api.post("/auth/verificar-activacion", { codigo_taller: act.codigo_taller, codigo_activacion: act.codigo_activacion }));
    } catch (err) {
      setErrorAct(err.message);
    } finally {
      setCargandoAct(false);
    }
  }

  async function activarTaller() {
    setErrorAct("");
    if (!act.nombre_completo.trim() || !act.username.trim()) return setErrorAct("Escribe tu nombre y el usuario con el que vas a entrar.");
    if (act.password.length < 6) return setErrorAct("La contraseña debe tener al menos 6 caracteres.");
    if (act.password !== act.confirmar) return setErrorAct("Las contraseñas no coinciden.");
    setCargandoAct(true);
    try {
      const data = await api.post("/auth/activar-taller", {
        codigo_taller: act.codigo_taller, codigo_activacion: act.codigo_activacion,
        nombre_completo: act.nombre_completo, username: act.username.trim(), password: act.password,
      });
      await entrarConToken(data.access_token);
    } catch (err) {
      setErrorAct(err.message);
      setCargandoAct(false);
    }
  }

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecuperar() {
    setCargandoRecuperacion(true);
    setMensajeRecuperacion("");
    try {
      const res = await api.post("/auth/recuperar-password", { identificador });
      setMensajeRecuperacion(res.detail);
    } catch (err) {
      setMensajeRecuperacion(err.message);
    } finally {
      setCargandoRecuperacion(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.brand}>ALDM <Text style={{ color: colors.petrol500 }}>AutoCore</Text></Text>
          <Text style={styles.tagline}>Panel de administración del taller</Text>

          {activando ? (
            <>
              <Text style={styles.subtitulo}>{tallerActivar ? `Activa ${tallerActivar.nombre}` : "Activa tu taller"}</Text>
              {!tallerActivar ? (
                <>
                  <Text style={styles.ayuda}>Escribe los códigos que te mandó ALDM. Solo se hace la primera vez.</Text>
                  <Campo etiqueta="Código del taller" icono="business-outline" value={act.codigo_taller} onChangeText={(v) => campoAct("codigo_taller")(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} />
                  <Campo etiqueta="Código de activación" icono="key-outline" value={act.codigo_activacion} onChangeText={(v) => campoAct("codigo_activacion")(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} onSubmitEditing={verificarActivacion} />
                </>
              ) : (
                <>
                  <Text style={styles.ayuda}>Crea tu usuario de administrador. Con él vas a entrar de aquí en adelante.</Text>
                  <Campo etiqueta="Nombre completo" icono="person-outline" value={act.nombre_completo} onChangeText={campoAct("nombre_completo")} />
                  <Campo etiqueta="Usuario" icono="at-outline" value={act.username} onChangeText={campoAct("username")} autoCapitalize="none" autoCorrect={false} />
                  <Campo etiqueta="Contraseña" icono="lock-closed-outline" value={act.password} onChangeText={campoAct("password")} secureTextEntry placeholder="Mínimo 6 caracteres" />
                  <Campo etiqueta="Confirmar contraseña" icono="lock-closed-outline" value={act.confirmar} onChangeText={campoAct("confirmar")} secureTextEntry onSubmitEditing={activarTaller} />
                </>
              )}
              {errorAct ? <Text style={styles.errorTexto}>{errorAct}</Text> : null}
              <TouchableOpacity style={[styles.btnPrimary, cargandoAct && { opacity: 0.7 }]} onPress={tallerActivar ? activarTaller : verificarActivacion} disabled={cargandoAct} activeOpacity={0.85}>
                {cargandoAct ? <ActivityIndicator color={colors.paper100} /> : <Text style={styles.btnPrimaryTexto}>{tallerActivar ? "Crear mi usuario y entrar" : "Continuar"}</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setActivando(false); setTallerActivar(null); setErrorAct(""); }} style={styles.linkBtn}>
                <Text style={styles.link}>← Volver a iniciar sesión</Text>
              </TouchableOpacity>
            </>
          ) : !recuperando ? (
            <>
              <Campo etiqueta="Usuario" icono="person-outline" value={username} onChangeText={setUsername} autoCapitalize="none" autoFocus />
              <Campo
                etiqueta="Contraseña"
                icono="lock-closed-outline"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!verPassword}
                onSubmitEditing={handleLogin}
                returnKeyType="go"
                derecha={
                  <TouchableOpacity onPress={() => setVerPassword((v) => !v)} hitSlop={10}>
                    <Ionicons name={verPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.ink500} />
                  </TouchableOpacity>
                }
              />

              {error ? <Text style={styles.errorTexto}>{error}</Text> : null}

              <TouchableOpacity style={[styles.btnPrimary, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
                {loading ? <ActivityIndicator color={colors.paper100} /> : <Text style={styles.btnPrimaryTexto}>Entrar</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setRecuperando(true); setMensajeRecuperacion(""); setIdentificador(""); }} style={styles.linkBtn}>
                <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setActivando(true); setErrorAct(""); }} style={styles.linkBtn}>
                <Text style={styles.link}>¿Primera vez? Activa tu taller</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Campo etiqueta="Usuario, correo o teléfono" icono="at-outline" value={identificador} onChangeText={setIdentificador} autoCapitalize="none" placeholder="Con lo que te registró el admin" autoFocus />

              {mensajeRecuperacion ? <Text style={styles.recoveryMsg}>{mensajeRecuperacion}</Text> : null}

              <TouchableOpacity style={[styles.btnPrimary, cargandoRecuperacion && { opacity: 0.7 }]} onPress={handleRecuperar} disabled={cargandoRecuperacion} activeOpacity={0.85}>
                {cargandoRecuperacion ? <ActivityIndicator color={colors.paper100} /> : <Text style={styles.btnPrimaryTexto}>Avisar al administrador</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setRecuperando(false)} style={styles.linkBtn}>
                <Text style={styles.link}>← Volver a iniciar sesión</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Espejo de .login-screen / .login-card / .field / .btn-primary de la web
const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.ink900 },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  card: {
    backgroundColor: colors.paper100, borderRadius: 8, paddingVertical: 36, paddingHorizontal: 28,
    width: "100%", maxWidth: 380,
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 30, shadowOffset: { width: 0, height: 20 }, elevation: 12,
  },
  brand: { fontFamily: "BarlowCondensed_700Bold", fontSize: 30, color: colors.ink900, marginBottom: 4 },
  tagline: { fontFamily: "Inter_400Regular", color: colors.ink500, fontSize: 13, marginBottom: 26 },
  field: { marginBottom: 14 },
  label: { fontFamily: "Inter_800ExtraBold", fontSize: 12.5, color: colors.ink900, marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.75 },
  campo: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper100,
    borderWidth: 1.5, borderColor: colors.petrol300, borderRadius: 10, paddingHorizontal: 13, height: 46,
  },
  campoEnfocado: { borderColor: colors.petrol500 },
  input: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, color: colors.ink900, height: "100%" },
  errorTexto: { fontFamily: "Inter_400Regular", color: colors.red600, fontSize: 13, marginBottom: 6 },
  btnPrimary: {
    backgroundColor: colors.petrol500, borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 4,
    shadowColor: colors.petrol500, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  btnPrimaryTexto: { fontFamily: "Inter_600SemiBold", color: colors.paper100, fontSize: 15 },
  linkBtn: { marginTop: 16, alignItems: "center", padding: 4 },
  link: { fontFamily: "Inter_600SemiBold", color: colors.petrol500, fontSize: 13, textDecorationLine: "underline" },
  subtitulo: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.ink900, marginBottom: 6 },
  ayuda: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.ink700, marginBottom: 14, lineHeight: 18 },
  recoveryMsg: { fontFamily: "Inter_400Regular", backgroundColor: colors.petrol100, color: colors.petrol600, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 13, lineHeight: 19, marginBottom: 12 },
});
