import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View, ActivityIndicator, Linking } from "react-native";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from "@expo-google-fonts/inter";
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { TemaProvider, useTema } from "./src/context/TemaContext";
import LoginScreen from "./src/screens/LoginScreen";
import TallerScreen, { consultarTaller } from "./src/screens/TallerScreen";
import { extraerCodigo, getTallerCodigo, setTallerCodigo } from "./src/taller";
import ChatbotScreen from "./src/screens/ChatbotScreen";
import AppNavigator from "./src/navigation/AppNavigator";
import { colors } from "./src/theme";
import { DialogoHost } from "./src/ui/Dialogo";

function Contenido() {
  const { cliente, loading } = useAuth();
  const { tema } = useTema();
  const [mostrarChatbot, setMostrarChatbot] = useState(false);
  // undefined = todavía leyendo; null = sin taller elegido
  const [tallerCodigo, setTallerCodigoLocal] = useState(undefined);
  const [tallerInfo, setTallerInfo] = useState(null);
  const [codigoDeEnlace, setCodigoDeEnlace] = useState(null);

  useEffect(() => {
    getTallerCodigo().then((c) => setTallerCodigoLocal(c || null));
    // QR escaneado con la cámara del teléfono: aldmcliente://taller/CODIGO
    const procesar = (url) => {
      const codigo = url && url.includes("taller") ? extraerCodigo(url) : null;
      if (codigo) setCodigoDeEnlace(codigo);
    };
    Linking.getInitialURL().then(procesar).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => procesar(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (tallerCodigo) consultarTaller(tallerCodigo).then(setTallerInfo).catch(() => setTallerInfo(null));
  }, [tallerCodigo]);

  async function cambiarTaller() {
    await setTallerCodigo(null);
    setTallerInfo(null);
    setTallerCodigoLocal(null);
  }

  let pantalla;
  const pedirTaller = !cliente && (!tallerCodigo || (codigoDeEnlace && codigoDeEnlace !== tallerCodigo));
  if (loading || tallerCodigo === undefined) {
    pantalla = (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.petrol500} size="large" />
      </View>
    );
  } else if (pedirTaller) {
    pantalla = (
      <TallerScreen
        codigoInicial={codigoDeEnlace}
        onListo={(info) => { setTallerInfo(info); setTallerCodigoLocal(info.codigo); setCodigoDeEnlace(null); }}
      />
    );
  } else if (mostrarChatbot) {
    pantalla = <ChatbotScreen onClose={() => setMostrarChatbot(false)} />;
  } else {
    pantalla = cliente ? <AppNavigator /> : <LoginScreen onAbrirChatbot={() => setMostrarChatbot(true)} taller={tallerInfo} onCambiarTaller={cambiarTaller} />;
  }

  // key={tema}: al cambiar de tema se vuelve a montar la interfaz con la paleta nueva
  return (
    <View key={tema} style={{ flex: 1, backgroundColor: colors.paper0 }}>
      <StatusBar style={(tema === "oscuro") !== !cliente ? "light" : "dark"} />
      {pantalla}
      <DialogoHost />
    </View>
  );
}

export default function App() {
  const [fuentes] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold,
    BarlowCondensed_600SemiBold, BarlowCondensed_700Bold,
  });
  if (!fuentes) return <View style={{ flex: 1, backgroundColor: "#132a33" }} />;
  return (
    <TemaProvider>
      <AuthProvider>
        <Contenido />
      </AuthProvider>
    </TemaProvider>
  );
}
