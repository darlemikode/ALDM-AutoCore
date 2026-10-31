import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";

/*
 * Alta rápida de una refacción que no existe en el catálogo: nombre, categoría y precio de venta.
 * onCrear({ nombre, categoria, precio }) debe guardar y resolver; el modal se cierra solo.
 */
export default function NuevaRefaccionModal({ visible, nombreInicial = "", categorias = [], onCrear, onCerrar }) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (visible) { setNombre(nombreInicial); setCategoria(""); setPrecio(""); setGuardando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function guardar() {
    if (!nombre.trim()) { alerta("Falta el nombre", "Escribe cómo se llama la refacción."); return; }
    if (!categoria.trim()) { alerta("Falta la categoría", "Elige una o escribe una nueva."); return; }
    if (!(Number(precio) > 0)) { alerta("Falta el precio", "Captura el precio de venta."); return; }
    setGuardando(true);
    try {
      await onCrear({ nombre: nombre.trim(), categoria: categoria.trim(), precio: Number(precio) });
      onCerrar();
    } catch (err) {
      alerta("No se pudo guardar", err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <KeyboardAvoidingView style={styles.fondo} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.hoja}>
          <View style={styles.header}>
            <Text style={styles.titulo}>Refacción nueva</Text>
            <TouchableOpacity onPress={onCerrar} hitSlop={10}><Ionicons name="close" size={24} color={colors.ink900} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
            <Text style={styles.meta}>Se guarda en el catálogo y se agrega sola.</Text>
            <View>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Ej. Balatas delanteras" placeholderTextColor={colors.ink500} />
            </View>
            <View>
              <Text style={styles.label}>Categoría *</Text>
              {categorias.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
                  {categorias.map((c) => (
                    <TouchableOpacity key={c} style={[styles.chip, categoria === c && styles.chipActivo]} onPress={() => setCategoria(c)}>
                      <Text style={[styles.chipTexto, categoria === c && styles.chipTextoActivo]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TextInput style={styles.input} value={categoria} onChangeText={setCategoria} placeholder="Elige una o escribe una nueva" placeholderTextColor={colors.ink500} />
            </View>
            <View>
              <Text style={styles.label}>Precio de venta *</Text>
              <TextInput style={styles.input} value={precio} onChangeText={setPrecio} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.ink500} />
            </View>
          </ScrollView>
          <View style={styles.pie}>
            <TouchableOpacity style={[styles.btnSecundario, { flex: 1 }]} onPress={onCerrar}><Text style={styles.btnSecundarioTexto}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimario} onPress={guardar} disabled={guardando}>
              {guardando ? <ActivityIndicator color={colors.sobreAcento} /> : <Text style={styles.btnPrimarioTexto}>Guardar y agregar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = crearEstilos({
  fondo: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  hoja: { backgroundColor: colors.paper0, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "88%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  titulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 22, color: colors.ink900 },
  meta: { fontSize: 13, color: colors.ink500 },
  label: { fontSize: 12, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: colors.ink900 },
  chip: { borderWidth: 1, borderColor: colors.ink300, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.paper100 },
  chipActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  chipTexto: { fontSize: 13, fontWeight: "600", color: colors.ink700 },
  chipTextoActivo: { color: colors.sobreAcento },
  pie: { flexDirection: "row", gap: 10, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.ink300, backgroundColor: colors.paper100 },
  btnPrimario: { flex: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: colors.petrol500, borderRadius: 10, height: 48 },
  btnPrimarioTexto: { fontSize: 15, fontWeight: "600", color: colors.sobreAcento },
  btnSecundario: { alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, height: 48, paddingHorizontal: 14 },
  btnSecundarioTexto: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
});
