import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Linking } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { useAuth } from "../context/AuthContext";
import { crearEstilos } from "../ui/estilos";
import { abrirOrdenDeVehiculo } from "../navigation/irAOrden";
import { alerta } from "../ui/Dialogo";
import { telefonoValido, MENSAJE_TELEFONO_INVALIDO } from "../validaciones";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ClienteDetalleScreen({ route, navigation }) {
  const { hasPermission } = useAuth();
  const [cliente, setCliente] = useState(route.params.cliente);
  const [vehiculos, setVehiculos] = useState([]);
  const [servicios, setServicios] = useState([]);

  async function cargar() {
    const [vehs, servs, c] = await Promise.all([
      api.get(`/clientes/${cliente.id_cliente}/vehiculos`),
      api.get(`/servicios/?id_cliente=${cliente.id_cliente}`),
      api.get(`/clientes/${cliente.id_cliente}`).catch(() => null),
    ]);
    setVehiculos(vehs || []);
    setServicios(servs || []);
    if (c) setCliente(c);
  }
  useFocusEffect(useCallback(() => { cargar(); }, [cliente.id_cliente])); // eslint-disable-line react-hooks/exhaustive-deps

  const tel = cliente.telefono1;

  // WhatsApp: valida el número del cliente y firma con el número registrado del taller.
  // (WhatsApp no permite comprobar desde la app si el número tiene cuenta; si no la tiene, abre el chat vacío y avisa al usuario.)
  async function enviarWhatsApp() {
    const digitos = String(tel || "").replace(/\D/g, "").slice(-10);
    if (!telefonoValido(digitos)) {
      alerta("WhatsApp", `${MENSAJE_TELEFONO_INVALIDO} Corrige el teléfono principal del cliente.`);
      return;
    }
    let taller = {};
    try { taller = (await api.get("/configuracion-taller/")) || {}; } catch (e) { /* sin conexión: se envía sin firma */ }
    const firma = [taller.nombre_taller, taller.telefono && `Tel. ${taller.telefono}`].filter(Boolean).join(" · ");
    const texto = `Hola ${cliente.nombre_cliente || ""}, te escribimos de ${firma || "tu taller"}.`.replace(/\s+,/, ",");
    const url = `https://wa.me/52${digitos}?text=${encodeURIComponent(texto)}`;
    try { await Linking.openURL(url); } catch (e) { alerta("WhatsApp", "No se pudo abrir WhatsApp. Verifica que esté instalado y que el número tenga cuenta."); }
  }
  const saldo = servicios.filter((s) => s.status !== "cancelado").reduce((a, s) => a + Math.max(s.costos?.saldo_pendiente || 0, 0), 0);
  const abiertas = servicios.filter((s) => s.status === "abierto").length;
  const nuevaOrden = (v) => abrirOrdenDeVehiculo(navigation, cliente, v);
  const direccion = [cliente.calle_cliente, cliente.numexterior_cliente, cliente.colonia_cliente, cliente.cp_cliente].filter(Boolean).join(" ");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
      <View style={styles.perfil}>
        <View style={styles.avatar}><Text style={styles.avatarTexto}>{`${(cliente.nombre_cliente || "?")[0]}${(cliente.paterno_cliente || "")[0] || ""}`.toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nombre}>{cliente.nombre_cliente} {cliente.paterno_cliente || ""} {cliente.materno_cliente || ""}</Text>
          <Text style={styles.meta}>Cuenta {cliente.numero_cuenta || "—"}{cliente.empresa_cliente ? ` · ${cliente.empresa_cliente}` : ""}</Text>
        </View>
        {hasPermission("clientes.editar") && (
          <TouchableOpacity style={styles.editar} onPress={() => navigation.navigate("ClienteForm", { cliente, onGuardado: (a) => { setCliente(a); navigation.goBack(); } })}>
            <Ionicons name="create-outline" size={18} color={colors.petrol600} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.acciones}>
        {[
          ["call-outline", "Llamar", tel ? () => Linking.openURL(`tel:${tel}`) : null],
          ["logo-whatsapp", "WhatsApp", tel ? enviarWhatsApp : null],
          ["mail-outline", "Correo", cliente.correo_cliente ? () => Linking.openURL(`mailto:${cliente.correo_cliente}`) : null],
        ].map(([icono, texto, fn]) => (
          <TouchableOpacity key={texto} style={[styles.accion, !fn && { opacity: 0.4 }]} onPress={fn} disabled={!fn}>
            <Ionicons name={icono} size={20} color={colors.petrol600} />
            <Text style={styles.accionTexto}>{texto}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.kpis}>
        <View style={styles.kpi}><Text style={styles.kpiValor}>{vehiculos.length}</Text><Text style={styles.kpiEtiqueta}>Vehículos</Text></View>
        <View style={styles.kpi}><Text style={styles.kpiValor}>{abiertas}</Text><Text style={styles.kpiEtiqueta}>Órdenes abiertas</Text></View>
        {hasPermission("dashboard.ver_por_cobrar") && (
          <View style={styles.kpi}><Text style={[styles.kpiValor, saldo > 0.005 && { color: colors.red600 }]}>{fmt(saldo)}</Text><Text style={styles.kpiEtiqueta}>Por cobrar</Text></View>
        )}
      </View>

      {(tel || cliente.telefono2 || cliente.correo_cliente || direccion || cliente.rfc_cliente || cliente.comentarios) ? (
        <View style={styles.datos}>
          {[["Teléfono", tel], ["Teléfono 2", cliente.telefono2], ["Correo", cliente.correo_cliente], ["RFC", cliente.rfc_cliente], ["Dirección", direccion], ["Notas", cliente.comentarios]]
            .filter(([, v]) => v).map(([e, v]) => (
              <View key={e} style={styles.dato}><Text style={styles.datoEtiqueta}>{e}</Text><Text style={styles.datoValor}>{v}</Text></View>
            ))}
        </View>
      ) : null}

      <View style={styles.seccionFila}>
        <Text style={styles.seccion}>Vehículos</Text>
        {hasPermission("vehiculos.crear") && (
          <TouchableOpacity style={styles.btnAgregar} onPress={() => navigation.navigate("VehiculoForm", { clienteFijo: cliente })} activeOpacity={0.8}><Ionicons name="add" size={20} color="#fff" /><Text style={styles.agregar}>Agregar</Text></TouchableOpacity>
        )}
      </View>
      {vehiculos.length === 0 ? <Text style={styles.vacio}>Sin vehículos registrados.</Text> : vehiculos.map((v) => (
        <View key={v.id_vehiculo} style={styles.tarjeta}>
          <TouchableOpacity style={styles.vehiculoFila} onPress={() => navigation.navigate("VehiculoForm", { vehiculoExistente: v })}>
            <View style={styles.icono}><Ionicons name="car" size={18} color={colors.petrol600} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.titulo}>{[v.marca?.nombre_marca, v.modelo?.nombre_modelo].filter(Boolean).join(" ") || "Vehículo"}</Text>
              <Text style={styles.meta}>{[v.placas_vehiculo ? `Placas ${v.placas_vehiculo}` : "Sin placas", v.color?.nombre_color, v.km_vehiculo ? `${Number(v.km_vehiculo).toLocaleString("es-MX")} km` : null].filter(Boolean).join(" · ")}</Text>
            </View>
          </TouchableOpacity>
          {hasPermission("servicios.crear") && (
            <TouchableOpacity style={styles.botonOrden} onPress={() => nuevaOrden(v)}>
              <Ionicons name="add-circle-outline" size={16} color={colors.paper100} /><Text style={styles.botonOrdenTexto}>Nueva orden</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <Text style={[styles.seccion, { marginTop: 22, marginBottom: 8 }]}>Historial de órdenes ({servicios.length})</Text>
      {servicios.length === 0 ? <Text style={styles.vacio}>Sin órdenes todavía.</Text> : servicios.map((s) => (
        <TouchableOpacity key={s.id_servicio} style={styles.orden} onPress={() => navigation.navigate("Servicio", { screen: "ServicioDetalle", params: { id: s.id_servicio }, initial: false })}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>#{s.id_servicio} · {s.nombre_servicio}</Text>
            <Text style={styles.meta}>{new Date(s.fecha_entrada_servicio).toLocaleDateString("es-MX")} · {s.status === "cerrado" ? "finalizada" : s.status}</Text>
          </View>
          {hasPermission("servicios.ver_precios") && (
            <Text style={[styles.monto, { color: hasPermission("dashboard.ver_por_cobrar") && (s.costos?.saldo_pendiente || 0) > 0.005 ? colors.red600 : colors.ink900 }]}>{fmt(s.costos?.total)}</Text>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  perfil: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  avatarTexto: { fontSize: 19, fontWeight: "700", color: colors.petrol600 },
  nombre: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 24, color: colors.ink900 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  editar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  acciones: { flexDirection: "row", gap: 10, marginTop: 16 },
  accion: { flex: 1, alignItems: "center", gap: 4, backgroundColor: colors.paper100, borderRadius: 12, paddingVertical: 12 },
  accionTexto: { fontSize: 12.5, fontWeight: "600", color: colors.ink900 },
  kpis: { flexDirection: "row", gap: 10, marginTop: 12 },
  kpi: { flex: 1, backgroundColor: colors.paper100, borderRadius: 12, padding: 12 },
  kpiValor: { fontFamily: "BarlowCondensed_700Bold", fontSize: 21, color: colors.ink900 },
  kpiEtiqueta: { fontSize: 11.5, color: colors.ink500 },
  datos: { backgroundColor: colors.paper100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4, marginTop: 12 },
  dato: { flexDirection: "row", gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  datoEtiqueta: { width: 82, fontSize: 12.5, color: colors.ink500 },
  datoValor: { flex: 1, fontSize: 13.5, fontWeight: "500", color: colors.ink900 },
  seccionFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 8 },
  seccion: { fontSize: 12.5, fontWeight: "700", color: colors.ink700, textTransform: "uppercase", letterSpacing: 0.6 },
  agregar: { fontSize: 16, fontWeight: "800", color: "#fff" },
  btnAgregar: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.petrol500, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18, minHeight: 46 },
  vacio: { fontSize: 13.5, color: colors.ink500 },
  tarjeta: { backgroundColor: colors.paper100, borderRadius: 12, padding: 12, marginBottom: 10, gap: 10 },
  vehiculoFila: { flexDirection: "row", alignItems: "center", gap: 10 },
  icono: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  titulo: { fontSize: 14.5, fontWeight: "600", color: colors.ink900 },
  botonOrden: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.petrol500, borderRadius: 10, height: 40 },
  botonOrdenTexto: { fontSize: 14, fontWeight: "600", color: colors.paper100 },
  orden: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper100, borderRadius: 10, padding: 12, marginBottom: 8 },
  monto: { fontSize: 14.5, fontWeight: "700" },
});
