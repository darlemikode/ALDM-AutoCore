import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Picker } from "../ui/Picker";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { mostrarDialogo, alerta } from "../ui/Dialogo";

const ETIQUETAS_ETAPA = {
  recibido: "Recibido",
  diagnostico: "En diagnóstico",
  esperando_autorizacion: "Esperando autorización del cliente",
  en_reparacion: "En reparación",
  esperando_refacciones: "Esperando refacciones",
  control_calidad: "Control de calidad",
  listo_entrega: "Listo para entrega",
};

/** Panel para actualizar en qué etapa va un servicio abierto, con bitácora. */
export default function EtapaTracker({ servicio, puedeEditar, onActualizado }) {
  const [etapas, setEtapas] = useState([]);
  const ORDEN = Object.keys(ETIQUETAS_ETAPA);
  // Se propone la siguiente etapa (no la actual) para evitar registrar la misma dos veces
  const siguiente = (actual) => ORDEN[Math.min(ORDEN.indexOf(actual || "recibido") + 1, ORDEN.length - 1)] || "recibido";
  const [nuevaEtapa, setNuevaEtapa] = useState(siguiente(servicio.etapa));
  useEffect(() => { setNuevaEtapa(siguiente(servicio.etapa)); }, [servicio.etapa]); // eslint-disable-line react-hooks/exhaustive-deps
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api.get("/servicios/etapas-disponibles").then(setEtapas).catch(() => setEtapas([]));
    }, [])
  );

  function actualizar() {
    const actual = servicio.etapa || "recibido";
    const etiqueta = ETIQUETAS_ETAPA[nuevaEtapa] || nuevaEtapa;
    if (nuevaEtapa === actual) {
      if (!comentario.trim()) {
        mostrarDialogo({
          tono: "alerta", icono: "repeat", etiqueta: "Mismo estatus",
          titulo: `Ya está en "${etiqueta}"`,
          mensaje: "Elige otra etapa para avanzar la orden, o escribe un comentario si solo quieres dejar una nota en esta misma etapa.",
          acciones: [
            { texto: `Pasar a "${ETIQUETAS_ETAPA[siguiente(actual)]}"`, tipo: "primario", icono: "arrow-forward", onPress: () => setNuevaEtapa(siguiente(actual)) },
            { texto: "Entendido", tipo: "secundario" },
          ],
        });
        return;
      }
      mostrarDialogo({
        tono: "info", icono: "chatbox-ellipses", etiqueta: "Mismo estatus",
        titulo: "¿Registrar solo la nota?",
        mensaje: `La orden seguirá en "${etiqueta}" y se agregará tu comentario a la bitácora.`,
        acciones: [
          { texto: "Sí, registrar nota", tipo: "primario", icono: "checkmark", onPress: guardarEtapa },
          { texto: "Cancelar", tipo: "secundario" },
        ],
      });
      return;
    }
    guardarEtapa();
  }

  async function guardarEtapa() {
    setGuardando(true);
    try {
      const actualizado = await api.put(`/servicios/${servicio.id_servicio}/etapa`, { etapa: nuevaEtapa, comentario: comentario.trim() || null });
      setComentario("");
      onActualizado(actualizado);
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardando(false);
    }
  }

  const catalogo = etapas.length ? etapas : Object.entries(ETIQUETAS_ETAPA).map(([clave, etiqueta]) => ({ clave, etiqueta }));
  const historial = (servicio.historial_etapas || []).slice().reverse();

  return (
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>Estatus del servicio</Text>

      {puedeEditar && (
        <View style={styles.formulario}>
          <View style={styles.pickerWrap}>
            <Picker titulo="Cambiar etapa" ordenar={false} style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} selectedValue={nuevaEtapa} onValueChange={setNuevaEtapa}>
              {catalogo.map((e) => (
                <Picker.Item key={e.clave} label={e.etiqueta} value={e.clave} />
              ))}
            </Picker>
          </View>
          <TextInput placeholderTextColor={colors.ink500}
            style={styles.input}
            placeholder="Comentario (opcional)"
            value={comentario}
            onChangeText={setComentario}
          />
          <TouchableOpacity style={styles.boton} onPress={actualizar} disabled={guardando}>
            <Text style={styles.botonTexto}>{guardando ? "Guardando…" : "Actualizar estatus"}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.linea}>
        {historial.length === 0 ? (
          <Text style={styles.vacio}>Sin movimientos registrados todavía.</Text>
        ) : (
          historial.map((h, i) => (
            <View key={h.id_registro ?? `${h.etapa}-${i}`} style={styles.item}>
              <View style={styles.punto} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitulo}>{ETIQUETAS_ETAPA[h.etapa] || h.etapa}</Text>
                <Text style={styles.itemFecha}>
                  {new Date(h.fecha).toLocaleString("es-MX")} {h.actualizado_por ? `· ${h.actualizado_por}` : ""}
                </Text>
                {h.comentario ? <Text style={styles.itemComentario}>{h.comentario}</Text> : null}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = crearEstilos({
  contenedor: { backgroundColor: colors.paper100, borderRadius: 10, padding: spacing.md, marginTop: spacing.lg },
  titulo: { fontSize: 14, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", marginBottom: spacing.sm },
  formulario: { marginBottom: spacing.md, gap: 8 },
  pickerWrap: { backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, overflow: "hidden" },
  input: { backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 10, fontSize: 13 },
  boton: { backgroundColor: colors.petrol500, borderRadius: 8, padding: 12, alignItems: "center" },
  botonTexto: { color: "#fff", fontWeight: "800", fontSize: 13, textTransform: "uppercase" },
  linea: { borderLeftWidth: 2, borderLeftColor: colors.petrol100, paddingLeft: 14 },
  vacio: { fontSize: 12, color: colors.ink500 },
  item: { flexDirection: "row", marginBottom: 12, position: "relative" },
  punto: { position: "absolute", left: -19, top: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.petrol500 },
  itemTitulo: { fontWeight: "700", fontSize: 13, color: colors.ink900 },
  itemFecha: { fontSize: 11, color: colors.ink500, marginTop: 1 },
  itemComentario: { fontSize: 12, color: colors.ink700, marginTop: 2 },
});
