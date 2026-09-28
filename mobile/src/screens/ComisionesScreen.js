import { useCallback, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";

const ETIQUETAS = { efectivo: "Efectivo", tarjeta: "Pago con tarjeta", mixto: "Mixto" };

export default function ComisionesScreen() {
  const [comisiones, setComisiones] = useState([]);
  const [valores, setValores] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setCargando(true);
      api.get("/comisiones/")
        .then((data) => {
          setComisiones(data);
          const iniciales = {};
          data.forEach((c) => { iniciales[c.tipo_pago] = String(c.porcentaje); });
          setValores(iniciales);
        })
        .catch((err) => alerta("Error", err.message))
        .finally(() => setCargando(false));
    }, [])
  );

  async function guardar() {
    setGuardando(true);
    try {
      await Promise.all(
        comisiones.map((c) =>
          api.put(`/comisiones/${c.tipo_pago}`, { porcentaje: parseFloat(valores[c.tipo_pago]) || 0 })
        )
      );
      alerta("Listo", "Las comisiones se actualizaron.");
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.petrol500} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.subtitulo}>Se usa para mostrar la comisión estimada en cada nota/recibo finalizado.</Text>

      {comisiones.map((c) => (
        <View key={c.tipo_pago} style={styles.fila}>
          <Text style={styles.label}>{ETIQUETAS[c.tipo_pago] || c.tipo_pago}</Text>
          <View style={styles.inputRow}>
            <TextInput placeholderTextColor={colors.ink500}
              style={styles.input}
              keyboardType="numeric"
              value={valores[c.tipo_pago] || ""}
              onChangeText={(v) => setValores((prev) => ({ ...prev, [c.tipo_pago]: v }))}
              placeholder="0"
            />
            <Text style={styles.simbolo}>%</Text>
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.boton} onPress={guardar} disabled={guardando}>
        <Text style={styles.botonTexto}>{guardando ? "Guardando…" : "Guardar cambios"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0, padding: spacing.lg },
  centrado: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0 },
  titulo: { fontSize: 20, fontWeight: "800", color: colors.ink900 },
  subtitulo: { fontSize: 12.5, color: colors.ink500, marginTop: 4, marginBottom: spacing.lg },
  fila: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: "700", color: colors.ink900, marginBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 10, fontSize: 15 },
  simbolo: { fontSize: 15, fontWeight: "700", color: colors.ink500 },
  boton: { backgroundColor: colors.petrol500, borderRadius: 8, padding: 14, alignItems: "center", marginTop: spacing.lg },
  botonTexto: { color: "#fff", fontWeight: "800", fontSize: 14, textTransform: "uppercase" },
});
