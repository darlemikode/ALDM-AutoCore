// Reglas del negocio: días de prueba, de gracia, de conservación de datos…
import { View, Text, ScrollView, TextInput } from "react-native";
import { useEffect, useState } from "react";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";
import { Boton, Tarjeta, fmt, useCargar } from "../ui/comunes";

const CAMPOS = [
  ["dias_prueba", "Días de prueba", "Cuánto dura la prueba gratis de un taller nuevo."],
  ["dias_gracia", "Días de gracia", "Después de vencer, el taller puede entrar SOLO a consultar (no capturar) durante estos días."],
  ["dias_conservacion", "Días de conservación de datos", "Tiempo que se guardan los datos de un taller vencido o suspendido antes de marcarlo para depurar."],
  ["dias_aviso_vencimiento", "Días de aviso antes de vencer", "Desde cuántos días antes se le avisa al taller (y a ti) que su suscripción está por vencer."],
];

export default function ConfiguracionScreen({ navigation }) {
  const { datos } = useCargar(async () => {
    const [config, paquetes] = await Promise.all([api.get("/superadmin/configuracion"), api.get("/superadmin/paquetes")]);
    return { config, paquetes };
  });
  const [valores, setValores] = useState(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (datos) setValores({ ...datos.config }); }, [datos]);

  if (!valores) return <View style={styles.screen} />;

  async function guardar() {
    setGuardando(true);
    try {
      const cuerpo = { id_paquete_prueba: valores.id_paquete_prueba || null };
      for (const [k, etiqueta] of CAMPOS) {
        const n = parseInt(String(valores[k]), 10);
        if (Number.isNaN(n) || n < 0) throw new Error(`Revisa "${etiqueta}": debe ser un número de 0 en adelante.`);
        cuerpo[k] = n;
      }
      await api.put("/superadmin/configuracion", cuerpo);
      alerta("Guardado", "Las reglas nuevas aplican de inmediato a todos los talleres.");
      navigation.goBack();
    } catch (err) {
      alerta("No se pudo guardar", err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {CAMPOS.map(([k, etiqueta, ayuda]) => (
        <Tarjeta key={k}>
          <Text style={styles.label}>{etiqueta}</Text>
          <View style={styles.filaInput}>
            <TextInput style={styles.input} keyboardType="number-pad" value={String(valores[k] ?? "")} onChangeText={(v) => setValores({ ...valores, [k]: v.replace(/[^0-9]/g, "") })} />
            <Text style={styles.unidad}>días</Text>
          </View>
          <Text style={styles.ayuda}>{ayuda}</Text>
        </Tarjeta>
      ))}
      <Tarjeta>
        <Text style={styles.label}>Paquete durante la prueba</Text>
        <Text style={styles.ayuda}>El que se propone al dar de alta un taller en prueba.</Text>
        <View style={styles.chips}>
          {datos.paquetes.map((p) => {
            const activo = valores.id_paquete_prueba === p.id_paquete;
            return (
              <Text key={p.id_paquete} onPress={() => setValores({ ...valores, id_paquete_prueba: p.id_paquete })} style={[styles.chip, activo && styles.chipActivo]}>
                {p.nombre} · {fmt(p.precio_mensual)}
              </Text>
            );
          })}
        </View>
      </Tarjeta>
      <Boton texto="Guardar reglas" icono="save-outline" onPress={guardar} cargando={guardando} />
    </ScrollView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  label: { fontSize: 14.5, fontWeight: "700", color: colors.ink900 },
  filaInput: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 8 },
  input: { width: 110, borderWidth: 1.5, borderColor: colors.petrol300, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 18, fontWeight: "700", color: colors.ink900, backgroundColor: colors.paper100 },
  unidad: { fontSize: 14, color: colors.ink700 },
  ayuda: { fontSize: 12.5, color: colors.ink700 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, fontSize: 13, fontWeight: "600", color: colors.ink700, overflow: "hidden" },
  chipActivo: { backgroundColor: colors.petrol600, borderColor: colors.petrol600, color: colors.paper100 },
});
