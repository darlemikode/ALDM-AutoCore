import "react-native-gesture-handler"; // debe ser el primer import del archivo (lo requiere el drawer)
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from "@expo-google-fonts/inter";
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed";
import { View, ActivityIndicator } from "react-native";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { TemaProvider, useTema } from "./src/context/TemaContext";
import LoginScreen from "./src/screens/LoginScreen";
import BiometricLockScreen from "./src/screens/BiometricLockScreen";
import AppNavigator from "./src/navigation/AppNavigator";
import { colors } from "./src/theme";
import { DialogoHost } from "./src/ui/Dialogo";
import { AvisoSuscripcion, PantallaBloqueo } from "./src/ui/AvisoSuscripcion";
import SelectorTaller from "./src/ui/SelectorTaller";
import { iniciarActualizacionesGlobales } from "./src/actualizacionesGlobales";
import { iniciarMonitoreoNotificaciones } from "./src/notificaciones";

function Root() {
  const { user, loading, lockedByBiometrics, estadoSuscripcion } = useAuth();
  const { tema } = useTema();

  // Arranca una sola vez por apertura de la app: revisa si hay servidor
  // (y lo vuelve a revisar cada tanto) y, en cuanto detecta que se
  // recuperó la conexión, sube lo pendiente y refresca el catálogo solo.
  useEffect(() => {
  }, []);

  // Se reconecta cada vez que cambia la sesión (login/logout) para usar
  // siempre el token correcto.
  // Se reconecta al cambiar de taller: el canal en vivo es por taller.
  useEffect(() => {
    if (user) {
      iniciarActualizacionesGlobales();
      iniciarMonitoreoNotificaciones();
    }
  }, [user?.username, user?.id_taller]);

  let contenido;
  if (loading) {
    contenido = (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.petrol500} />
      </View>
    );
  } else if (lockedByBiometrics) {
    contenido = <BiometricLockScreen />;
  } else {
    contenido = !user ? <LoginScreen /> : estadoSuscripcion?.bloqueado ? <PantallaBloqueo /> : <AppNavigator key={user.id_taller || "local"} />;
  }

  // key={tema}: al cambiar de tema se vuelve a montar la interfaz (no la
  // sesión) para que todas las pantallas tomen la paleta nueva.
  return (
    <View key={tema} style={{ flex: 1, backgroundColor: colors.paper0 }}>
      {/* El login usa fondo --ink-900 (oscuro en tema claro, claro en tema oscuro), igual que la web */}
      <StatusBar style={(tema === "oscuro") !== !user ? "light" : "dark"} />
      {user ? <AvisoSuscripcion /> : null}
      {contenido}
      {user ? <SelectorTaller /> : null}
      <DialogoHost />
    </View>
  );
}

export default function App() {
  const [fontsCargadas] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });

  if (!fontsCargadas) return <View style={{ flex: 1, backgroundColor: "#132a33" }} />;

  return (
    <TemaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </TemaProvider>
  );
}
