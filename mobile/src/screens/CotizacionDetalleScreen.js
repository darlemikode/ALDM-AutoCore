import ScrollCampos from "../ui/ScrollCampos";
import { useCallback, useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, Switch, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api, getToken, API_URL } from "../api";
import { MODO_LOCAL } from "../localMode";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import HojaAgregarConceptos from "../components/HojaAgregarConceptos";
import { alerta } from "../ui/Dialogo";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Detalle de cotización — misma función que web-admin/src/pages/CotizacionDetalle.jsx
export default function CotizacionDetalleScreen({ route }) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const puedeEditar = hasPermission("cotizaciones.editar");
  const [c, setC] = useState(null);
  const [refacciones, setRefacciones] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [comentarios, setComentarios] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [descargando, setDescargando] = useState(false);

  async function load() {
    const x = await api.get(`/cotizaciones/${id}`);
    setC(x);
    setComentarios(x.comentarios || "");
  }
  useFocusEffect(useCallback(() => {
    load().catch((e) => alerta("Error", e.message));
    api.get("/refacciones/").then(setRefacciones).catch(() => {});
    api.get("/tipos-servicio/").then(setTipos).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]));

  const accion = async (fn) => { try { setC(await fn()); } catch (e) { alerta("Error", e.message); load(); } };
  const actualizarDetalle = (idD, cambios) => accion(() => api.put(`/cotizaciones/${id}/detalles/${idD}`, cambios));
  const quitar = (idD) => alerta("Quitar refacción", "¿Quitar esta refacción de la cotización?", [
    { text: "Cancelar", style: "cancel" },
    { text: "Quitar", style: "destructive", onPress: () => accion(() => api.del(`/cotizaciones/${id}/detalles/${idD}`)) },
  ]);

  async function agregarCatalogo(items) {
    for (const it of items) {
      await api.post(`/cotizaciones/${id}/detalles`, {
        id_refaccion: it.refaccion.id_refaccion, descripcion: it.refaccion.nombre_refaccion,
        cantidad: it.cantidad, costo_refaccion: (Number(it.precio) || 0) * it.cantidad, costo_extra: 0,
      });
    }
    setAgregando(false);
    await load();
  }
  async function agregarLibre(concepto) {
    setC(await api.post(`/cotizaciones/${id}/detalles`, concepto));
    setAgregando(false);
  }

  async function pdf() {
    if (MODO_LOCAL) { alerta("Disponible con servidor", "El PDF de la cotización se genera en el servidor."); return; }
    setDescargando(true);
    try {
      const token = await getToken();
      const ruta = `${API_URL}/cotizaciones/${id}/pdf`;
      if (Platform.OS === "web") {
        const res = await fetch(ruta, { headers: { Authorization: `Bearer ${token}` } });
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a"); a.href = url; a.download = `cotizacion-${id}.pdf`; a.click();
        return;
      }
      const r = await FileSystem.downloadAsync(ruta, `${FileSystem.cacheDirectory}cotizacion-${id}.pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status !== 200) throw new Error("No se pudo generar el PDF.");
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(r.uri, { mimeType: "application/pdf" });
    } catch (e) { alerta("Error", e.message); } finally { setDescargando(false); }
  }

  if (!c) return <Text style={styles.cargando}>Cargando cotización…</Text>;
  const detalles = c.detalles || [];

  return (
    <View style={styles.screen}>
      <View style={styles.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={styles.numero}>COTIZACIÓN #{c.id_cotizacion}</Text>
          <Text style={styles.titulo} numberOfLines={2}>{c.titulo}</Text>
          <Text style={styles.meta}>
            {new Date(c.fecha_cotizacion).toLocaleDateString("es-MX")}{c.vigente_hasta ? ` · vigente al ${String(c.vigente_hasta).slice(0, 10)}` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.totalEtiqueta}>Total</Text>
          <Text style={styles.total}>{fmt(c.costos?.total)}</Text>
          <Text style={styles.meta}>IVA {fmt(c.costos?.iva)}</Text>
        </View>
      </View>

      <ScrollCampos contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {detalles.length === 0 ? (
          <View style={styles.vacio}>
            <Ionicons name="document-text-outline" size={34} color={colors.petrol600} />
            <Text style={styles.vacioTitulo}>Cotización vacía</Text>
            <Text style={styles.meta}>Agrega refacciones del catálogo o mano de obra.</Text>
          </View>
        ) : detalles.map((d) => {
          const importe = (Number(d.costo_mano_obra) || 0) + (Number(d.costo_refaccion) || 0) + (Number(d.costo_extra) || 0);
          return (
            <View key={d.id_cotizacion_detalle} style={styles.item}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNombre}>{d.descripcion || "Concepto"}</Text>
                  <Text style={styles.meta}>{d.id_refaccion ? "Refacción" : "Concepto libre"}</Text>
                </View>
                <Text style={styles.importe}>{fmt(importe)}</Text>
              </View>
              <View style={styles.itemFila}>
                <View style={styles.contador}>
                  <TouchableOpacity disabled={!puedeEditar || (d.cantidad || 1) <= 1} onPress={() => actualizarDetalle(d.id_cotizacion_detalle, { cantidad: (d.cantidad || 1) - 1 })}>
                    <Ionicons name="remove-circle-outline" size={26} color={puedeEditar && (d.cantidad || 1) > 1 ? colors.petrol600 : colors.ink300} />
                  </TouchableOpacity>
                  <Text style={styles.contadorTexto}>{d.cantidad || 1}</Text>
                  <TouchableOpacity disabled={!puedeEditar} onPress={() => actualizarDetalle(d.id_cotizacion_detalle, { cantidad: (d.cantidad || 1) + 1 })}>
                    <Ionicons name="add-circle-outline" size={26} color={puedeEditar ? colors.petrol600 : colors.ink300} />
                  </TouchableOpacity>
                </View>
                {puedeEditar && (
                  <TouchableOpacity style={styles.quitar} onPress={() => quitar(d.id_cotizacion_detalle)}>
                    <Ionicons name="trash-outline" size={15} color={colors.red600} /><Text style={styles.quitarTexto}>Quitar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        <View style={styles.bloque}>
          <View style={styles.ivaFila}>
            <Text style={styles.ivaTexto}>Aplicar IVA (16%)</Text>
            <Switch value={(c.iva_porcentaje ?? 16) > 0} disabled={!puedeEditar} onValueChange={(v) => accion(() => api.put(`/cotizaciones/${id}`, { iva_porcentaje: v ? 16 : 0 }))} trackColor={{ true: colors.petrol500 }} />
          </View>
          <Text style={[styles.label, { marginTop: 14 }]}>Comentarios</Text>
          <TextInput style={styles.textarea} value={comentarios} onChangeText={setComentarios} multiline editable={puedeEditar} placeholder="Condiciones, tiempos de entrega…" placeholderTextColor={colors.ink500} />
          {puedeEditar && (
            <TouchableOpacity style={styles.btnChico} onPress={() => accion(() => api.put(`/cotizaciones/${id}`, { comentarios: comentarios.trim() || null }))}>
              <Ionicons name="save-outline" size={15} color={colors.ink900} /><Text style={styles.btnChicoTexto}>Guardar comentarios</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollCampos>

      <View style={styles.barra}>
        {puedeEditar && (
          <TouchableOpacity style={styles.btnSecundario} onPress={() => setAgregando(true)}>
            <Ionicons name="add" size={18} color={colors.ink900} /><Text style={styles.btnSecundarioTexto}>Agregar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.btnPrimario, (detalles.length === 0 || descargando) && { opacity: 0.5 }]} onPress={pdf} disabled={detalles.length === 0 || descargando}>
          <Ionicons name="share-outline" size={18} color={colors.paper100} /><Text style={styles.btnPrimarioTexto}>{descargando ? "Generando…" : "PDF para el cliente"}</Text>
        </TouchableOpacity>
      </View>

      <HojaAgregarConceptos
        visible={agregando}
        titulo={`Agregar a la cotización #${c.id_cotizacion}`}
        refacciones={refacciones}
        tipos={tipos}
        onAgregarCatalogo={agregarCatalogo}
        onAgregarLibre={agregarLibre}
        onCerrar={() => setAgregando(false)}
      />
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cargando: { padding: spacing.lg, color: colors.ink500, fontSize: 14 },
  cabecera: { flexDirection: "row", gap: 12, padding: spacing.lg, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  numero: { fontSize: 11, fontWeight: "700", color: colors.petrol600, letterSpacing: 0.6 },
  titulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 22, color: colors.ink900 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  totalEtiqueta: { fontSize: 10.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase" },
  total: { fontFamily: "BarlowCondensed_700Bold", fontSize: 26, color: colors.ink900 },
  vacio: { alignItems: "center", gap: 6, paddingVertical: 30 },
  vacioTitulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 21, color: colors.ink900 },
  item: { backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginBottom: 10 },
  itemNombre: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
  importe: { fontSize: 15.5, fontWeight: "700", color: colors.ink900 },
  itemFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  contador: { flexDirection: "row", alignItems: "center", gap: 8 },
  contadorTexto: { fontSize: 16, fontWeight: "700", color: colors.ink900, minWidth: 22, textAlign: "center" },
  quitar: { flexDirection: "row", alignItems: "center", gap: 4 },
  quitarTexto: { fontSize: 12.5, fontWeight: "600", color: colors.red600 },
  bloque: { backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginTop: 6 },
  ivaFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ivaTexto: { fontSize: 14, color: colors.ink700 },
  label: { fontSize: 12, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 },
  textarea: { borderWidth: 1.5, borderColor: colors.petrol300, borderRadius: 10, backgroundColor: colors.paper100, padding: 12, fontSize: 14, minHeight: 70, textAlignVertical: "top", color: colors.ink900 },
  btnChico: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 10, backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  btnChicoTexto: { fontSize: 13, fontWeight: "600", color: colors.ink900 },
  barra: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 14,
    backgroundColor: colors.paper100, borderTopWidth: 1, borderTopColor: colors.ink300, elevation: 8, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: -3 },
  },
  btnPrimario: { flex: 1.5, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.petrol500, borderRadius: 10, height: 48 },
  btnPrimarioTexto: { fontSize: 15, fontWeight: "600", color: colors.paper100 },
  btnSecundario: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, height: 48 },
  btnSecundarioTexto: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
});
