import { useState } from "react";
import { View, Text, TouchableOpacity, Modal, FlatList, Pressable } from "react-native";
import { Ionicons } from "./IconoWeb";
import { colors } from "../theme";
import { crearEstilos } from "./estilos";

/*
 * Filtro de categoría: un botón "Categoría" que abre una hoja con la lista
 * (y cuántas refacciones hay en cada una). Con una categoría elegida el botón
 * se vuelve acento, muestra su nombre y una ✕ para borrar el filtro de un toque.
 * categorias: [{ nombre, cuenta }]
 */
export default function FiltroCategoria({ categorias = [], valor = "", onChange }) {
  const [abierto, setAbierto] = useState(false);
  const total = categorias.reduce((t, c) => t + (c.cuenta || 0), 0);
  const elegir = (v) => { onChange(v); setAbierto(false); };

  return (
    <>
      <View style={styles.fila}>
        <TouchableOpacity style={[styles.boton, !!valor && styles.botonActivo]} onPress={() => setAbierto(true)} activeOpacity={0.8}>
          <Ionicons name="filter-outline" size={15} color={valor ? colors.sobreAcento : colors.ink700} />
          <Text style={[styles.texto, !!valor && styles.textoActivo]} numberOfLines={1}>{valor || "Categoría"}</Text>
          {!valor && <Ionicons name="chevron-down-outline" size={14} color={colors.ink500} />}
        </TouchableOpacity>
        {!!valor && (
          <TouchableOpacity style={styles.borrar} onPress={() => onChange("")} hitSlop={8} accessibilityLabel="Borrar filtro de categoría">
            <Ionicons name="close-outline" size={16} color={colors.red600} />
            <Text style={styles.borrarTexto}>Quitar filtro</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={abierto} transparent animationType="slide" onRequestClose={() => setAbierto(false)}>
        <Pressable style={styles.velo} onPress={() => setAbierto(false)}>
          <Pressable style={styles.hoja} onPress={() => {}}>
            <View style={styles.asa} />
            <View style={styles.cabeza}>
              <Text style={styles.titulo}>Categoría</Text>
              {!!valor && (
                <TouchableOpacity onPress={() => elegir("")} hitSlop={8}><Text style={styles.limpiar}>Borrar filtro</Text></TouchableOpacity>
              )}
            </View>
            <FlatList
              data={[{ nombre: "", cuenta: total }, ...categorias]}
              keyExtractor={(c) => c.nombre || "todas"}
              contentContainerStyle={{ paddingBottom: 24 }}
              renderItem={({ item }) => {
                const activa = item.nombre === valor;
                return (
                  <TouchableOpacity style={[styles.opcion, activa && styles.opcionActiva]} onPress={() => elegir(item.nombre)} activeOpacity={0.7}>
                    <Text style={[styles.opcionTexto, activa && { color: colors.petrol600, fontWeight: "700" }]}>{item.nombre || "Todas las categorías"}</Text>
                    <Text style={styles.cuenta}>{item.cuenta}</Text>
                    {activa && <Ionicons name="checkmark-outline" size={18} color={colors.petrol600} />}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = crearEstilos({
  fila: { flexDirection: "row", alignItems: "center", gap: 8 },
  boton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.ink300, backgroundColor: colors.paper100, borderRadius: 100, paddingVertical: 7, paddingHorizontal: 13, maxWidth: 230 },
  botonActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  texto: { fontSize: 13, fontWeight: "600", color: colors.ink700, flexShrink: 1 },
  textoActivo: { color: colors.sobreAcento, fontWeight: "700" },
  borrar: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 100, backgroundColor: colors.red100 },
  borrarTexto: { fontSize: 12.5, fontWeight: "700", color: colors.red600 },
  velo: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  hoja: { backgroundColor: colors.paper100, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "70%", paddingHorizontal: 16, paddingTop: 8 },
  asa: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.ink300, marginBottom: 10 },
  cabeza: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  titulo: { fontSize: 18, fontWeight: "800", color: colors.ink900 },
  limpiar: { fontSize: 13.5, fontWeight: "700", color: colors.red600 },
  opcion: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 12 },
  opcionActiva: { backgroundColor: colors.petrol100 },
  opcionTexto: { flex: 1, fontSize: 15, color: colors.ink900 },
  cuenta: { fontSize: 12.5, fontWeight: "700", color: colors.ink500, backgroundColor: colors.paper0, borderRadius: 100, paddingVertical: 2, paddingHorizontal: 9 },
});
