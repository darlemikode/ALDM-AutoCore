import { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Linking } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import HojaFormulario from "../ui/HojaFormulario";
import { alerta } from "../ui/Dialogo";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Mismos campos que web-admin/src/pages/ProveedorDetalle.jsx
const CAMPOS_PRODUCTO = [
  { name: "nombre_producto", label: "Nombre del producto", required: true },
  { name: "comentario", label: "Comentario", type: "textarea" },
];
const CAMPOS_DEUDA = [
  { name: "monto_total", label: "Monto total", type: "number", required: true, mitad: true, onElegir: (v, vals) => (vals.saldo_total ? null : { saldo_total: v }) },
  { name: "saldo_total", label: "Saldo pendiente", type: "number", required: true, mitad: true },
  { name: "cantidad_producto", label: "Cantidad de producto", type: "number" },
  { name: "comentario", label: "Comentario", type: "textarea" },
];

export default function ProveedorDetalleScreen({ route }) {
  const { proveedor } = route.params;
  const { hasPermission } = useAuth();
  const [productos, setProductos] = useState([]);
  const [deudas, setDeudas] = useState([]);
  const [hoja, setHoja] = useState(null); // "producto" | "deuda"

  async function load() {
    const [p, d] = await Promise.all([
      api.get(`/proveedores/${proveedor.id_proveedor}/productos`),
      api.get(`/proveedores/${proveedor.id_proveedor}/deudas`),
    ]);
    setProductos(p || []);
    setDeudas(d || []);
  }

  useFocusEffect(useCallback(() => { load().catch((e) => alerta("Error", e.message)); }, []));

  const deudaTotal = deudas.reduce((acc, d) => acc + (Number(d.saldo_total) || 0), 0);
  const puedeEditar = hasPermission("proveedores.editar");

  async function guardar(v) {
    if (hoja === "producto") await api.post(`/proveedores/${proveedor.id_proveedor}/productos`, v);
    else await api.post(`/proveedores/${proveedor.id_proveedor}/deudas`, {
      ...v, monto_total: Number(v.monto_total), saldo_total: Number(v.saldo_total), cantidad_producto: Number(v.cantidad_producto || 0),
    });
    setHoja(null);
    load();
  }

  const direccion = [proveedor.calle_proveedor, proveedor.numexterior_proveedor, proveedor.colonia_proveedor].filter(Boolean).join(" ");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
      <View style={styles.cabecera}>
        <View style={styles.avatar}><Ionicons name="business" size={22} color={colors.petrol600} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nombre}>{proveedor.nombre_proveedor}</Text>
          <Text style={styles.meta}>{[proveedor.empresa_proveedor, proveedor.rfc_proveedor].filter(Boolean).join(" · ") || "Proveedor"}</Text>
        </View>
      </View>

      <View style={styles.contacto}>
        {proveedor.telefono1_proveedor ? (
          <TouchableOpacity style={styles.accion} onPress={() => Linking.openURL(`tel:${proveedor.telefono1_proveedor}`)}>
            <Ionicons name="call-outline" size={18} color={colors.petrol600} /><Text style={styles.accionTexto}>{proveedor.telefono1_proveedor}</Text>
          </TouchableOpacity>
        ) : null}
        {proveedor.correo_proveedor ? (
          <TouchableOpacity style={styles.accion} onPress={() => Linking.openURL(`mailto:${proveedor.correo_proveedor}`)}>
            <Ionicons name="mail-outline" size={18} color={colors.petrol600} /><Text style={styles.accionTexto} numberOfLines={1}>{proveedor.correo_proveedor}</Text>
          </TouchableOpacity>
        ) : null}
        {direccion ? <Text style={styles.meta}>{direccion}</Text> : null}
      </View>

      <View style={[styles.saldo, deudaTotal > 0 && { borderLeftColor: colors.red600 }]}>
        <Text style={styles.saldoEtiqueta}>Saldo que le debemos</Text>
        <Text style={styles.saldoValor}>{fmt(deudaTotal)}</Text>
      </View>

      <View style={styles.seccionFila}>
        <Text style={styles.seccion}>Productos ({productos.length})</Text>
        {puedeEditar && <TouchableOpacity onPress={() => setHoja("producto")}><Text style={styles.agregar}>+ Agregar</Text></TouchableOpacity>}
      </View>
      {productos.length === 0 ? <Text style={styles.vacio}>Sin productos registrados.</Text> : productos.map((p) => (
        <View key={p.id_producto_proveedor} style={styles.tarjeta}>
          <Text style={styles.titulo}>{p.nombre_producto}</Text>
          {p.comentario ? <Text style={styles.meta}>{p.comentario}</Text> : null}
        </View>
      ))}

      <View style={styles.seccionFila}>
        <Text style={styles.seccion}>Deudas / cuentas por pagar</Text>
        {puedeEditar && <TouchableOpacity onPress={() => setHoja("deuda")}><Text style={styles.agregar}>+ Registrar</Text></TouchableOpacity>}
      </View>
      {deudas.length === 0 ? <Text style={styles.vacio}>Sin deudas registradas.</Text> : deudas.map((d) => (
        <View key={d.id_deuda} style={styles.tarjeta}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={styles.titulo}>{fmt(d.saldo_total)} pendiente</Text>
            <Text style={styles.meta}>{d.fecha ? new Date(d.fecha).toLocaleDateString("es-MX") : ""}</Text>
          </View>
          <Text style={styles.meta}>de {fmt(d.monto_total)}{d.cantidad_producto ? ` · ${d.cantidad_producto} pza` : ""}</Text>
          {d.comentario ? <Text style={styles.meta}>{d.comentario}</Text> : null}
        </View>
      ))}

      <HojaFormulario
        visible={!!hoja}
        titulo={hoja === "producto" ? "Nuevo producto" : "Registrar deuda"}
        icono={hoja === "producto" ? "cube-outline" : "cash-outline"}
        campos={hoja === "producto" ? CAMPOS_PRODUCTO : CAMPOS_DEUDA}
        valoresIniciales={{}}
        onGuardar={guardar}
        onCerrar={() => setHoja(null)}
      />
    </ScrollView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cabecera: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  nombre: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 24, color: colors.ink900 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  contacto: { backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginTop: 14, gap: 8 },
  accion: { flexDirection: "row", alignItems: "center", gap: 8 },
  accionTexto: { fontSize: 14.5, fontWeight: "600", color: colors.petrol600, flexShrink: 1 },
  saldo: { backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginTop: 12, borderLeftWidth: 4, borderLeftColor: colors.teal600 },
  saldoEtiqueta: { fontSize: 11, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.5 },
  saldoValor: { fontFamily: "BarlowCondensed_700Bold", fontSize: 30, color: colors.ink900 },
  seccionFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 8 },
  seccion: { fontSize: 12.5, fontWeight: "700", color: colors.ink700, textTransform: "uppercase", letterSpacing: 0.6 },
  agregar: { fontSize: 14, fontWeight: "700", color: colors.petrol600 },
  tarjeta: { backgroundColor: colors.paper100, borderRadius: 10, padding: 12, marginBottom: 8 },
  titulo: { fontSize: 14.5, fontWeight: "600", color: colors.ink900 },
  vacio: { fontSize: 13.5, color: colors.ink500 },
});
