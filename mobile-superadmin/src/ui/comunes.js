// Piezas visuales compartidas por todas las pantallas de la app.
import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme";
import { crearEstilos } from "./estilos";
import { alerta } from "./Dialogo";

export const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtCorto = (n) => {
  const v = Number(n) || 0;
  return v >= 1000 ? `$${(v / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}k` : `$${v.toFixed(0)}`;
};
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fmtFecha(iso) {
  if (!iso) return "—";
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

export const ESTADOS = {
  prueba: { texto: "En prueba", tono: "blue", icono: "flask-outline" },
  activa: { texto: "Activa", tono: "teal", icono: "checkmark-circle-outline" },
  gracia: { texto: "En gracia", tono: "warn", icono: "time-outline" },
  vencida: { texto: "Vencida", tono: "red", icono: "alert-circle-outline" },
  suspendida: { texto: "Suspendida", tono: "gris", icono: "pause-circle-outline" },
  cancelada: { texto: "Cancelada", tono: "gris", icono: "close-circle-outline" },
};

function tonos(tono) {
  return {
    teal: [colors.teal100, colors.teal600], red: [colors.red100, colors.red600], warn: [colors.warn100, colors.warn600],
    blue: [colors.blue100, colors.blue600], petrol: [colors.petrol100, colors.petrol600], gris: [colors.paper0, colors.ink700],
  }[tono] || [colors.paper0, colors.ink700];
}

export function Badge({ texto, tono = "petrol" }) {
  const [fondo, color] = tonos(tono);
  return (
    <View style={[styles.badge, { backgroundColor: fondo }]}>
      <Text style={[styles.badgeTexto, { color }]}>{texto}</Text>
    </View>
  );
}

export function EstadoBadge({ estado }) {
  const e = ESTADOS[estado] || { texto: estado || "—", tono: "gris" };
  return <Badge texto={e.texto} tono={e.tono} />;
}

export function Tarjeta({ children, style, onPress }) {
  const Comp = onPress ? TouchableOpacity : View;
  return <Comp style={[styles.tarjeta, style]} onPress={onPress} activeOpacity={0.8}>{children}</Comp>;
}

export function Seccion({ titulo, accion, onAccion }) {
  return (
    <View style={styles.seccion}>
      <Text style={styles.seccionTitulo}>{titulo}</Text>
      {accion ? <TouchableOpacity onPress={onAccion} hitSlop={8}><Text style={styles.link}>{accion}</Text></TouchableOpacity> : null}
    </View>
  );
}

export function Fila({ etiqueta, valor, tono }) {
  return (
    <View style={styles.fila}>
      <Text style={styles.filaEtiqueta}>{etiqueta}</Text>
      <Text style={[styles.filaValor, tono && { color: tonos(tono)[1] }]}>{valor ?? "—"}</Text>
    </View>
  );
}

export function Boton({ texto, icono, onPress, tipo = "primario", deshabilitado, cargando, style }) {
  const secundario = tipo === "secundario";
  const peligro = tipo === "peligro";
  return (
    <TouchableOpacity
      style={[styles.boton, secundario && styles.botonSecundario, peligro && styles.botonPeligro, (deshabilitado || cargando) && { opacity: 0.6 }, style]}
      onPress={onPress} disabled={deshabilitado || cargando} activeOpacity={0.8}
    >
      {cargando ? <ActivityIndicator color={secundario ? colors.ink900 : colors.paper100} /> : (
        <>
          {icono ? <Ionicons name={icono} size={17} color={secundario ? colors.ink900 : peligro ? colors.red600 : colors.paper100} /> : null}
          <Text style={[styles.botonTexto, secundario && { color: colors.ink900 }, peligro && { color: colors.red600 }]}>{texto}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function Fab({ icono = "add", onPress, etiqueta }) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} accessibilityLabel={etiqueta}>
      <Ionicons name={icono} size={28} color={colors.paper100} />
    </TouchableOpacity>
  );
}

export function Vacio({ texto, icono = "file-tray-outline" }) {
  return (
    <View style={styles.vacio}>
      <Ionicons name={icono} size={34} color={colors.ink500} />
      <Text style={styles.vacioTexto}>{texto}</Text>
    </View>
  );
}

// Carga datos al entrar a la pantalla y al jalar para refrescar.
export function useCargar(cargar, deps = []) {
  const [datos, setDatos] = useState(null);
  const [refrescando, setRefrescando] = useState(false);
  const recargar = useCallback(async (conIndicador = false) => {
    if (conIndicador) setRefrescando(true);
    try {
      setDatos(await cargar());
    } catch (err) {
      alerta("No se pudo cargar", err.message);
    } finally {
      setRefrescando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useFocusEffect(useCallback(() => { recargar(); }, [recargar]));
  return { datos, setDatos, recargar, refrescando };
}

// Confirmación antes de una acción delicada (suspender, eliminar…)
export function confirmar(titulo, mensaje, textoAccion, accion, destructiva = true) {
  alerta(titulo, mensaje, [
    { text: "Cancelar", style: "cancel" },
    { text: textoAccion, style: destructiva ? "destructive" : "default", onPress: accion },
  ]);
}

const styles = crearEstilos({
  badge: { alignSelf: "flex-start", borderRadius: 100, paddingVertical: 3, paddingHorizontal: 10 },
  badgeTexto: { fontSize: 11.5, fontWeight: "700" },
  tarjeta: { backgroundColor: colors.paper100, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.ink300 },
  seccion: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 8 },
  seccionTitulo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 20, color: colors.ink900 },
  link: { fontSize: 13.5, fontWeight: "700", color: colors.petrol600 },
  fila: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.ink300, gap: 12 },
  filaEtiqueta: { fontSize: 13, color: colors.ink700 },
  filaValor: { fontSize: 14, fontWeight: "600", color: colors.ink900, flexShrink: 1, textAlign: "right" },
  boton: { flexDirection: "row", gap: 8, backgroundColor: colors.petrol600, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  botonSecundario: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300 },
  botonPeligro: { backgroundColor: colors.red100 },
  botonTexto: { color: colors.paper100, fontWeight: "700", fontSize: 14.5 },
  fab: { position: "absolute", right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.petrol600, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  vacio: { alignItems: "center", paddingVertical: spacing.xxl, gap: 10 },
  vacioTexto: { fontSize: 13.5, color: colors.ink700, textAlign: "center" },
});
