import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform } from "react-native";
import { API_URL } from "../api";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";

const OPCIONES = [
  { clave: "alta", etiqueta: "🆕 Dar de alta mi cuenta" },
  { clave: "servicio", etiqueta: "🚗 Estatus de mi servicio" },
  { clave: "reclamacion", etiqueta: "🛡️ Reclamar garantía" },
  { clave: "seguimiento", etiqueta: "📍 Seguimiento" },
  { clave: "facturacion", etiqueta: "💵 Facturación / saldo" },
];

/**
 * Chatbot de respuestas fijas (no es lenguaje libre a propósito, para que
 * siempre conteste algo correcto). Funciona ANTES de iniciar sesión —
 * primero confirma identidad con número de cuenta + VIN del vehículo, sin
 * necesitar contraseña; útil sobre todo para quien todavía no activa su
 * cuenta y necesita el código para hacerlo.
 */
export default function ChatbotScreen({ onClose }) {
  const [verificando, setVerificando] = useState(false);
  const [token, setToken] = useState(null);
  const [nombreCliente, setNombreCliente] = useState("");

  const [numeroCuenta, setNumeroCuenta] = useState("");
  const [vin, setVin] = useState("");

  const [mensajes, setMensajes] = useState([]); // [{autor:"bot"|"yo", texto}]
  const [cargandoOpcion, setCargandoOpcion] = useState(null);

  async function verificarIdentidad() {
    if (!numeroCuenta.trim() || !vin.trim()) {
      alerta("Faltan datos", "Escribe tu número de cuenta y el VIN de tu vehículo.");
      return;
    }
    setVerificando(true);
    try {
      const res = await fetch(`${API_URL}/chatbot/verificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero_cuenta: numeroCuenta.trim(), vin: vin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "No se pudo verificar tu identidad.");

      setToken(data.token);
      setNombreCliente(data.nombre_cliente);
      setMensajes([
        { autor: "bot", texto: `Hola, ${data.nombre_cliente} 👋 Ya confirmé quién eres. ¿En qué te ayudo?` },
      ]);
    } catch (err) {
      alerta("No pudimos verificarte", err.message);
    } finally {
      setVerificando(false);
    }
  }

  async function elegirOpcion(opcion) {
    setMensajes((prev) => [...prev, { autor: "yo", texto: opcion.etiqueta }]);
    setCargandoOpcion(opcion.clave);
    try {
      const res = await fetch(`${API_URL}/chatbot/opcion/${opcion.clave}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "No se pudo obtener la respuesta.");
      setMensajes((prev) => [...prev, { autor: "bot", texto: data.texto }]);
    } catch (err) {
      setMensajes((prev) => [...prev, { autor: "bot", texto: `⚠️ ${err.message}` }]);
    } finally {
      setCargandoOpcion(null);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={styles.botIcono}><Ionicons name="chatbubble-ellipses" size={18} color={colors.petrol600} /></View>
          <View>
            <Text style={styles.headerTitulo}>Asistente</Text>
            <Text style={styles.headerSub}>{token ? `Verificado · ${nombreCliente}` : "Respuestas al instante"}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.cerrarBoton} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.ink700} />
        </TouchableOpacity>
      </View>

      {!token ? (
        <ScrollView contentContainerStyle={styles.formulario} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Antes de ayudarte, necesito confirmar que eres tú. Dime tu número de cuenta y el VIN (número de serie)
            de tu vehículo, tal como están registrados en el taller.
          </Text>
          <Text style={styles.label}>Número de cuenta</Text>
          <TextInput style={styles.input} value={numeroCuenta} onChangeText={setNumeroCuenta} placeholder="CTE-000001" placeholderTextColor={colors.ink500} autoCapitalize="characters" />
          <Text style={styles.label}>VIN de tu vehículo</Text>
          <TextInput style={styles.input} value={vin} onChangeText={setVin} placeholder="3N1CN7AP..." placeholderTextColor={colors.ink500} autoCapitalize="characters" />
          <TouchableOpacity style={styles.boton} onPress={verificarIdentidad} disabled={verificando}>
            <Text style={styles.botonTexto}>{verificando ? "Verificando…" : "Confirmar identidad"}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
            {mensajes.map((m, i) => (
              <View key={i} style={[styles.burbuja, m.autor === "yo" ? styles.burbujaYo : styles.burbujaBot]}>
                <Text style={[styles.burbujaTexto, m.autor === "yo" && { color: "#fff" }]}>{m.texto}</Text>
              </View>
            ))}
            {cargandoOpcion && <Text style={styles.escribiendo}>Escribiendo…</Text>}
          </ScrollView>

          <View style={styles.menu}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {OPCIONES.map((op) => (
                <TouchableOpacity key={op.clave} style={styles.chip} onPress={() => elegirOpcion(op)} disabled={!!cargandoOpcion}>
                  <Text style={styles.chipTexto}>{op.etiqueta}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: 52, paddingBottom: 14, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.linea },
  headerTitulo: { fontSize: 17, fontWeight: "700", color: colors.ink900 },
  headerSub: { fontSize: 12, color: colors.ink500 },
  botIcono: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  cerrarBoton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0 },
  formulario: { padding: spacing.lg },
  intro: { fontSize: 13, color: colors.ink700, lineHeight: 19, marginBottom: spacing.lg },
  label: { fontSize: 11, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4, marginTop: spacing.sm },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.linea, borderRadius: 10, padding: 12, fontSize: 15, color: colors.ink900 },
  boton: { backgroundColor: colors.petrol500, borderRadius: 12, padding: 15, alignItems: "center", marginTop: spacing.lg },
  botonTexto: { color: "#fff", fontWeight: "700", fontSize: 15 },
  burbuja: { maxWidth: "85%", borderRadius: 12, padding: 12, marginBottom: 10 },
  burbujaYo: { backgroundColor: colors.petrol500, alignSelf: "flex-end", borderBottomRightRadius: 2 },
  burbujaBot: { backgroundColor: colors.paper100, alignSelf: "flex-start", borderBottomLeftRadius: 2 },
  burbujaTexto: { fontSize: 13.5, color: colors.ink900, lineHeight: 19 },
  escribiendo: { fontSize: 12, color: colors.ink500, fontStyle: "italic" },
  menu: { borderTopWidth: 1, borderTopColor: colors.linea, backgroundColor: colors.paper100, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  chip: { backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.petrol300, borderRadius: 100, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8 },
  chipTexto: { fontSize: 12.5, fontWeight: "700", color: colors.petrol600 },
});
