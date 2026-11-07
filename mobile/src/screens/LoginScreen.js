import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Animated, Easing, Image, useWindowDimensions } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Ellipse } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "../ui/IconoWeb";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { crearEstilos } from "../ui/estilos";

const LOGO = require("../../assets/logo-aldm.png");
// El login siempre es oscuro: el fondo es negro puro, igual que el del logo, para que se fundan sin costura.
const C = { rojo: "#e10600", rojoClaro: "#ff4a3f", rojoOscuro: "#7a0000", fondo: "#000000", texto: "#f5f5f7", tenue: "rgba(245,245,247,0.58)", vidrio: "rgba(255,255,255,0.07)", borde: "rgba(255,255,255,0.16)" };

// Fondo: resplandores rojos que respiran y se mueven despacio detrás del logo
function Fondo() {
  const { width: W, height: H } = useWindowDimensions();
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const lazo = (v, ms) => Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    lazo(a, 5200); lazo(b, 7600);
  }, [a, b]);
  const R = Math.max(W, H);
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      <Animated.View style={{ position: "absolute", top: -R * 0.25, left: W / 2 - R * 0.6, opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.95] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }] }}>
        <Svg width={R * 1.2} height={R * 1.2}>
          <Defs><RadialGradient id="g1" cx="50%" cy="50%" r="50%"><Stop offset="0%" stopColor={C.rojo} stopOpacity="0.42" /><Stop offset="55%" stopColor={C.rojoOscuro} stopOpacity="0.16" /><Stop offset="100%" stopColor={C.rojo} stopOpacity="0" /></RadialGradient></Defs>
          <Ellipse cx={R * 0.6} cy={R * 0.6} rx={R * 0.6} ry={R * 0.6} fill="url(#g1)" />
        </Svg>
      </Animated.View>
      <Animated.View style={{ position: "absolute", bottom: -R * 0.3, right: -R * 0.35, opacity: b.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.85] }), transform: [{ translateX: b.interpolate({ inputRange: [0, 1], outputRange: [20, -30] }) }] }}>
        <Svg width={R * 0.95} height={R * 0.95}>
          <Defs><RadialGradient id="g2" cx="50%" cy="50%" r="50%"><Stop offset="0%" stopColor={C.rojoOscuro} stopOpacity="0.55" /><Stop offset="100%" stopColor={C.rojoOscuro} stopOpacity="0" /></RadialGradient></Defs>
          <Ellipse cx={R * 0.475} cy={R * 0.475} rx={R * 0.475} ry={R * 0.475} fill="url(#g2)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

// Entrada escalonada: cada bloque aparece subiendo y con fundido
function Entra({ i = 0, children, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 520, delay: 120 + i * 80, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, i]);
  return <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }] }, style]}>{children}</Animated.View>;
}

// Logo: aparece con resorte y luego flota suavemente
function LogoAnimado({ tam }) {
  const ent = useRef(new Animated.Value(0)).current;
  const flota = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(ent, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }).start();
    Animated.loop(Animated.sequence([
      Animated.timing(flota, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(flota, { toValue: 0, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, [ent, flota]);
  return (
    <Animated.View style={{ alignSelf: "center", opacity: ent, transform: [{ scale: ent.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }, { translateY: flota.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] }) }] }}>
      <Image source={LOGO} style={{ width: tam, height: tam }} resizeMode="contain" />
    </Animated.View>
  );
}

// Botón principal con rebote al tocar
function Boton({ texto, onPress, cargando, deshabilitado }) {
  const s = useRef(new Animated.Value(1)).current;
  const mover = (to) => Animated.spring(s, { toValue: to, friction: 5, tension: 200, useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale: s }], opacity: cargando || deshabilitado ? 0.7 : 1 }}>
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} disabled={cargando || deshabilitado} onPressIn={() => mover(0.97)} onPressOut={() => mover(1)} style={styles.btnPrimary}>
        {cargando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryTexto}>{texto}</Text>}
      </TouchableOpacity>
    </Animated.View>
  );
}

function Campo({ etiqueta, icono, derecha, ...props }) {
  const [enfocado, setEnfocado] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{etiqueta}</Text>
      <View style={[styles.campo, enfocado && styles.campoEnfocado]}>
        <Ionicons name={icono} size={18} color={enfocado ? C.rojoClaro : C.tenue} />
        <TextInput
          style={styles.input}
          placeholderTextColor="rgba(245,245,247,0.35)"
          selectionColor={C.rojoClaro}
          keyboardAppearance="dark"
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
  const [act, setAct] = useState({ codigo_taller: "", codigo_activacion: "", nombre_completo: "", username: "", correo: "", password: "", confirmar: "" });
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
    if (!act.correo.trim()) return setErrorAct("Escribe tu correo electrónico: por ahí vas a entrar de aquí en adelante.");
    if (act.password.length < 6) return setErrorAct("La contraseña debe tener al menos 6 caracteres.");
    if (act.password !== act.confirmar) return setErrorAct("Las contraseñas no coinciden.");
    setCargandoAct(true);
    try {
      const data = await api.post("/auth/activar-taller", {
        codigo_taller: act.codigo_taller, codigo_activacion: act.codigo_activacion,
        nombre_completo: act.nombre_completo, username: act.username.trim(),
        correo: act.correo.trim(), password: act.password,
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
      const res = await api.post("/auth/password/solicitar", { correo: identificador });
      setMensajeRecuperacion(res.detail);
    } catch (err) {
      setMensajeRecuperacion(err.message);
    } finally {
      setCargandoRecuperacion(false);
    }
  }

  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const modo = activando ? (tallerActivar ? "act2" : "act1") : recuperando ? "rec" : "login";
  const tam = Math.min(W * 0.66, modo === "login" ? 270 : 170);
  let n = 0;
  const E = (children, extra) => <Entra key={`${modo}-${n}`} i={n++} style={extra}>{children}</Entra>;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Fondo />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      >
        <LogoAnimado tam={tam} />
        <View style={styles.contenido}>
          {activando ? (
            <>
              {E(<Text style={styles.titulo}>{tallerActivar ? `Activa ${tallerActivar.nombre}` : "Activa tu taller"}</Text>)}
              {!tallerActivar ? (
                <>
                  {E(<Text style={styles.ayuda}>Escribe los códigos que te mandó ALDM. Solo se hace la primera vez.</Text>)}
                  {E(<Campo etiqueta="Código del taller" icono="business-outline" value={act.codigo_taller} onChangeText={(v) => campoAct("codigo_taller")(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} />)}
                  {E(<Campo etiqueta="Código de activación" icono="key-outline" value={act.codigo_activacion} onChangeText={(v) => campoAct("codigo_activacion")(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} onSubmitEditing={verificarActivacion} />)}
                </>
              ) : (
                <>
                  {E(<Text style={styles.ayuda}>Crea tu usuario de administrador. Con él vas a entrar de aquí en adelante.</Text>)}
                  {E(<Campo etiqueta="Nombre completo" icono="person-outline" value={act.nombre_completo} onChangeText={campoAct("nombre_completo")} />)}
                  {E(<Campo etiqueta="Usuario" icono="at-outline" value={act.username} onChangeText={campoAct("username")} autoCapitalize="none" autoCorrect={false} />)}
                  {E(<Campo etiqueta="Correo electrónico" icono="mail-outline" value={act.correo} onChangeText={campoAct("correo")} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} placeholder="Con este vas a entrar" />)}
                  {E(<Campo etiqueta="Contraseña" icono="lock-closed-outline" value={act.password} onChangeText={campoAct("password")} secureTextEntry placeholder="Mínimo 6 caracteres" />)}
                  {E(<Campo etiqueta="Confirmar contraseña" icono="lock-closed-outline" value={act.confirmar} onChangeText={campoAct("confirmar")} secureTextEntry onSubmitEditing={activarTaller} />)}
                </>
              )}
              {errorAct ? E(<Text style={styles.errorTexto}>{errorAct}</Text>) : (n++, null)}
              {E(<Boton texto={tallerActivar ? "Crear mi usuario y entrar" : "Continuar"} onPress={tallerActivar ? activarTaller : verificarActivacion} cargando={cargandoAct} />)}
              {E(<TouchableOpacity onPress={() => { setActivando(false); setTallerActivar(null); setErrorAct(""); }} style={styles.linkBtn}><Text style={styles.link}>← Volver a iniciar sesión</Text></TouchableOpacity>)}
            </>
          ) : !recuperando ? (
            <>
              {E(<Text style={styles.titulo}>Bienvenido</Text>)}
              {E(<Text style={styles.ayuda}>Inicia sesión para administrar tu taller.</Text>)}
              {E(<Campo etiqueta="Correo electrónico" icono="person-outline" value={username} onChangeText={setUsername} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />)}
              {E(
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
                      <Ionicons name={verPassword ? "eye-off-outline" : "eye-outline"} size={18} color={C.tenue} />
                    </TouchableOpacity>
                  }
                />
              )}
              {error ? E(<Text style={styles.errorTexto}>{error}</Text>) : (n++, null)}
              {E(<Boton texto="Entrar" onPress={handleLogin} cargando={loading} />)}
              {E(
                <View style={styles.links}>
                  <TouchableOpacity onPress={() => { setRecuperando(true); setMensajeRecuperacion(""); setIdentificador(""); }} style={styles.linkBtn}>
                    <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setActivando(true); setErrorAct(""); }} style={styles.linkBtn}>
                    <Text style={styles.linkTenue}>¿Primera vez? <Text style={styles.link}>Activa tu taller</Text></Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <>
              {E(<Text style={styles.titulo}>Recuperar contraseña</Text>)}
              {E(<Campo etiqueta="Correo electrónico" icono="at-outline" value={identificador} onChangeText={setIdentificador} autoCapitalize="none" keyboardType="email-address" placeholder="Con el que entras al sistema" />)}
              {mensajeRecuperacion ? E(<Text style={styles.recoveryMsg}>{mensajeRecuperacion}</Text>) : (n++, null)}
              {E(<Boton texto="Mandarme el enlace" onPress={handleRecuperar} cargando={cargandoRecuperacion} />)}
              {E(<TouchableOpacity onPress={() => setRecuperando(false)} style={styles.linkBtn}><Text style={styles.link}>← Volver a iniciar sesión</Text></TouchableOpacity>)}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Pantalla completa, fondo negro fundido con el logo y vidrio translúcido en los campos
const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: C.fondo },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 28 },
  contenido: { width: "100%", maxWidth: 420, alignSelf: "center", marginTop: 4 },
  titulo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 32, color: C.texto, textAlign: "center", marginBottom: 2 },
  ayuda: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.tenue, textAlign: "center", marginBottom: 18, lineHeight: 20 },
  field: { marginBottom: 14 },
  label: { fontFamily: "Inter_800ExtraBold", fontSize: 11.5, color: C.tenue, marginBottom: 7, textTransform: "uppercase", letterSpacing: 1 },
  campo: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.vidrio,
    borderWidth: 1.5, borderColor: C.borde, borderRadius: 14, paddingHorizontal: 14, height: 52,
  },
  campoEnfocado: { borderColor: C.rojoClaro, backgroundColor: "rgba(225,6,0,0.10)", shadowColor: C.rojo, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  input: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 16, color: C.texto, height: "100%" },
  errorTexto: { fontFamily: "Inter_600SemiBold", color: C.rojoClaro, fontSize: 13, marginBottom: 10, textAlign: "center", lineHeight: 18 },
  btnPrimary: {
    backgroundColor: C.rojo, borderRadius: 14, height: 54, alignItems: "center", justifyContent: "center", marginTop: 6,
    shadowColor: C.rojo, shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  btnPrimaryTexto: { fontFamily: "Inter_700Bold", color: "#fff", fontSize: 16, letterSpacing: 0.4 },
  links: { alignItems: "center", marginTop: 6 },
  linkBtn: { marginTop: 14, alignItems: "center", padding: 4 },
  link: { fontFamily: "Inter_600SemiBold", color: C.rojoClaro, fontSize: 14 },
  linkTenue: { fontFamily: "Inter_400Regular", color: C.tenue, fontSize: 14 },
  recoveryMsg: { fontFamily: "Inter_400Regular", backgroundColor: "rgba(225,6,0,0.12)", borderWidth: 1, borderColor: "rgba(255,74,63,0.35)", color: C.texto, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, fontSize: 13.5, lineHeight: 19, marginBottom: 14 },
});
