import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from "@expo-google-fonts/inter";
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { TemaProvider, useTema } from "./src/context/TemaContext";
import LoginScreen from "./src/screens/LoginScreen";
import AppNavigator from "./src/navigation/AppNavigator";
import { colors } from "./src/theme";
import { DialogoHost } from "./src/ui/Dialogo";

function Contenido() {
  const { usuario, cargando } = useAuth();
  const { tema } = useTema();
  let pantalla;
  if (cargando) {
    pantalla = (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.petrol500} size="large" />
      </View>
    );
  } else {
    pantalla = usuario ? <AppNavigator /> : <LoginScreen />;
  }
  return (
    <View key={tema} style={{ flex: 1, backgroundColor: colors.paper0 }}>
      <StatusBar style={(tema === "oscuro") !== !usuario ? "light" : "dark"} />
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
