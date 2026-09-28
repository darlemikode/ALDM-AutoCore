import { useCallback, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, StyleSheet, Modal, Image, Switch } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { api, urlArchivo, archivoParaForm } from "../api";
import { Ionicons } from "@expo/vector-icons";
import HojaFormulario from "../ui/HojaFormulario";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";

export default function PromocionesScreen() {
  const [promociones, setPromociones] = useState([]);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [subiendoImagen, setSubiendoImagen] = useState(null);

  const [editando, setEditando] = useState(null); // {} nueva, objeto = editar

  async function cargar() {
    const data = await api.get("/promociones/");
    setPromociones(data);
  }

  useFocusEffect(
    useCallback(() => {
      cargar().catch((err) => alerta("Error", err.message));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // Mismos campos y grupos que web-admin/src/pages/Promociones.jsx
  const CAMPOS = [
    { name: "titulo", label: "Título", required: true, grupo: "contenido", placeholder: "Ej. 10% en tu primer servicio" },
    { name: "descripcion", label: "Descripción", type: "textarea", grupo: "contenido" },
    { name: "link", label: "Link", grupo: "contenido", placeholder: "WhatsApp, página, etc.", autoCapitalize: "none", hint: "Opcional — a dónde lleva la promoción." },
    { name: "precio_original", label: "Precio original", type: "number", grupo: "precios", mitad: true },
    { name: "precio_promocion", label: "Precio de promoción", type: "number", grupo: "precios", mitad: true },
    { name: "fecha_inicio", label: "Vigente desde", type: "date", grupo: "vigencia" },
    { name: "fecha_fin", label: "Vigente hasta", type: "date", grupo: "vigencia" },
    { name: "orden", label: "Orden", type: "number", grupo: "vigencia", hint: "Menor número = aparece primero." },
    { name: "solo_nuevos_clientes", label: "Exclusiva para clientes nuevos", type: "checkbox", grupo: "vigencia", hint: "Solo la ven quienes nunca han tenido un servicio" },
  ];
  const GRUPOS = { contenido: "Contenido", precios: "Precios", vigencia: "Vigencia" };

  async function guardar(v) {
    const datos = { ...v, fecha_inicio: v.fecha_inicio || null, fecha_fin: v.fecha_fin || null, link: v.link || null, solo_nuevos_clientes: !!v.solo_nuevos_clientes };
    if (editando?.id_promocion) await api.put(`/promociones/${editando.id_promocion}`, datos);
    else await api.post("/promociones/", { ...datos, activa: true });
    setEditando(null);
    await cargar();
  }

  function quitar(promo) {
    alerta("Quitar promoción", `¿Quitar "${promo.titulo}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Quitar", style: "destructive", onPress: async () => {
          try {
            await api.del(`/promociones/${promo.id_promocion}`);
            await cargar();
          } catch (err) {
            alerta("Error", err.message);
          }
        },
      },
    ]);
  }

  async function elegirImagen(promo) {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      alerta("Falta permiso", "Activa el permiso de fotos para elegir una imagen.");
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (resultado.canceled) return;

    const asset = resultado.assets[0];
    const formData = new FormData();
    formData.append("archivo", await archivoParaForm(asset.uri), asset.fileName || `promo_${Date.now()}.jpg`);

    setSubiendoImagen(promo.id_promocion);
    try {
      await api.postForm(`/promociones/${promo.id_promocion}/imagen`, formData);
      await cargar();
    } catch (err) {
      alerta("Error al subir la imagen", err.message);
    } finally {
      setSubiendoImagen(null);
    }
  }

  const uriImagen = urlArchivo;

  return (
    <View style={styles.screen}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subtitle}>Así se ven en el inicio de la app de tus clientes</Text>
        </View>
        <TouchableOpacity style={styles.botonPreview} onPress={() => setPrevisualizando(true)}>
          <Text style={styles.botonPreviewTexto}>👁️ Ver como cliente</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={promociones}
        keyExtractor={(item) => String(item.id_promocion)}
        contentContainerStyle={{ paddingBottom: 60 }}
        renderItem={({ item }) => {
          const uri = uriImagen(item.ruta_imagen);
          return (
            <View style={styles.card}>
              <TouchableOpacity onPress={() => elegirImagen(item)}>
                {uri ? (
                  <Image source={{ uri }} style={styles.imagen} resizeMode="cover" />
                ) : (
                  <View style={styles.imagenVacia}>
                    <Text style={styles.imagenVaciaTexto}>{subiendoImagen === item.id_promocion ? "Subiendo…" : "Toca para agregar imagen"}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ padding: spacing.md }}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardTitle}>{item.titulo} {item.solo_nuevos_clientes ? <Text style={styles.badge}>Nuevos</Text> : null}</Text>
                  <View style={{ flexDirection: "row", gap: 14 }}>
                    <TouchableOpacity onPress={() => setEditando(item)} hitSlop={8}><Ionicons name="create-outline" size={20} color={colors.ink700} /></TouchableOpacity>
                    <TouchableOpacity onPress={() => quitar(item)} hitSlop={8}><Ionicons name="trash-outline" size={20} color={colors.red600} /></TouchableOpacity>
                  </View>
                </View>
                {item.descripcion ? <Text style={styles.cardSub}>{item.descripcion}</Text> : null}
                {item.fecha_inicio || item.fecha_fin ? (
                  <Text style={styles.cardSub}>Vigencia: {item.fecha_inicio ? String(item.fecha_inicio).slice(0, 10) : "—"} a {item.fecha_fin ? String(item.fecha_fin).slice(0, 10) : "sin fin"}</Text>
                ) : null}
                {item.precio_promocion ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                    {item.precio_original ? <Text style={styles.precioTachado}>${item.precio_original}</Text> : null}
                    <Text style={styles.precio}>${item.precio_promocion}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Sin promociones todavía.</Text>}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setEditando({})}>
        <Text style={styles.fabTexto}>+</Text>
      </TouchableOpacity>

      <HojaFormulario
        visible={!!editando}
        titulo={editando?.id_promocion ? "Editar promoción" : "Nueva promoción"}
        icono="pricetag-outline"
        campos={CAMPOS}
        grupos={GRUPOS}
        valoresIniciales={editando?.id_promocion ? { ...editando, fecha_inicio: editando.fecha_inicio ? String(editando.fecha_inicio).slice(0, 10) : "", fecha_fin: editando.fecha_fin ? String(editando.fecha_fin).slice(0, 10) : "" } : { orden: "0" }}
        onGuardar={guardar}
        onCerrar={() => setEditando(null)}
      />

      <Modal visible={previsualizando} transparent animationType="slide" onRequestClose={() => setPrevisualizando(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: "80%" }]}>
            <Text style={styles.modalTitle}>Así lo ve tu cliente</Text>
            <ScrollView>
              {promociones.filter((p) => p.activa !== false).length === 0 ? (
                <Text style={styles.empty}>No hay promociones activas para mostrar.</Text>
              ) : (
                promociones.filter((p) => p.activa !== false).map((p) => {
                  const uri = uriImagen(p.ruta_imagen);
                  return (
                    <View key={p.id_promocion} style={styles.card}>
                      {uri ? <Image source={{ uri }} style={styles.imagen} resizeMode="cover" /> : null}
                      <View style={{ padding: spacing.md }}>
                        <Text style={styles.cardTitle}>{p.titulo}</Text>
                        {p.descripcion ? <Text style={styles.cardSub}>{p.descripcion}</Text> : null}
                        {p.precio_promocion ? (
                          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                            {p.precio_original ? <Text style={styles.precioTachado}>${p.precio_original}</Text> : null}
                            <Text style={styles.precio}>${p.precio_promocion}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity style={styles.boton} onPress={() => setPrevisualizando(false)}>
              <Text style={styles.botonTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0, padding: spacing.lg },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink900 },
  subtitle: { fontSize: 12.5, color: colors.ink500, marginTop: 4, marginBottom: spacing.md },
  botonPreview: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginTop: 2 },
  botonPreviewTexto: { fontSize: 12, fontWeight: "700", color: colors.ink700 },
  card: { backgroundColor: colors.paper100, borderRadius: 10, marginBottom: spacing.md, overflow: "hidden" },
  imagen: { width: "100%", height: 120 },
  imagenVacia: { width: "100%", height: 90, backgroundColor: colors.paper0, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  imagenVaciaTexto: { fontSize: 12, color: colors.ink500 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.ink900, flex: 1 },
  cardSub: { fontSize: 13, color: colors.ink500, marginTop: 4 },
  badge: { fontSize: 10, fontWeight: "800", color: colors.petrol600, backgroundColor: colors.petrol100, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 100 },
  precioTachado: { fontSize: 12, color: colors.ink500, textDecorationLine: "line-through" },
  precio: { fontSize: 17, fontWeight: "800", color: colors.petrol600 },
  quitar: { fontSize: 12, fontWeight: "700", color: colors.red600 },
  empty: { color: colors.ink500, fontSize: 13, textAlign: "center", marginTop: spacing.lg },
  fab: { position: "absolute", right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.petrol500, alignItems: "center", justifyContent: "center", elevation: 4 },
  fabTexto: { color: "#fff", fontSize: 28, fontWeight: "700", marginTop: -2 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(20,24,28,0.55)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 30 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", marginBottom: 12 },
  label: { fontSize: 11, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 10, fontSize: 14 },
  textarea: { minHeight: 60, textAlignVertical: "top" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  botonSecundario: { flex: 1, backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 14, alignItems: "center" },
  botonSecundarioTexto: { color: colors.ink900, fontWeight: "600" },
  boton: { flex: 1, backgroundColor: colors.petrol500, borderRadius: 8, padding: 14, alignItems: "center" },
  botonTexto: { color: "#fff", fontWeight: "800" },
});
