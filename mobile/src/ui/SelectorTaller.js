// "¿A qué taller quieres entrar?" — aparece al iniciar sesión si el
// usuario tiene acceso a más de un taller, y desde el menú ("Cambiar de
// taller") en cualquier momento.
import { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";
import { crearEstilos } from "./estilos";
import { alerta } from "./Dialogo";
import { SelectorEstado } from "./AvisoSuscripcion";

export default function SelectorTaller() {
  const { user, talleres, eligiendoTaller, seleccionarTaller, continuarEnTallerActual } = useAuth();
  const [abiertoManual, setAbiertoManual] = useState(false);
  const [cambiando, setCambiando] = useState(null);

  useEffect(() => {
    SelectorEstado.abrirSelector = () => setAbiertoManual(true);
    return () => { SelectorEstado.abrirSelector = null; };
  }, []);

  const visible = (eligiendoTaller || abiertoManual) && talleres.length > 0;

  async function elegir(t) {
    if (t.id_taller === user?.id_taller) {
      continuarEnTallerActual();
      setAbiertoManual(false);
      return;
    }
    setCambiando(t.id_taller);
    try {
      await seleccionarTaller(t.id_taller);
      setAbiertoManual(false);
    } catch (err) {
      alerta("No se pudo cambiar de taller", err.message);
    } finally {
      setCambiando(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !eligiendoTaller && setAbiertoManual(false)}>
      <View style={styles.fondo}>
        <View style={styles.hoja}>
          <Text style={styles.titulo}>¿A qué taller quieres entrar?</Text>
          <Text style={styles.sub}>Tu usuario tiene acceso a {talleres.length} talleres.</Text>
          <ScrollView style={{ maxHeight: 380 }}>
            {talleres.map((t) => {
              const actual = t.id_taller === user?.id_taller;
              const detalle = [t.rol, t.bloqueado ? "suspendido" : t.estado === "prueba" ? "en prueba" : t.estado === "gracia" ? "solo consulta" : null].filter(Boolean).join(" · ");
              return (
                <TouchableOpacity key={t.id_taller} style={[styles.item, actual && styles.itemActual, t.bloqueado && { opacity: 0.5 }]} disabled={t.bloqueado || cambiando !== null} onPress={() => elegir(t)}>
                  <Ionicons name="business-outline" size={20} color={colors.petrol600} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nombre}>{t.nombre}</Text>
                    <Text style={styles.detalle}>{detalle}</Text>
                  </View>
                  {cambiando === t.id_taller ? <ActivityIndicator color={colors.petrol500} /> : actual ? <Text style={styles.marca}>ACTUAL</Text> : <Ionicons name="chevron-forward" size={18} color={colors.ink500} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {!eligiendoTaller && (
            <TouchableOpacity onPress={() => setAbiertoManual(false)} style={styles.cancelar}>
              <Text style={styles.cancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = crearEstilos({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  hoja: { backgroundColor: colors.paper100, borderRadius: 18, padding: 20 },
  titulo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24, color: colors.ink900 },
  sub: { fontSize: 13, color: colors.ink700, marginTop: 2, marginBottom: 14 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.ink300, borderRadius: 12, padding: 13, marginBottom: 8, backgroundColor: colors.paper0 },
  itemActual: { borderColor: colors.petrol600 },
  nombre: { fontSize: 15, fontWeight: "700", color: colors.ink900 },
  detalle: { fontSize: 12.5, color: colors.ink700, marginTop: 1 },
  marca: { fontSize: 11, fontWeight: "700", color: colors.petrol600 },
  cancelar: { alignItems: "center", paddingTop: 10 },
  cancelarTexto: { color: colors.ink700, fontWeight: "600" },
});
