import { useCallback, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";
import { Ionicons } from "@expo/vector-icons";
import BadgeIcono from "../ui/BadgeIcono";
import ScrollCampos from "../ui/ScrollCampos";

const META = {
  efectivo: { icono: "cash-outline", color: "#6bdc8c", desc: "Pago en billetes o monedas" },
  tarjeta: { icono: "card-outline", color: "#5ad1ff", desc: "Comisión de la terminal bancaria" },
  mixto: { icono: "swap-horizontal-outline", color: "#ffb454", desc: "Parte en efectivo y parte en tarjeta" },
};
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
      <ScrollCampos contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 }}>
        <View style={styles.intro}>
          <Ionicons name="information-circle-outline" size={20} color={colors.petrol600} />
          <Text style={styles.subtitulo}>Se usa para mostrar la comisión estimada en cada nota o recibo finalizado, según cómo pagó el cliente.</Text>
        </View>

        {comisiones.map((c) => {
          const meta = META[c.tipo_pago] || { icono: "card-outline", color: "#7be07b", desc: "" };
          const pct = parseFloat(String(valores[c.tipo_pago] || "0").replace(",", ".")) || 0;
          return (
            <View key={c.tipo_pago} style={styles.tarjeta}>
              <View style={styles.tarjetaTop}>
                <BadgeIcono icono={meta.icono} color={meta.color} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{ETIQUETAS[c.tipo_pago] || c.tipo_pago}</Text>
                  <Text style={styles.desc}>{meta.desc}</Text>
                </View>
                <View style={styles.inputCaja}>
                  <TextInput
                    placeholderTextColor={colors.ink500}
                    style={styles.input}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    value={valores[c.tipo_pago] ?? ""}
                    onChangeText={(v) => setValores((prev) => ({ ...prev, [c.tipo_pago]: v }))}
                    placeholder="0"
                  />
                  <Text style={styles.simbolo}>%</Text>
                </View>
              </View>
              <Text style={styles.ejemplo}>Ejemplo: en una orden de $1,000 → comisión de <Text style={styles.ejemploMonto}>${(pct * 10).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text></Text>
            </View>
          );
        })}
      </ScrollCampos>

      <View style={styles.pie}>
        <TouchableOpacity style={styles.boton} onPress={guardar} disabled={guardando}>
          <Text style={styles.botonTexto}>{guardando ? "Guardando…" : "Guardar cambios"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  centrado: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0 },
  intro: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: colors.petrol100, borderRadius: 12, padding: 12, marginBottom: spacing.lg },
  subtitulo: { flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.ink700 },
  tarjeta: { backgroundColor: colors.paper100, borderRadius: 16, borderWidth: 1, borderColor: colors.ink300, padding: 14, marginBottom: spacing.md },
  tarjetaTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { fontSize: 16, fontWeight: "800", color: colors.ink900 },
  desc: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  inputCaja: { flexDirection: "row", alignItems: "center", backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.petrol300, borderRadius: 12, paddingHorizontal: 12, minWidth: 96 },
  input: { fontSize: 22, fontWeight: "800", color: colors.ink900, paddingVertical: 8, minWidth: 48, textAlign: "right" },
  simbolo: { fontSize: 16, fontWeight: "800", color: colors.ink500, marginLeft: 4 },
  ejemplo: { fontSize: 13, color: colors.ink500, marginTop: 10 },
  ejemploMonto: { fontWeight: "800", color: colors.ink900 },
  pie: { paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.ink300, backgroundColor: colors.paper0 },
  boton: { backgroundColor: colors.petrol500, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  botonTexto: { color: colors.paper100, fontWeight: "800", fontSize: 15, textTransform: "uppercase" },
});
