import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { estadoGuardado, guardarEstado } from "./estadoNavegacion";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { Text, View, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DashboardScreen from "../screens/DashboardScreen";
import ClientesScreen from "../screens/ClientesScreen";
import ClienteDetalleScreen from "../screens/ClienteDetalleScreen";
import ClienteFormScreen from "../screens/ClienteFormScreen";
import VehiculoFormScreen from "../screens/VehiculoFormScreen";
import NuevaOrdenScreen from "../screens/NuevaOrdenScreen";
import ServiciosScreen from "../screens/ServiciosScreen";
import ServicioDetalleScreen from "../screens/ServicioDetalleScreen";
import RefaccionesScreen from "../screens/RefaccionesScreen";
import VehiculosScreen from "../screens/VehiculosScreen";
import MasScreen from "../screens/MasScreen";
import ProveedoresScreen from "../screens/ProveedoresScreen";
import ProveedorDetalleScreen from "../screens/ProveedorDetalleScreen";
import HerramientasScreen from "../screens/HerramientasScreen";
import CatalogosScreen from "../screens/CatalogosScreen";
import CitasScreen from "../screens/CitasScreen";
import AsistenteScreen from "../screens/AsistenteScreen";
import EmpleadosScreen from "../screens/EmpleadosScreen";
import NominaScreen from "../screens/NominaScreen";
import PeriodoNominaDetalleScreen from "../screens/PeriodoNominaDetalleScreen";
import GestionRolesScreen from "../screens/GestionRolesScreen";
import ComisionesScreen from "../screens/ComisionesScreen";
import DatosTallerScreen from "../screens/DatosTallerScreen";
import UsuariosScreen from "../screens/UsuariosScreen";
import PromocionesScreen from "../screens/PromocionesScreen";
import InventarioListaScreen from "../screens/InventarioListaScreen";
import InventarioDetalleScreen from "../screens/InventarioDetalleScreen";
import MiDashboardScreen from "../screens/MiDashboardScreen";
import CotizacionesScreen from "../screens/CotizacionesScreen";
import CotizacionDetalleScreen from "../screens/CotizacionDetalleScreen";
import { colors, temaActivo } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { useAuth } from "../context/AuthContext";
import { useTema } from "../context/TemaContext";
import { alerta } from "../ui/Dialogo";
import { SelectorEstado } from "../ui/AvisoSuscripcion";
import CampanaNotificaciones from "../ui/CampanaNotificaciones";

const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();
const VehiculosStack = createNativeStackNavigator();
const ClientesStack = createNativeStackNavigator();
const ServicioStack = createNativeStackNavigator();
const MasStack = createNativeStackNavigator();
const RefaccionesStack = createNativeStackNavigator();
const CatalogosStack = createNativeStackNavigator();

// ☰ — abre el menú lateral desde cualquier pantalla (igual que la barra
// superior móvil de la web). getParent("RootDrawer") funciona sin importar
// qué tan anidada esté la pantalla.
function BotonMenu({ navigation, lado = "izquierda" }) {
  return (
    <TouchableOpacity
      onPress={() => {
        const drawer = navigation.getParent("RootDrawer");
        if (drawer) drawer.openDrawer();
        else navigation.openDrawer?.();
      }}
      hitSlop={10}
      style={{ paddingHorizontal: 4, marginRight: lado === "izquierda" ? 12 : 0 }}
      accessibilityLabel="Abrir menú"
    >
      <Ionicons name="menu" size={24} color={colors.ink900} />
    </TouchableOpacity>
  );
}

// Encabezado común (equivalente a .page-header h1 de la web). Las pantallas
// raíz de cada sección llevan ☰ a la izquierda; las de detalle llevan la
// flecha de regresar y ☰ a la derecha, así el menú siempre está a la mano.
function opcionesHeader(pantallasRaiz) {
  return ({ navigation, route }) => {
    const esRaiz = pantallasRaiz.includes(route.name);
    return {
      headerTintColor: colors.ink900,
      headerStyle: { backgroundColor: colors.paper0 },
      headerTitleStyle: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 24, color: colors.ink900 },
      headerShadowVisible: false,
      contentStyle: { backgroundColor: colors.paper0 },
      ...(esRaiz
        ? { headerLeft: () => <BotonMenu navigation={navigation} />, headerRight: () => <CampanaNotificaciones navigation={navigation} /> }
        : { headerRight: () => <BotonMenu navigation={navigation} lado="derecha" /> }),
    };
  };
}

function VehiculosStackScreen() {
  return (
    <VehiculosStack.Navigator screenOptions={opcionesHeader(["VehiculosLista"])}>
      <VehiculosStack.Screen name="VehiculosLista" component={VehiculosScreen} options={{ title: "VEHÍCULOS" }} />
      <VehiculosStack.Screen name="VehiculoForm" component={VehiculoFormScreen} options={{ title: "Nuevo vehículo", presentation: "modal" }} />
    </VehiculosStack.Navigator>
  );
}

function CatalogosStackScreen() {
  return (
    <CatalogosStack.Navigator screenOptions={opcionesHeader(["CatalogosLista"])}>
      <CatalogosStack.Screen name="CatalogosLista" component={CatalogosScreen} options={{ title: "CATÁLOGOS" }} />
    </CatalogosStack.Navigator>
  );
}

function ClientesStackScreen() {
  return (
    <ClientesStack.Navigator screenOptions={opcionesHeader(["ClientesLista"])}>
      <ClientesStack.Screen name="ClientesLista" component={ClientesScreen} options={{ title: "CLIENTES" }} />
      <ClientesStack.Screen name="ClienteDetalle" component={ClienteDetalleScreen} options={{ title: "Cliente" }} />
      <ClientesStack.Screen name="ClienteForm" component={ClienteFormScreen} options={{ title: "Nuevo cliente", presentation: "modal" }} />
      <ClientesStack.Screen name="VehiculoForm" component={VehiculoFormScreen} options={{ title: "Nuevo vehículo", presentation: "modal" }} />
    </ClientesStack.Navigator>
  );
}

// Igual que Clientes: la lista vive en su propio stack para poder navegar
// al detalle de Inventario de una refacción sin salir del tab.
function RefaccionesStackScreen() {
  return (
    <RefaccionesStack.Navigator screenOptions={opcionesHeader(["RefaccionesLista"])}>
      <RefaccionesStack.Screen name="RefaccionesLista" component={RefaccionesScreen} options={{ title: "REFACCIONES" }} />
      <RefaccionesStack.Screen name="InventarioDetalle" component={InventarioDetalleScreen} options={{ title: "Inventario" }} />
    </RefaccionesStack.Navigator>
  );
}

// El tab "Servicio" abre en el historial (con pestañas por estatus y el
// botón "+" para dar de alta).
function ServicioStackScreen() {
  return (
    <ServicioStack.Navigator screenOptions={opcionesHeader(["HistorialServicios"])}>
      <ServicioStack.Screen name="HistorialServicios" component={ServiciosScreen} options={{ title: "ÓRDENES DE SERVICIO" }} />
      <ServicioStack.Screen name="NuevaOrden" component={NuevaOrdenScreen} options={{ title: "Nueva orden" }} />
      <ServicioStack.Screen name="ServicioDetalle" component={ServicioDetalleScreen} options={{ title: "Orden" }} />
    </ServicioStack.Navigator>
  );
}

function MasStackScreen() {
  return (
    <MasStack.Navigator screenOptions={opcionesHeader(["MasMenu"])}>
      <MasStack.Screen name="MasMenu" component={MasScreen} options={{ title: "MÁS" }} />
      <MasStack.Screen name="Proveedores" component={ProveedoresScreen} options={{ title: "Proveedores" }} />
      <MasStack.Screen name="ProveedorDetalle" component={ProveedorDetalleScreen} options={{ title: "Proveedor" }} />
      <MasStack.Screen name="Herramientas" component={HerramientasScreen} options={{ title: "Herramientas" }} />
      <MasStack.Screen name="Citas" component={CitasScreen} options={{ title: "Citas solicitadas" }} />
      <MasStack.Screen name="Asistente" component={AsistenteScreen} options={{ title: "Asistente" }} />
      <MasStack.Screen name="Empleados" component={EmpleadosScreen} options={{ title: "Empleados" }} />
      <MasStack.Screen name="Nomina" component={NominaScreen} options={{ title: "Nómina" }} />
      <MasStack.Screen name="PeriodoNominaDetalle" component={PeriodoNominaDetalleScreen} options={{ title: "Periodo de nómina" }} />
      <MasStack.Screen name="GestionRoles" component={GestionRolesScreen} options={{ title: "Roles y permisos" }} />
      <MasStack.Screen name="Comisiones" component={ComisionesScreen} options={{ title: "Comisiones" }} />
      <MasStack.Screen name="DatosTaller" component={DatosTallerScreen} options={{ title: "Datos del taller" }} />
      <MasStack.Screen name="Usuarios" component={UsuariosScreen} options={{ title: "Usuarios" }} />
      <MasStack.Screen name="Promociones" component={PromocionesScreen} options={{ title: "Promociones" }} />
      <MasStack.Screen name="InventarioLista" component={InventarioListaScreen} options={{ title: "Inventario" }} />
      <MasStack.Screen name="InventarioDetalleDesdeModulo" component={InventarioDetalleScreen} options={{ title: "Inventario" }} />
      <MasStack.Screen name="MiDashboard" component={MiDashboardScreen} options={{ title: "Mi dashboard" }} />
      <MasStack.Screen name="Cotizaciones" component={CotizacionesScreen} options={{ title: "Cotizaciones" }} />
      <MasStack.Screen name="CotizacionDetalle" component={CotizacionDetalleScreen} options={{ title: "Cotización" }} />
    </MasStack.Navigator>
  );
}

const ICONOS_TAB = {
  Panel: ["grid", "grid-outline"],
  Clientes: ["people", "people-outline"],
  Refacciones: ["cube", "cube-outline"],
  Más: ["ellipsis-horizontal-circle", "ellipsis-horizontal-circle-outline"],
};

// Botón central elevado para "Servicio" — la acción del día a día del taller.
function BotonServicioGrande({ onPress, accessibilityState }) {
  const enfocado = accessibilityState?.selected;
  return (
    <TouchableOpacity style={styles.tabItemBig} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.iconWrapBig, { borderColor: colors.paper100 }, enfocado && styles.iconWrapBigActivo]}>
        <Ionicons name="construct" size={22} color={temaActivo() === "oscuro" ? colors.paper100 : "#fff"} />
      </View>
      <Text style={[styles.tabLabelBig, enfocado && { color: colors.petrol600 }]}>Servicio</Text>
    </TouchableOpacity>
  );
}

function TallerTabs() {
  const { hasPermission } = useAuth();
  return (
    <Tab.Navigator
      id="TallerTabs"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.petrol600,
        tabBarInactiveTintColor: colors.ink500,
        tabBarIcon: ({ focused, color }) => {
          const par = ICONOS_TAB[route.name];
          return par ? <Ionicons name={focused ? par[0] : par[1]} size={22} color={color} /> : null;
        },
        tabBarStyle: { backgroundColor: colors.paper100, borderTopColor: colors.ink300, borderTopWidth: 1, height: 64, paddingBottom: 8, paddingTop: 6, elevation: 0 },
        tabBarLabelStyle: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
      })}
    >
      <Tab.Screen name="Panel" component={DashboardScreen} />
      {hasPermission("clientes.ver") && <Tab.Screen name="Clientes" component={ClientesStackScreen} />}
      {hasPermission("servicios.ver") && (
        <Tab.Screen
          name="Servicio"
          component={ServicioStackScreen}
          options={{ tabBarButton: (props) => <BotonServicioGrande {...props} />, tabBarIcon: undefined }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              // Al tocar el tab siempre se regresa al historial.
              e.preventDefault();
              navigation.navigate("Servicio", { screen: "HistorialServicios", params: { resetear: Date.now() } });
            },
          })}
        />
      )}
      {hasPermission("refacciones.ver") && <Tab.Screen name="Refacciones" component={RefaccionesStackScreen} />}
      <Tab.Screen name="Más" component={MasStackScreen} />
    </Tab.Navigator>
  );
}

// ---------------- Menú lateral: espejo de la barra lateral de la web ----------------

// Ruta más profunda activa (para resaltar el enlace actual, como .nav-link.active)
function rutaActiva(state) {
  let r = state?.routes?.[state.index];
  while (r?.state?.routes) r = r.state.routes[r.state.index ?? 0];
  return r?.name;
}

function irA(navigation, destino) {
  const [raiz, tab, pantalla] = destino;
  if (!tab) return navigation.navigate(raiz);
  if (!pantalla) return navigation.navigate(raiz, { screen: tab });
  // initial:false deja la pantalla raíz del stack debajo, así "atrás" regresa a ella
  return navigation.navigate(raiz, { screen: tab, params: { screen: pantalla, initial: false } });
}

function ContenidoDrawer({ navigation, state }) {
  const { user, logout, hasPermission, talleres } = useAuth();
  const { preferencia, cambiarPreferencia } = useTema();
  const insets = useSafeAreaInsets();
  const activa = rutaActiva(state);

  const nav = [
    { grupo: "General", items: [
      { label: "Panel", icono: "grid-outline", ruta: "Panel", destino: ["Taller", "Panel"] },
      { label: "Mi dashboard", icono: "person-circle-outline", ruta: "MiDashboard", destino: ["Taller", "Más", "MiDashboard"] },
    ]},
    { grupo: "Operación", items: [
      hasPermission("servicios.ver") && { label: "Órdenes de servicio", icono: "construct-outline", ruta: "HistorialServicios", destino: ["Taller", "Servicio", "HistorialServicios"] },
      hasPermission("servicios.crear") && { label: "Nueva orden", icono: "add-circle-outline", ruta: "NuevaOrden", destino: ["Taller", "Servicio", "NuevaOrden"] },
      hasPermission("cotizaciones.ver") && { label: "Cotizaciones", icono: "document-text-outline", ruta: "Cotizaciones", destino: ["Taller", "Más", "Cotizaciones"] },
      { label: "Citas solicitadas", icono: "calendar-outline", ruta: "Citas", destino: ["Taller", "Más", "Citas"] },
      hasPermission("clientes.ver") && { label: "Clientes", icono: "people-outline", ruta: "ClientesLista", destino: ["Taller", "Clientes"] },
      hasPermission("vehiculos.ver") && { label: "Vehículos", icono: "car-outline", ruta: "VehiculosLista", destino: ["Vehículos"] },
    ].filter(Boolean) },
    { grupo: "Inventario", items: [
      hasPermission("refacciones.ver") && { label: "Refacciones", icono: "cube-outline", ruta: "RefaccionesLista", destino: ["Taller", "Refacciones"] },
      hasPermission("refacciones.ver") && { label: "Inventario", icono: "file-tray-stacked-outline", ruta: "InventarioLista", destino: ["Taller", "Más", "InventarioLista"] },
      hasPermission("herramientas.ver") && { label: "Herramientas", icono: "hammer-outline", ruta: "Herramientas", destino: ["Taller", "Más", "Herramientas"] },
      hasPermission("proveedores.ver") && { label: "Proveedores", icono: "business-outline", ruta: "Proveedores", destino: ["Taller", "Más", "Proveedores"] },
    ].filter(Boolean) },
    { grupo: "App de clientes", items: [
      hasPermission("promociones.ver") && { label: "Promociones", icono: "pricetag-outline", ruta: "Promociones", destino: ["Taller", "Más", "Promociones"] },
      { label: "Asistente (chatbot)", icono: "chatbubbles-outline", ruta: "Asistente", destino: ["Taller", "Más", "Asistente"] },
    ].filter(Boolean) },
    { grupo: "Configuración", items: [
      hasPermission("catalogos.ver") && { label: "Catálogos", icono: "list-outline", ruta: "CatalogosLista", destino: ["Catálogos"] },
      hasPermission("configuracion.editar") && { label: "Datos del taller", icono: "storefront-outline", ruta: "DatosTaller", destino: ["Taller", "Más", "DatosTaller"] },
      hasPermission("configuracion.editar") && { label: "Comisiones", icono: "card-outline", ruta: "Comisiones", destino: ["Taller", "Más", "Comisiones"] },
      hasPermission("empleados.ver") && { label: "Empleados", icono: "id-card-outline", ruta: "Empleados", destino: ["Taller", "Más", "Empleados"] },
      hasPermission("nomina.ver") && { label: "Nómina", icono: "cash-outline", ruta: "Nomina", destino: ["Taller", "Más", "Nomina"] },
      hasPermission("usuarios.ver") && { label: "Usuarios", icono: "key-outline", ruta: "Usuarios", destino: ["Taller", "Más", "Usuarios"] },
      hasPermission("roles.ver") && { label: "Roles y permisos", icono: "shield-checkmark-outline", ruta: "GestionRoles", destino: ["Taller", "Más", "GestionRoles"] },
    ].filter(Boolean) },
  ].filter((seccion) => seccion.items.length > 0);

  const rol = typeof user?.rol === "string" ? user.rol : user?.rol?.nombre;
  const nombre = user?.nombre_completo || user?.username;

  return (
    <View style={{ flex: 1, backgroundColor: colors.sidebarBg, paddingTop: insets.top + 12 }}>
      <View style={[styles.brand, { borderBottomColor: colors.petrol500 }]}>
        <Text style={[styles.brandTexto, { color: colors.sidebarTexto }]}>
          ALDM <Text style={{ color: colors.petrol300 }}>AutoCore</Text>
        </Text>
        <TouchableOpacity onPress={() => navigation.closeDrawer()} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.sidebarTextoTenue} />
        </TouchableOpacity>
      </View>
      {user?.taller ? (
        <View style={[styles.tallerActual, { backgroundColor: colors.sidebarHover }]}>
          <Ionicons name="business-outline" size={16} color={colors.petrol300} />
          <Text style={[styles.tallerActualTexto, { color: colors.sidebarTexto }]} numberOfLines={1}>{user.taller}</Text>
          {talleres.length > 1 ? (
            <TouchableOpacity
              onPress={() => { navigation.closeDrawer(); SelectorEstado.abrirSelector && SelectorEstado.abrirSelector(); }}
              hitSlop={8}
            >
              <Text style={[styles.tallerCambiar, { color: colors.petrol300 }]}>Cambiar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 16 }}>
        {nav.map((seccion) => (
          <View key={seccion.grupo}>
            <Text style={[styles.grupo, { color: colors.sidebarTextoTenue }]}>{seccion.grupo}</Text>
            {seccion.items.map((item) => {
              const esActiva = activa === item.ruta;
              return (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.link, esActiva && { backgroundColor: colors.petrol500 }]}
                  onPress={() => { irA(navigation, item.destino); navigation.closeDrawer(); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={item.icono} size={19} color={esActiva ? colors.sidebarTexto : colors.sidebarTextoTenue} />
                  <Text style={[styles.linkTexto, { color: esActiva ? colors.sidebarTexto : colors.sidebarTextoTenue }, esActiva && styles.linkTextoActivo]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Pie: usuario, tema y salir (como .sidebar-footer de la web) */}
      <View style={[styles.pie, { borderTopColor: colors.sidebarHover, paddingBottom: insets.bottom + 12 }]}>
        <Text style={[styles.pieNombre, { color: colors.sidebarTexto }]} numberOfLines={1}>{nombre}</Text>
        {rol && rol !== nombre ? (
          <View style={[styles.rolBadge, { backgroundColor: colors.sidebarHover }]}>
            <Text style={[styles.rolBadgeTexto, { color: colors.petrol300 }]}>{rol}</Text>
          </View>
        ) : null}

        <View style={[styles.temaSelector, { backgroundColor: colors.sidebarHover }]}>
          {[
            { valor: "sistema", icono: "phone-portrait-outline", label: "Sistema" },
            { valor: "claro", icono: "sunny-outline", label: "Claro" },
            { valor: "oscuro", icono: "moon-outline", label: "Oscuro" },
          ].map((op) => {
            const activo = preferencia === op.valor;
            return (
              <TouchableOpacity
                key={op.valor}
                style={[styles.temaOpcion, activo && { backgroundColor: colors.petrol500 }]}
                onPress={() => cambiarPreferencia(op.valor)}
              >
                <Ionicons name={op.icono} size={14} color={activo ? colors.sidebarBg : colors.sidebarTextoTenue} />
                <Text style={[styles.temaTexto, { color: activo ? colors.sidebarBg : colors.sidebarTextoTenue }]}>{op.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.sidebarHover }]}
          onPress={() => alerta("Cerrar sesión", "¿Seguro que quieres salir?", [
            { text: "Cancelar", style: "cancel" },
            { text: "Salir", style: "destructive", onPress: logout },
          ])}
        >
          <Ionicons name="log-out-outline" size={17} color={colors.sidebarTexto} />
          <Text style={[styles.logoutTexto, { color: colors.sidebarTexto }]}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AppNavigator() {
  const oscuro = temaActivo() === "oscuro";
  const base = oscuro ? DarkTheme : DefaultTheme;
  const temaNavegacion = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.petrol500,
      background: colors.paper0,
      card: colors.paper100,
      text: colors.ink900,
      border: colors.ink300,
      notification: colors.red600,
    },
  };

  return (
    <NavigationContainer initialState={estadoGuardado()} onStateChange={guardarEstado} theme={temaNavegacion}>
      <Drawer.Navigator
        id="RootDrawer"
        screenOptions={{ headerShown: false, drawerType: "front", drawerStyle: { width: 290, backgroundColor: colors.sidebarBg }, overlayColor: colors.velo }}
        drawerContent={(props) => <ContenidoDrawer {...props} />}
      >
        <Drawer.Screen name="Taller" component={TallerTabs} />
        <Drawer.Screen name="Vehículos" component={VehiculosStackScreen} />
        <Drawer.Screen name="Catálogos" component={CatalogosStackScreen} />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

// Colores del menú lateral van en línea (tokens sidebar*) — ver ContenidoDrawer.
const styles = crearEstilos({
  tallerActual: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 14, marginTop: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  tallerActualTexto: { flex: 1, fontSize: 13, fontWeight: "600" },
  tallerCambiar: { fontSize: 12.5, fontWeight: "700" },
  tabItemBig: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 8 },
  iconWrapBig: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.petrol500,
    alignItems: "center", justifyContent: "center", marginTop: -24, borderWidth: 4,
  },
  iconWrapBigActivo: { backgroundColor: colors.petrol600 },
  tabLabelBig: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.ink500, marginTop: 2 },
  brand: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 14, paddingHorizontal: 10, paddingBottom: 16, marginBottom: 6, borderBottomWidth: 2 },
  brandTexto: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24 },
  grupo: { fontFamily: "Inter_500Medium", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.9, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 4 },
  link: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  linkTexto: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 16, textTransform: "uppercase", letterSpacing: 0.5 },
  linkTextoActivo: { fontFamily: "BarlowCondensed_700Bold" },
  pie: { borderTopWidth: 1, paddingHorizontal: 24, paddingTop: 14 },
  pieNombre: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  rolBadge: { alignSelf: "flex-start", borderRadius: 100, paddingVertical: 2, paddingHorizontal: 9, marginTop: 5 },
  rolBadgeTexto: { fontFamily: "Inter_700Bold", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4 },
  temaSelector: { flexDirection: "row", borderRadius: 10, padding: 3, marginTop: 12 },
  temaOpcion: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 7, borderRadius: 8 },
  temaTexto: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 9, marginTop: 10 },
  logoutTexto: { fontFamily: "Inter_500Medium", fontSize: 13 },
});
