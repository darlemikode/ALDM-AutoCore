import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { estadoGuardado, guardarEstado } from "./estadoNavegacion";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import MisServiciosScreen from "../screens/MisServiciosScreen";
import ServicioDetalleScreen from "../screens/ServicioDetalleScreen";
import MisVehiculosScreen from "../screens/MisVehiculosScreen";
import AgendarScreen from "../screens/AgendarScreen";
import MasScreen from "../screens/MasScreen";
import { colors, temaActivo } from "../theme";

const Tab = createBottomTabNavigator();
const InicioStack = createNativeStackNavigator();
const VehiculosStack = createNativeStackNavigator();
const AgendarStack = createNativeStackNavigator();
const CuentaStack = createNativeStackNavigator();

// Mismo encabezado que la app del taller (.page-header de la web)
const HEADER = () => ({
  headerTintColor: colors.ink900,
  headerStyle: { backgroundColor: colors.paper0 },
  headerTitleStyle: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 24, color: colors.ink900 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.paper0 },
});

const pila = (Stack, nombre, Componente, titulo, extra = null) => function Pila() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen name={nombre} component={Componente} options={{ title: titulo }} />
      {extra}
    </Stack.Navigator>
  );
};

const InicioPila = pila(InicioStack, "MisServicios", MisServiciosScreen, "MI VEHÍCULO",
  <InicioStack.Screen name="ServicioDetalle" component={ServicioDetalleScreen} options={{ title: "Mi servicio" }} />);
const VehiculosPila = pila(VehiculosStack, "MisVehiculos", MisVehiculosScreen, "MIS VEHÍCULOS");
const AgendarPila = pila(AgendarStack, "AgendarCita", AgendarScreen, "AGENDAR");
const CuentaPila = pila(CuentaStack, "MiCuenta", MasScreen, "MI CUENTA");

const ICONOS = {
  Inicio: ["home", "home-outline"],
  Vehículos: ["car", "car-outline"],
  Agendar: ["calendar", "calendar-outline"],
  Cuenta: ["person-circle", "person-circle-outline"],
};

export default function AppNavigator() {
  const base = temaActivo() === "oscuro" ? DarkTheme : DefaultTheme;
  return (
    <NavigationContainer initialState={estadoGuardado()} onStateChange={guardarEstado} theme={{ ...base, colors: { ...base.colors, primary: colors.petrol500, background: colors.paper0, card: colors.paper100, text: colors.ink900, border: colors.ink300 } }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.petrol600,
          tabBarInactiveTintColor: colors.ink500,
          tabBarIcon: ({ focused, color }) => <Ionicons name={ICONOS[route.name][focused ? 0 : 1]} size={23} color={color} />,
          tabBarStyle: { backgroundColor: colors.paper100, borderTopColor: colors.ink300, height: 64, paddingBottom: 8, paddingTop: 6 },
          tabBarLabelStyle: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
        })}
      >
        <Tab.Screen name="Inicio" component={InicioPila} />
        <Tab.Screen name="Vehículos" component={VehiculosPila} />
        <Tab.Screen name="Agendar" component={AgendarPila} />
        <Tab.Screen name="Cuenta" component={CuentaPila} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
