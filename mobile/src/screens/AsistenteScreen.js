import { useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput,
} from "react-native";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";

const CONSULTAS = [
  { clave: "clientes_activos", etiqueta: "👥 Clientes activos" },
  { clave: "ordenes_abiertas", etiqueta: "🔧 Órdenes abiertas" },
  { clave: "pendientes_pago", etiqueta: "💵 Pendientes de pago" },
  { clave: "stock_bajo", etiqueta: "📦 Stock bajo" },
  { clave: "proximos_servicio", etiqueta: "🔔 Próximos a dar servicio" },
  { clave: "deuda_proveedores", etiqueta: "🧾 Deuda con proveedores" },
];

/**
 * Consultas rápidas de uso interno para el staff del taller — no es de
 * cara al cliente. Antes este módulo simulaba una llamada telefónica con
 * verificación de identidad; se reemplazó por esto porque lo que
 * realmente se necesita es resolver preguntas del día a día ("¿cuántos
 * clientes activos tengo?", "¿qué se me quedó pendiente de cobrar?") sin
 * andar navegando por varias pantallas.
 */
export default function AsistenteScreen() {
  const [mensajes, setMensajes] = useState([]);
  const [cargando, setCargando] = useState(null);
  const [pregunta, setPregunta] = useState("");

  // Asistente del mecánico: vehículo + código de falla (ej. "Nissan Versa 2016 P0420")
  async function preguntarMecanico() {
    const texto = pregunta.trim();
    if (!texto) return;
    setMensajes((prev) => [...prev, { autor: "staff", texto }]);
    setPregunta("");
    setCargando("mecanico");
    try {
      const r = await api.post("/asistente/diagnostico", { mensaje: texto });
      setMensajes((prev) => [...prev, { autor: "bot", texto: r.texto }]);
    } catch (err) {
      setMensajes((prev) => [...prev, { autor: "bot", texto: `⚠️ ${err.message}` }]);
    } finally {
      setCargando(null);
    }
  }

  async function consultar(consulta) {
    setMensajes((prev) => [...prev, { autor: "staff", texto: consulta.etiqueta }]);
    setCargando(consulta.clave);
    try {
      const texto = await resolver(consulta.clave);
      setMensajes((prev) => [...prev, { autor: "bot", texto }]);
    } catch (err) {
      setMensajes((prev) => [...prev, { autor: "bot", texto: `⚠️ ${err.message}` }]);
    } finally {
      setCargando(null);
    }
  }

  async function resolver(clave) {
    if (clave === "clientes_activos") {
      const clientes = await api.get("/clientes/?solo_activos=true");
      if (clientes.length === 0) return "No hay clientes activos registrados.";
      return `Tienes ${clientes.length} cliente(s) activo(s):\n` +
        clientes.slice(0, 15).map((c) => `• ${c.nombre_cliente} ${c.paterno_cliente || ""} (${c.numero_cuenta})`).join("\n") +
        (clientes.length > 15 ? `\n… y ${clientes.length - 15} más.` : "");
    }

    if (clave === "ordenes_abiertas") {
      const ordenes = await api.get("/servicios/?status=abierto");
      if (ordenes.length === 0) return "No tienes ninguna orden abierta en este momento.";
      return `${ordenes.length} orden(es) abierta(s):\n` +
        ordenes.map((s) => `• #${s.id_servicio} — ${s.nombre_servicio} (${s.cliente?.nombre_cliente || "—"})`).join("\n");
    }

    if (clave === "pendientes_pago") {
      const ordenes = await api.get("/servicios/?status=abierto");
      const pendientes = ordenes.filter((s) => !s.pagado && s.costos?.saldo_pendiente > 0.01);
      if (pendientes.length === 0) return "No hay ninguna orden con saldo pendiente. ✅";
      const total = pendientes.reduce((acc, s) => acc + s.costos.saldo_pendiente, 0);
      return `${pendientes.length} orden(es) con saldo pendiente, por un total de $${total.toFixed(2)}:\n` +
        pendientes.map((s) => `• #${s.id_servicio} — ${s.cliente?.nombre_cliente || "—"}: $${s.costos.saldo_pendiente.toFixed(2)}`).join("\n");
    }

    if (clave === "stock_bajo") {
      const refacciones = await api.get("/refacciones/");
      const bajas = refacciones.filter((r) => (r.cantidad_refaccion ?? 0) <= (r.umbral_rojo ?? 1));
      if (bajas.length === 0) return "No hay ninguna refacción en stock crítico. ✅";
      return `${bajas.length} refacción(es) con stock crítico:\n` +
        bajas.map((r) => `• ${r.nombre_refaccion}: ${r.cantidad_refaccion} pza(s)`).join("\n");
    }

    if (clave === "proximos_servicio") {
      const proximos = await api.get("/dashboard/proximos-servicios?dias_umbral=150");
      if (proximos.length === 0) return "No hay clientes próximos a dar servicio (150+ días sin visitar).";
      return `${proximos.length} cliente(s) con 150+ días sin dar servicio:\n` +
        proximos.slice(0, 15).map((p) => `• ${p.nombre_cliente} — hace ${Math.floor(p.dias_desde_ultimo_servicio / 30)} meses`).join("\n");
    }

    if (clave === "deuda_proveedores") {
      const resumen = await api.get("/dashboard/resumen");
      const deuda = resumen.deuda_con_proveedores || 0;
      if (deuda <= 0.01) return "No tienes deuda pendiente con proveedores. ✅";
      return `Deuda total con proveedores: $${deuda.toFixed(2)}.`;
    }

    return "Esa consulta no existe.";
  }

  function limpiar() {
    setMensajes([]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.encabezado}>
        <View>
          <Text style={styles.subtitle}>Consultas rápidas de uso interno — solo para el staff</Text>
        </View>
        {mensajes.length > 0 && (
          <TouchableOpacity onPress={limpiar}><Text style={styles.limpiar}>Limpiar</Text></TouchableOpacity>
        )}
      </View>

      {mensajes.length > 0 && (
        <View style={styles.chatBox}>
          {mensajes.map((m, i) => (
            <View key={i} style={[styles.burbuja, m.autor === "staff" ? styles.burbujaStaff : styles.burbujaBot]}>
              <Text style={[styles.burbujaTexto, m.autor === "staff" && { color: "#fff" }]}>{m.texto}</Text>
            </View>
          ))}
          {cargando && <Text style={styles.cargando}>Consultando…</Text>}
        </View>
      )}

      <Text style={styles.seccion}>Asistente del mecánico</Text>
      <View style={styles.preguntaRow}>
        <TextInput
          style={styles.preguntaInput}
          value={pregunta}
          onChangeText={setPregunta}
          placeholder="Ej. Nissan Versa 2016 P0420"
          placeholderTextColor={colors.ink500}
          autoCapitalize="characters"
          returnKeyType="send"
          onSubmitEditing={preguntarMecanico}
        />
        <TouchableOpacity style={styles.preguntaBoton} onPress={preguntarMecanico} disabled={!!cargando}>
          <Text style={styles.preguntaBotonTexto}>Consultar</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.seccion}>¿Qué quieres saber?</Text>
      <View style={styles.opcionesRow}>
        {CONSULTAS.map((c) => (
          <TouchableOpacity key={c.clave} style={styles.chip} onPress={() => consultar(c)} disabled={!!cargando}>
            <Text style={styles.chipTexto}>{c.etiqueta}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  encabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.md },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink900, textTransform: "uppercase" },
  subtitle: { fontSize: 12, color: colors.ink500, marginTop: 2 },
  limpiar: { fontSize: 12.5, color: colors.red600, fontWeight: "700" },
  seccion: { fontSize: 12, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: spacing.sm },
  chatBox: { backgroundColor: colors.paper100, borderRadius: 10, padding: spacing.md, marginBottom: spacing.lg },
  burbuja: { maxWidth: "90%", borderRadius: 10, padding: 10, marginBottom: 8 },
  burbujaStaff: { backgroundColor: colors.petrol500, alignSelf: "flex-end" },
  burbujaBot: { backgroundColor: colors.paper0, alignSelf: "flex-start" },
  burbujaTexto: { fontSize: 13, color: colors.ink900, lineHeight: 19 },
  preguntaRow: { flexDirection: "row", gap: 8, marginBottom: spacing.lg },
  preguntaInput: { flex: 1, borderWidth: 1.5, borderColor: colors.petrol300, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.ink900, backgroundColor: colors.paper100 },
  preguntaBoton: { backgroundColor: colors.petrol500, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  preguntaBotonTexto: { color: "#fff", fontWeight: "800", fontSize: 14 },
  cargando: { fontSize: 12, color: colors.ink500, fontStyle: "italic" },
  opcionesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.petrol300, borderRadius: 100, paddingVertical: 10, paddingHorizontal: 14 },
  chipTexto: { fontSize: 13, fontWeight: "700", color: colors.petrol600 },
});
