import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { colors, spacing, temaActivo } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { AYUDA } from "../tutoriales/catalogo";
import { vistosSesion } from "../tutoriales/bienvenida";

// Ayuda: recorridos con globos de texto, desglosados por módulo (igual que
// Configuración → Ayuda en la web). Los que aún no existen dicen «Próximamente».
export default function AyudaScreen({ navigation }) {
  const { user, hasPermission } = useAuth();
  const [, refrescar] = useState(0);
  useFocusEffect(useCallback(() => { refrescar((n) => n + 1); }, [])); // al volver se marca «Visto ✓»

  const vistos = new Set([...(user?.tutoriales_vistos || []), ...vistosSesion]);
  const modulos = AYUDA
    .filter((m) => !m.permiso || hasPermission(m.permiso))
    .map((m) => ({ ...m, tutoriales: m.tutoriales.filter((t) => !t.permiso || hasPermission(t.permiso)) }))
    .filter((m) => m.tutoriales.length > 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48, gap: 18 }}>
      <Text style={styles.intro}>Recorridos con globos de texto que te muestran, paso a paso, cómo se usa cada módulo.</Text>
      {modulos.map((m) => {
        const listos = m.tutoriales.filter((t) => t.abrir).length;
        return (
          <View key={m.modulo} style={styles.modulo}>
            <View style={styles.cabeza}>
              <View style={styles.icono}><Ionicons name={m.icono} size={22} color={colors.petrol600} /></View>
              <Text style={styles.nombre}>{m.modulo}</Text>
              <Text style={styles.cuenta}>{listos} de {m.tutoriales.length}</Text>
            </View>
            {m.tutoriales.map((t, i) => {
              const Contenedor = t.abrir ? TouchableOpacity : View;
              return (
                <Contenedor key={t.clave} style={[styles.item, i > 0 && styles.divisor]} activeOpacity={0.6}
                  onPress={t.abrir ? () => t.abrir(user, navigation) : undefined}
                  accessibilityRole={t.abrir ? "button" : undefined}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.titulo, !t.abrir && { color: colors.ink700 }]}>{t.titulo}</Text>
                    <Text style={styles.desc}>{t.desc}</Text>
                    {t.abrir && vistos.has(t.clave) ? <Text style={styles.visto}>Visto ✓</Text> : null}
                  </View>
                  {t.abrir ? (
                    <View style={styles.ver}><Text style={[styles.verTexto, { color: temaActivo() === "oscuro" ? colors.paper100 : "#fff" }]}>Ver</Text></View>
                  ) : (
                    <View style={styles.pronto}><Text style={styles.prontoTexto}>Próximamente</Text></View>
                  )}
                </Contenedor>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  intro: { fontSize: 16, lineHeight: 23, color: colors.ink700 },
  modulo: { backgroundColor: colors.paper100, borderRadius: 16, borderWidth: 1, borderColor: colors.ink300, overflow: "hidden" },
  cabeza: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  icono: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0 },
  nombre: { flex: 1, fontFamily: "BarlowCondensed_700Bold", fontSize: 22, color: colors.ink900 },
  cuenta: { fontSize: 13.5, color: colors.ink500 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  divisor: { borderTopWidth: 1, borderTopColor: colors.ink300 },
  titulo: { fontSize: 17, fontWeight: "700", color: colors.ink900 },
  desc: { fontSize: 14.5, lineHeight: 20, color: colors.ink500, marginTop: 2 },
  visto: { fontSize: 13.5, fontWeight: "700", color: colors.petrol600, marginTop: 4 },
  ver: { minWidth: 70, minHeight: 46, borderRadius: 12, backgroundColor: colors.petrol600, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  verTexto: { fontSize: 17, fontWeight: "700" },
  pronto: { borderRadius: 100, borderWidth: 1, borderColor: colors.ink300, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.paper0 },
  prontoTexto: { fontSize: 12.5, fontWeight: "700", color: colors.ink500 },
});
