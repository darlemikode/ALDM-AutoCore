import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Switch, ActivityIndicator, TextInput, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTema } from "../context/TemaContext";
import { colors, spacing } from "../theme";
import { isBiometricHardwareAvailable, isBiometricEnabled, setBiometricEnabled, authenticateWithBiometrics } from "../biometrics";
import { sincronizarAhora, obtenerUltimaSincronizacionRapido, formatearFechaSync } from "../sync";
import { subirPendientes, contarPendientesTotal } from "../subirPendientes";
import { MODO_LOCAL, suscribirModoLocal } from "../localMode";
import { verificarConexion } from "../conexion";
import { suscribirAutoSync } from "../autoSync";
import { isVerificacion2PasosActiva, setVerificacion2PasosActiva } from "../configuracionApp";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";
import { api } from "../api";

const ITEMS = [
  { to: "Cotizaciones", label: "Cotizaciones", desc: "Presupuestos para el cliente, con PDF", icono: "document-text-outline", permiso: "cotizaciones.ver" },
  { to: "Vehículos", label: "Vehículos", desc: "Por marca, modelo y color", icono: "car-outline", permiso: "vehiculos.ver" },
  { to: "Catálogos", label: "Catálogos", desc: "Marcas, modelos, colores y refacciones", icono: "list-outline", permiso: "catalogos.ver" },
  { to: "InventarioLista", label: "Inventario", desc: "Compatibilidad, proveedor, precios y ubicación", icono: "file-tray-stacked-outline", permiso: "refacciones.ver" },
  { to: "Herramientas", label: "Herramientas", desc: "Inventario de herramientas del taller", icono: "hammer-outline", permiso: "herramientas.ver" },
  { to: "Proveedores", label: "Proveedores", desc: "Contactos, productos y deudas", icono: "business-outline", permiso: "proveedores.ver" },
  { to: "Citas", label: "Citas solicitadas", desc: "Lo que piden los clientes desde su app", icono: "calendar-outline" },
  { to: "Promociones", label: "Promociones", desc: "Lo que ven tus clientes en su app", icono: "pricetag-outline", permiso: "promociones.ver" },
  { to: "Asistente", label: "Asistente", desc: "Consultas rápidas de uso interno", icono: "sparkles-outline" },
];

function Fila({ icono, titulo, desc, onPress, derecha, primera }) {
  const Contenedor = onPress ? TouchableOpacity : View;
  return (
    <Contenedor style={[styles.fila, !primera && styles.divisor]} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.filaIcono}><Ionicons name={icono} size={18} color={colors.petrol600} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{titulo}</Text>
        {desc ? <Text style={styles.rowSubtitle}>{desc}</Text> : null}
      </View>
      {derecha !== undefined ? derecha : <Ionicons name="chevron-forward" size={18} color={colors.ink500} />}
    </Contenedor>
  );
}

function Grupo({ titulo, children }) {
  const hijos = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  if (hijos.length === 0) return null;
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={styles.grupoTitulo}>{titulo}</Text>
      <View style={styles.grupo}>{hijos}</View>
    </View>
  );
}

export default function MasScreen({ navigation }) {
  const { user, logout, hasPermission } = useAuth();
  const { preferencia, cambiarPreferencia } = useTema();
  const [biometriaDisponible, setBiometriaDisponible] = useState(false);
  const [biometriaActiva, setBiometriaActiva] = useState(false);
  const [verificacion2PasosActiva, setVerificacion2PasosActivaState] = useState(false);
  const [ultimaSync, setUltimaSync] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const [mostrarFormSubida, setMostrarFormSubida] = useState(false);
  const [userSubida, setUserSubida] = useState("");
  const [passSubida, setPassSubida] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [mostrarCambioPassword, setMostrarCambioPassword] = useState(false);
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [passwordNuevaConfirmar, setPasswordNuevaConfirmar] = useState("");
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [modoLocal, setModoLocal] = useState(MODO_LOCAL);
  const [verificandoConexion, setVerificandoConexion] = useState(false);

  async function actualizarPendientes() {
    setPendientes(await contarPendientesTotal());
  }

  useEffect(() => {
    (async () => {
      setBiometriaDisponible(await isBiometricHardwareAvailable());
      setBiometriaActiva(await isBiometricEnabled());
      setVerificacion2PasosActivaState(await isVerificacion2PasosActiva());
      setUltimaSync(await obtenerUltimaSincronizacionRapido());
      await actualizarPendientes();
    })();
  }, []);

  // Modo local ya no es fijo (ver localMode.js): se prende y se apaga solo
  // según haya o no servidor. Esta pantalla se suscribe para reflejarlo, y
  // también a autoSync.js para saber cuándo terminó de subir y refrescar
  // los números que se muestran.
  useEffect(() => {
    const salirModo = suscribirModoLocal(setModoLocal);
    const salirSync = suscribirAutoSync(async (evento) => {
      if (evento.tipo === "fin") {
        await actualizarPendientes();
        setUltimaSync(await obtenerUltimaSincronizacionRapido());
      }
      if (evento.tipo === "subida" && evento.reporte) {
        const totalErr = evento.reporte.clientes.errores.length + evento.reporte.vehiculos.errores.length + evento.reporte.servicios.errores.length + evento.reporte.refacciones.errores.length;
        if (totalErr > 0) {
          alerta("Subida automática con pendientes", `Al reconectar se subió lo que se pudo, pero ${totalErr} registro(s) no se pudieron subir todavía. Se reintenta la próxima vez que haya conexión.`);
        }
      }
    });
    return () => {
      salirModo();
      salirSync();
    };
  }, []);

  async function manejarRevisarConexion() {
    setVerificandoConexion(true);
    try {
      const enLinea = await verificarConexion();
      if (!enLinea) alerta("Sin conexión", "Sigue sin poder llegar al servidor. Revisa que esté prendido y que el celular esté en la misma red.");
    } finally {
      setVerificandoConexion(false);
    }
  }

  async function manejarSubirPendientes() {
    if (!userSubida || !passSubida) {
      alerta("Faltan datos", "Escribe el usuario y la contraseña del servidor real.");
      return;
    }
    setSubiendo(true);
    try {
      const reporte = await subirPendientes(userSubida, passSubida);
      const totalOk = reporte.clientes.subidos + reporte.vehiculos.subidos + reporte.servicios.subidos + reporte.refacciones.subidos;
      const totalErr = reporte.clientes.errores.length + reporte.vehiculos.errores.length + reporte.servicios.errores.length + reporte.refacciones.errores.length;
      let mensaje = `Subidos: ${totalOk}\n· ${reporte.clientes.subidos} clientes\n· ${reporte.vehiculos.subidos} vehículos\n· ${reporte.servicios.subidos} órdenes\n· ${reporte.refacciones.subidos} refacciones`;
      if (totalErr > 0) {
        mensaje += `\n\n${totalErr} no se pudieron subir (se quedan pendientes, se puede reintentar después).`;
      }
      alerta(totalErr > 0 ? "Subida parcial" : "Subida completa", mensaje);
      setPassSubida("");
      setMostrarFormSubida(false);
      await actualizarPendientes();
    } catch (err) {
      alerta("No se pudo subir", err.message || "Revisa tu conexión y tus datos de acceso.");
    } finally {
      setSubiendo(false);
    }
  }

  async function manejarSincronizar() {
    setSincronizando(true);
    try {
      const resultado = await sincronizarAhora();
      setUltimaSync(resultado.fecha);
      const c = resultado.conteo;
      alerta(
        "Sincronización completa",
        `Se guardaron localmente:\n${c.clientes} clientes\n${c.vehiculos} vehículos\n${c.servicios} órdenes\n${c.refacciones} refacciones`
      );
    } catch (err) {
      alerta("No se pudo sincronizar", err.message || "Revisa tu conexión e intenta de nuevo.");
    } finally {
      setSincronizando(false);
    }
  }

  async function alternarBiometria(valor) {
    if (valor) {
      const ok = await authenticateWithBiometrics("Confirma para activar el acceso biométrico");
      if (!ok) return;
      await setBiometricEnabled(true);
      setBiometriaActiva(true);
    } else {
      await setBiometricEnabled(false);
      setBiometriaActiva(false);
    }
  }

  async function alternarVerificacion2Pasos(valor) {
    await setVerificacion2PasosActiva(valor);
    setVerificacion2PasosActivaState(valor);
  }

  async function manejarCambiarPassword() {
    if (!passwordActual || !passwordNueva) {
      alerta("Faltan datos", "Escribe tu contraseña actual y la nueva.");
      return;
    }
    if (passwordNueva !== passwordNuevaConfirmar) {
      alerta("No coinciden", "La nueva contraseña y su confirmación deben ser iguales.");
      return;
    }
    setCambiandoPassword(true);
    try {
      await api.put("/auth/password", { password_actual: passwordActual, password_nueva: passwordNueva });
      setPasswordActual(""); setPasswordNueva(""); setPasswordNuevaConfirmar("");
      setMostrarCambioPassword(false);
      alerta("Listo", "Tu contraseña se actualizó.");
    } catch (err) {
      alerta("No se pudo cambiar", err.message || "Revisa los datos e intenta de nuevo.");
    } finally {
      setCambiandoPassword(false);
    }
  }

  const cuenta = [
    { key: "MiDashboard", icono: "person-circle-outline", titulo: "Mi dashboard", desc: "Tus servicios como responsable", ir: "MiDashboard" },
    hasPermission("usuarios.ver") && { key: "Usuarios", icono: "key-outline", titulo: "Usuarios", desc: "Cuentas de acceso", ir: "Usuarios" },
    hasPermission("empleados.ver") && { key: "Empleados", icono: "id-card-outline", titulo: "Empleados", desc: "Personal del taller", ir: "Empleados" },
    hasPermission("nomina.ver") && { key: "Nomina", icono: "cash-outline", titulo: "Nómina", desc: "Sueldos y pagos del personal", ir: "Nomina" },
    hasPermission("roles.ver") && { key: "GestionRoles", icono: "shield-checkmark-outline", titulo: "Roles y permisos", desc: "Qué puede hacer cada rol", ir: "GestionRoles" },
  ].filter(Boolean);
  const taller = [
    hasPermission("configuracion.editar") && { key: "DatosTaller", icono: "storefront-outline", titulo: "Datos del taller", desc: "Nombre, dirección, RFC y logo", ir: "DatosTaller" },
    hasPermission("configuracion.editar") && { key: "Comisiones", icono: "card-outline", titulo: "Comisiones por tipo de pago", desc: "Efectivo, tarjeta y mixto", ir: "Comisiones" },
  ].filter(Boolean);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      <View style={styles.perfil}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTexto}>
            {(user?.nombre_completo || user?.username || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.perfilNombre}>{user?.nombre_completo || user?.username}</Text>
          {(() => {
            const rol = typeof user?.rol === "string" ? user.rol : user?.rol?.nombre;
            const nombre = user?.nombre_completo || user?.username;
            return rol && rol !== nombre ? <View style={styles.rolBadge}><Text style={styles.rolBadgeTexto}>{rol}</Text></View> : null;
          })()}
        </View>
      </View>

      <Grupo titulo="Cuenta y equipo">
        {cuenta.map((c, i) => (
          <Fila key={c.key} primera={i === 0} icono={c.icono} titulo={c.titulo} desc={c.desc} onPress={() => navigation.navigate(c.ir)} />
        ))}
      </Grupo>

      <Grupo titulo="Taller">
        {taller.map((c, i) => (
          <Fila key={c.key} primera={i === 0} icono={c.icono} titulo={c.titulo} desc={c.desc} onPress={() => navigation.navigate(c.ir)} />
        ))}
      </Grupo>

      <Grupo titulo="Módulos">
        {ITEMS.filter((item) => !item.permiso || hasPermission(item.permiso)).map((item, i) => (
          <Fila key={item.to} primera={i === 0} icono={item.icono} titulo={item.label} desc={item.desc} onPress={() => navigation.navigate(item.to)} />
        ))}
      </Grupo>

      <Grupo titulo="Apariencia">
        <View style={styles.bloque}>
          <View style={styles.segmentado}>
            {[
              { valor: "sistema", icono: "phone-portrait-outline", label: "Sistema" },
              { valor: "claro", icono: "sunny-outline", label: "Claro" },
              { valor: "oscuro", icono: "moon-outline", label: "Oscuro" },
            ].map((op) => {
              const activo = preferencia === op.valor;
              return (
                <TouchableOpacity key={op.valor} style={[styles.segmento, activo && styles.segmentoActivo]} onPress={() => cambiarPreferencia(op.valor)}>
                  <Ionicons name={op.icono} size={15} color={activo ? colors.paper100 : colors.ink700} />
                  <Text style={[styles.segmentoTexto, activo && styles.segmentoTextoActivo]}>{op.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.rowSubtitle, { marginTop: 8 }]}>"Sistema" sigue el modo claro/oscuro de tu celular.</Text>
        </View>
      </Grupo>

      <Grupo titulo="Seguridad">
        <TouchableOpacity style={styles.fila} onPress={() => setMostrarCambioPassword((v) => !v)} activeOpacity={0.6}>
          <View style={styles.filaIcono}><Ionicons name="key-outline" size={18} color={colors.petrol600} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Cambiar mi contraseña</Text>
            <Text style={styles.rowSubtitle}>Recomendado si sigues con la de fábrica</Text>
          </View>
          <Ionicons name={mostrarCambioPassword ? "chevron-up" : "chevron-forward"} size={18} color={colors.ink500} />
        </TouchableOpacity>
        {mostrarCambioPassword && (
          <View style={[styles.bloque, styles.divisor]}>
            <TextInput style={styles.input} placeholder="Contraseña actual" placeholderTextColor={colors.ink500} secureTextEntry value={passwordActual} onChangeText={setPasswordActual} />
            <TextInput style={styles.input} placeholder="Contraseña nueva (mínimo 6 caracteres)" placeholderTextColor={colors.ink500} secureTextEntry value={passwordNueva} onChangeText={setPasswordNueva} />
            <TextInput style={styles.input} placeholder="Confirmar contraseña nueva" placeholderTextColor={colors.ink500} secureTextEntry value={passwordNuevaConfirmar} onChangeText={setPasswordNuevaConfirmar} />
            <TouchableOpacity style={[styles.syncBtn, cambiandoPassword && { opacity: 0.6 }]} onPress={manejarCambiarPassword} disabled={cambiandoPassword}>
              {cambiandoPassword ? <ActivityIndicator color="#fff" /> : <Text style={styles.syncBtnTexto}>Guardar contraseña nueva</Text>}
            </TouchableOpacity>
          </View>
        )}
        {biometriaDisponible && (
          <Fila
            icono="finger-print-outline"
            titulo="Huella / Face ID"
            desc="Entra sin escribir tu contraseña"
            derecha={<Switch value={biometriaActiva} onValueChange={alternarBiometria} trackColor={{ true: colors.petrol500 }} thumbColor="#fff" />}
          />
        )}
        <Fila
          icono="shield-outline"
          titulo="Verificación en 2 pasos"
          desc="Pide un código al cliente al crear órdenes"
          derecha={<Switch value={verificacion2PasosActiva} onValueChange={alternarVerificacion2Pasos} trackColor={{ true: colors.petrol500 }} thumbColor="#fff" />}
        />
      </Grupo>

      <Grupo titulo="Datos">
        <View style={styles.bloque}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={styles.filaIcono}><Ionicons name="sync-outline" size={18} color={colors.petrol600} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Sincronización</Text>
              <Text style={styles.rowSubtitle}>Última: {formatearFechaSync(ultimaSync)}</Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.syncBtn, sincronizando && { opacity: 0.6 }]} onPress={manejarSincronizar} disabled={sincronizando}>
            {sincronizando ? <ActivityIndicator color="#fff" /> : <Text style={styles.syncBtnTexto}>Sincronizar ahora</Text>}
          </TouchableOpacity>
        </View>

        {modoLocal && (
          <View style={[styles.bloque, styles.divisor]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={styles.filaIcono}><Ionicons name="cloud-offline-outline" size={18} color={colors.warn600} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Sin conexión con el servidor</Text>
                <Text style={styles.rowSubtitle}>Trabajando en modo local. En cuanto vuelva la conexión, se sube solo.</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.syncBtnSecundario, verificandoConexion && { opacity: 0.6 }]} onPress={manejarRevisarConexion} disabled={verificandoConexion}>
              {verificandoConexion ? <ActivityIndicator color={colors.petrol600} /> : <Text style={styles.syncBtnSecundarioTexto}>Revisar conexión ahora</Text>}
            </TouchableOpacity>
          </View>
        )}

        {(modoLocal || pendientes > 0) && (
          <View style={[styles.bloque, styles.divisor]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={styles.filaIcono}><Ionicons name="cloud-upload-outline" size={18} color={colors.petrol600} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Cambios pendientes</Text>
                <Text style={styles.rowSubtitle}>{pendientes} registro(s) guardados solo en el celular{!modoLocal && pendientes > 0 ? " (se reintentará solo)" : ""}</Text>
              </View>
            </View>

            {!mostrarFormSubida ? (
              <TouchableOpacity
                style={[styles.syncBtnSecundario, pendientes === 0 && { opacity: 0.5 }]}
                onPress={() => setMostrarFormSubida(true)}
                disabled={pendientes === 0}
              >
                <Text style={styles.syncBtnSecundarioTexto}>{pendientes === 0 ? "Nada pendiente" : "Subir al servidor ahora"}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.rowSubtitle}>Usuario y contraseña del servidor real (solo si la sesión guardada ya venció):</Text>
                <TextInput style={styles.input} placeholder="Usuario" placeholderTextColor={colors.ink500} autoCapitalize="none" value={userSubida} onChangeText={setUserSubida} />
                <TextInput style={styles.input} placeholder="Contraseña" placeholderTextColor={colors.ink500} secureTextEntry value={passSubida} onChangeText={setPassSubida} />
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <TouchableOpacity style={[styles.syncBtnSecundario, { flex: 1, marginTop: 0 }]} onPress={() => setMostrarFormSubida(false)} disabled={subiendo}>
                    <Text style={styles.syncBtnSecundarioTexto}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.syncBtn, { flex: 1, marginTop: 0 }]} onPress={manejarSubirPendientes} disabled={subiendo}>
                    {subiendo ? <ActivityIndicator color="#fff" /> : <Text style={styles.syncBtnTexto}>Subir</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </Grupo>

      <TouchableOpacity
        style={styles.logout}
        onPress={() => alerta("Cerrar sesión", "¿Seguro que quieres salir?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Salir", style: "destructive", onPress: logout },
        ])}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.red600} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  perfil: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.paper100, padding: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  avatarTexto: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.petrol600 },
  perfilNombre: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.ink900 },
  subtitle: { fontFamily: "Inter_400Regular", color: colors.ink500, fontSize: 14, marginTop: 2 },
  grupoTitulo: { fontFamily: "Inter_600SemiBold", fontSize: 11.5, color: colors.ink500, marginBottom: 8, marginLeft: 4, textTransform: "uppercase", letterSpacing: 0.8 },
  grupo: { backgroundColor: colors.paper100, paddingHorizontal: 14 },
  fila: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  divisor: { borderTopWidth: 1, borderTopColor: colors.linea },
  filaIcono: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontFamily: "Inter_500Medium", fontSize: 15, color: colors.ink900 },
  rowSubtitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.ink500, marginTop: 2 },
  bloque: { paddingVertical: 14 },
  input: { backgroundColor: colors.paper0, borderRadius: 12, paddingHorizontal: 14, height: 46, marginTop: 8, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.ink900 },
  syncBtn: { backgroundColor: colors.petrol500, borderRadius: 12, height: 44, alignItems: "center", justifyContent: "center", marginTop: 12 },
  syncBtnTexto: { fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 14 },
  syncBtnSecundario: { backgroundColor: colors.paper0, borderRadius: 12, height: 44, alignItems: "center", justifyContent: "center", marginTop: 12 },
  syncBtnSecundarioTexto: { fontFamily: "Inter_600SemiBold", color: colors.ink900, fontSize: 14 },
  rolBadge: { alignSelf: "flex-start", backgroundColor: colors.petrol100, borderRadius: 100, paddingVertical: 2, paddingHorizontal: 9, marginTop: 5 },
  rolBadgeTexto: { fontFamily: "Inter_700Bold", fontSize: 10.5, color: colors.petrol600, textTransform: "uppercase", letterSpacing: 0.4 },
  segmentado: { flexDirection: "row", backgroundColor: colors.paper0, borderRadius: 10, padding: 3 },
  segmento: { flex: 1, flexDirection: "row", gap: 5, paddingVertical: 9, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  segmentoActivo: { backgroundColor: colors.petrol500 },
  segmentoTexto: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.ink700 },
  segmentoTextoActivo: { color: colors.paper100 },
  logout: { flexDirection: "row", gap: 8, marginTop: 28, borderRadius: 14, backgroundColor: colors.red100, height: 50, alignItems: "center", justifyContent: "center" },
  logoutText: { fontFamily: "Inter_600SemiBold", color: colors.red600, fontSize: 15 },
});
