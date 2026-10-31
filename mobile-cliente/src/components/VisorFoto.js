import { Modal, View, Image, TouchableOpacity, Text, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { urlFoto } from "../lib/fotos";

/** Visor de fotos a pantalla completa: desliza entre las fotos y toca ✕ (o fuera) para cerrar. */
export default function VisorFoto({ fotos = [], indice = 0, onClose }) {
  const { width, height } = useWindowDimensions();
  if (!fotos.length) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.fondo}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentOffset={{ x: indice * width, y: 0 }}>
          {fotos.map((f, i) => (
            <TouchableOpacity key={i} activeOpacity={1} onPress={onClose} style={{ width, height, alignItems: "center", justifyContent: "center" }}>
              <Image source={{ uri: urlFoto(f) }} style={{ width, height: height * 0.8 }} resizeMode="contain" />
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={s.cerrar} onPress={onClose} accessibilityLabel="Cerrar"><Text style={s.cerrarTexto}>✕</Text></TouchableOpacity>
        {fotos.length > 1 && <Text style={s.pista}>Desliza para ver más ({fotos.length})</Text>}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)" },
  cerrar: { position: "absolute", top: 44, right: 18, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  cerrarTexto: { color: "#fff", fontSize: 18, fontWeight: "800" },
  pista: { position: "absolute", bottom: 40, alignSelf: "center", color: "#cbd5e1", fontSize: 12 },
});
