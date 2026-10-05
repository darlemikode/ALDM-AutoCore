<<<<<<< Updated upstream
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View } from "react-native";
import BadgeIcono from "../ui/BadgeIcono";
import { colors, temaActivo } from "../theme";
import InicioScreen from "../screens/InicioScreen";
import TalleresScreen from "../screens/TalleresScreen";
import TallerDetalleScreen from "../screens/TallerDetalleScreen";
import TallerFormScreen from "../screens/TallerFormScreen";
import PagosScreen from "../screens/PagosScreen";
import MasScreen from "../screens/MasScreen";
import ConfiguracionScreen from "../screens/ConfiguracionScreen";
import UsuariosScreen from "../screens/UsuariosScreen";
import SolicitudesScreen from "../screens/SolicitudesScreen";
import UsuarioDetalleScreen from "../screens/UsuarioDetalleScreen";
import { PaquetesScreen, ModulosScreen, TiposCobroScreen } from "../screens/CatalogosScreens";

const Tab = createBottomTabNavigator();
const InicioStack = createNativeStackNavigator();
const TalleresStack = createNativeStackNavigator();
const PagosStack = createNativeStackNavigator();
const MasStack = createNativeStackNavigator();

const HEADER = () => ({
  headerTintColor: colors.ink900,
  headerStyle: { backgroundColor: colors.paper0 },
  headerTitleStyle: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 24, color: colors.ink900 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.paper0 },
});

function InicioPila() {
  return (
    <InicioStack.Navigator screenOptions={HEADER}>
      <InicioStack.Screen name="Inicio" component={InicioScreen} options={{ title: "ALDM SÚPER ADMIN" }} />
    </InicioStack.Navigator>
  );
}

function TalleresPila() {
  return (
    <TalleresStack.Navigator screenOptions={HEADER}>
      <TalleresStack.Screen name="Talleres" component={TalleresScreen} options={{ title: "TALLERES" }} />
      <TalleresStack.Screen name="TallerDetalle" component={TallerDetalleScreen} options={{ title: "Taller" }} />
      <TalleresStack.Screen name="TallerForm" component={TallerFormScreen} options={{ title: "Taller", presentation: "modal", headerShown: false }} />
      <TalleresStack.Screen name="UsuarioDetalle" component={UsuarioDetalleScreen} options={{ title: "Usuario" }} />
    </TalleresStack.Navigator>
  );
}

function PagosPila() {
  return (
    <PagosStack.Navigator screenOptions={HEADER}>
      <PagosStack.Screen name="Pagos" component={PagosScreen} options={{ title: "COBRANZA" }} />
    </PagosStack.Navigator>
  );
}

function MasPila() {
  return (
    <MasStack.Navigator screenOptions={HEADER}>
      <MasStack.Screen name="MasMenu" component={MasScreen} options={{ title: "MÁS" }} />
      <MasStack.Screen name="Paquetes" component={PaquetesScreen} options={{ title: "Paquetes y precios" }} />
      <MasStack.Screen name="TiposCobro" component={TiposCobroScreen} options={{ title: "Tipos de cobro" }} />
      <MasStack.Screen name="Modulos" component={ModulosScreen} options={{ title: "Módulos" }} />
      <MasStack.Screen name="Configuracion" component={ConfiguracionScreen} options={{ title: "Reglas de suscripción" }} />
      <MasStack.Screen name="Solicitudes" component={SolicitudesScreen} options={{ title: "Solicitudes" }} />
      <MasStack.Screen name="Usuarios" component={UsuariosScreen} options={{ title: "Usuarios" }} />
      <MasStack.Screen name="UsuarioDetalle" component={UsuarioDetalleScreen} options={{ title: "Usuario" }} />
    </MasStack.Navigator>
  );
}

const ICONOS = {
  InicioTab: ["grid-outline", "#2de2d0"],
  TalleresTab: ["business-outline", "#8ea2ff"],
  PagosTab: ["cash-outline", "#f2c94c"],
  MasTab: ["ellipsis-horizontal-circle-outline", "#c39bff"],
};

export default function AppNavigator() {
  const base = temaActivo() === "oscuro" ? DarkTheme : DefaultTheme;
  return (
    <NavigationContainer theme={{ ...base, colors: { ...base.colors, primary: colors.petrol500, background: colors.paper0, card: colors.paper100, text: colors.ink900, border: colors.ink300 } }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.petrol600,
          tabBarInactiveTintColor: colors.ink500,
          tabBarStyle: { backgroundColor: colors.paper100, borderTopColor: colors.ink300 },
          tabBarIcon: ({ focused }) => <View style={{ opacity: focused ? 1 : 0.7 }}><BadgeIcono icono={ICONOS[route.name][0]} color={ICONOS[route.name][1]} size={32} activo={focused} /></View>,
        })}
      >
        <Tab.Screen name="InicioTab" component={InicioPila} options={{ title: "Inicio" }} />
        <Tab.Screen name="TalleresTab" component={TalleresPila} options={{ title: "Talleres" }} />
        <Tab.Screen name="PagosTab" component={PagosPila} options={{ title: "Cobranza" }} />
        <Tab.Screen name="MasTab" component={MasPila} options={{ title: "Más" }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
=======
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View } from "react-native";
import BadgeIcono from "../ui/BadgeIcono";
import { colors, temaActivo } from "../theme";
import InicioScreen from "../screens/InicioScreen";
import TalleresScreen from "../screens/TalleresScreen";
import TallerDetalleScreen from "../screens/TallerDetalleScreen";
import TallerFormScreen from "../screens/TallerFormScreen";
import PagosScreen from "../screens/PagosScreen";
import MasScreen from "../screens/MasScreen";
import ConfiguracionScreen from "../screens/ConfiguracionScreen";
import UsuariosScreen from "../screens/UsuariosScreen";
import SolicitudesScreen from "../screens/SolicitudesScreen";
import UsuarioDetalleScreen from "../screens/UsuarioDetalleScreen";
import { PaquetesScreen, ModulosScreen, TiposCobroScreen } from "../screens/CatalogosScreens";

const Tab = createBottomTabNavigator();
const InicioStack = createNativeStackNavigator();
const TalleresStack = createNativeStackNavigator();
const PagosStack = createNativeStackNavigator();
const MasStack = createNativeStackNavigator();

const HEADER = () => ({
  headerTintColor: colors.ink900,
  headerStyle: { backgroundColor: colors.paper0 },
  headerTitleStyle: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 24, color: colors.ink900 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.paper0 },
});

function InicioPila() {
  return (
    <InicioStack.Navigator screenOptions={HEADER}>
      <InicioStack.Screen name="Inicio" component={InicioScreen} options={{ title: "ALDM SÚPER ADMIN" }} />
    </InicioStack.Navigator>
  );
}

function TalleresPila() {
  return (
    <TalleresStack.Navigator screenOptions={HEADER}>
      <TalleresStack.Screen name="Talleres" component={TalleresScreen} options={{ title: "TALLERES" }} />
      <TalleresStack.Screen name="TallerDetalle" component={TallerDetalleScreen} options={{ title: "Taller" }} />
      <TalleresStack.Screen name="TallerForm" component={TallerFormScreen} options={{ title: "Taller", presentation: "modal", headerShown: false }} />
      <TalleresStack.Screen name="UsuarioDetalle" component={UsuarioDetalleScreen} options={{ title: "Usuario" }} />
    </TalleresStack.Navigator>
  );
}

function PagosPila() {
  return (
    <PagosStack.Navigator screenOptions={HEADER}>
      <PagosStack.Screen name="Pagos" component={PagosScreen} options={{ title: "COBRANZA" }} />
    </PagosStack.Navigator>
  );
}

function MasPila() {
  return (
    <MasStack.Navigator screenOptions={HEADER}>
      <MasStack.Screen name="MasMenu" component={MasScreen} options={{ title: "MÁS" }} />
      <MasStack.Screen name="Paquetes" component={PaquetesScreen} options={{ title: "Paquetes y precios" }} />
      <MasStack.Screen name="TiposCobro" component={TiposCobroScreen} options={{ title: "Tipos de cobro" }} />
      <MasStack.Screen name="Modulos" component={ModulosScreen} options={{ title: "Módulos" }} />
      <MasStack.Screen name="Configuracion" component={ConfiguracionScreen} options={{ title: "Reglas de suscripción" }} />
      <MasStack.Screen name="Solicitudes" component={SolicitudesScreen} options={{ title: "Solicitudes" }} />
      <MasStack.Screen name="Usuarios" component={UsuariosScreen} options={{ title: "Usuarios" }} />
      <MasStack.Screen name="UsuarioDetalle" component={UsuarioDetalleScreen} options={{ title: "Usuario" }} />
    </MasStack.Navigator>
  );
}

const ICONOS = {
  InicioTab: ["grid-outline", "#2de2d0"],
  TalleresTab: ["business-outline", "#8ea2ff"],
  PagosTab: ["cash-outline", "#f2c94c"],
  MasTab: ["ellipsis-horizontal-circle-outline", "#c39bff"],
};

export default function AppNavigator() {
  const base = temaActivo() === "oscuro" ? DarkTheme : DefaultTheme;
  return (
    <NavigationContainer theme={{ ...base, colors: { ...base.colors, primary: colors.petrol500, background: colors.paper0, card: colors.paper100, text: colors.ink900, border: colors.ink300 } }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.petrol600,
          tabBarInactiveTintColor: colors.ink500,
          tabBarStyle: { backgroundColor: colors.paper100, borderTopColor: colors.ink300 },
          tabBarIcon: ({ focused }) => <View style={{ opacity: focused ? 1 : 0.7 }}><BadgeIcono icono={ICONOS[route.name][0]} color={ICONOS[route.name][1]} size={32} activo={focused} /></View>,
        })}
      >
        <Tab.Screen name="InicioTab" component={InicioPila} options={{ title: "Inicio" }} />
        <Tab.Screen name="TalleresTab" component={TalleresPila} options={{ title: "Talleres" }} />
        <Tab.Screen name="PagosTab" component={PagosPila} options={{ title: "Cobranza" }} />
        <Tab.Screen name="MasTab" component={MasPila} options={{ title: "Más" }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
>>>>>>> Stashed changes
