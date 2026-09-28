import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, StyleSheet } from "react-native";
import { Picker } from "../ui/Picker";
import { api } from "../api";
import { colors, spacing } from "../theme";
import FotoGaleria from "./FotoGaleria";
import { crearEstilos } from "../ui/estilos";

const ESTADOS = {
  bien: { icono: "✅", texto: "Bien" },
  regular: { icono: "⚠️", texto: "Regular" },
  mal: { icono: "❌", texto: "Mal" },
};

// Ícono por categoría del checklist (las que no estén aquí usan 🔍)
const ICONO_CATEGORIA = {
  "Llantas": "🛞", "Frenos": "🛑", "Luces": "💡", "Fluidos": "💧",
  "Batería y eléctrico": "🔋", "Suspensión y dirección": "🔩", "Carrocería": "🚘",
};

/**
 * Checklist de inspección digital, agrupado por categoría — misma lógica
 * que el panel web. Se guarda solo: cada toque se guarda al momento y los
 * comentarios al dejar de escribir (con una breve pausa). El primer cambio
 * crea la inspección; los siguientes la actualizan.
 */
export default function InspeccionForm({ visible, idVehiculo, idServicio, inspeccionExistente, refacciones, onGuardado, onClose }) {
  const [items, setItems] = useState([]);
  const [resultados, setResultados] = useState({});
  const [comentarioGeneral, setComentarioGeneral] = useState("");
  const [idInspeccion, setIdInspeccion] = useState(inspeccionExistente?.id_inspeccion || null);
  const [estadoGuardado, setEstadoGuardado] = useState(""); // "" | guardando | guardado | error
  const [pendiente, setPendiente] = useState(null);

  const idRef = useRef(inspeccionExistente?.id_inspeccion || null);
  const datosRef = useRef({ resultados, comentarioGeneral });
  datosRef.current = { resultados, comentarioGeneral };
  const colaRef = useRef(Promise.resolve());
  const timerRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    idRef.current = inspeccionExistente?.id_inspeccion || null;
    setIdInspeccion(inspeccionExistente?.id_inspeccion || null);
    setEstadoGuardado("");
    api.get("/inspecciones/items").then((data) => {
      setItems(data);
      const iniciales = {};
      data.forEach((it) => { iniciales[it.id_item] = { estado: "bien", comentario: "", id_refaccion_sugerida: null }; });
      if (inspeccionExistente) {
        inspeccionExistente.resultados.forEach((r) => {
          iniciales[r.id_item] = { estado: r.estado, comentario: r.comentario || "", id_refaccion_sugerida: r.id_refaccion_sugerida };
        });
        setComentarioGeneral(inspeccionExistente.comentario_general || "");
      } else {
        setComentarioGeneral("");
      }
      setResultados(iniciales);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function persistir() {
    const { resultados: res, comentarioGeneral: general } = datosRef.current;
    if (Object.keys(res).length === 0) return;
    const payload = {
      id_vehiculo: idVehiculo,
      id_servicio: idServicio || null,
      comentario_general: general.trim() || null,
      resultados: Object.entries(res).map(([id_item, r]) => ({
        id_item: Number(id_item),
        estado: r.estado,
        comentario: r.comentario.trim() || null,
        id_refaccion_sugerida: r.id_refaccion_sugerida || null,
      })),
    };
    try {
      const guardada = idRef.current
        ? await api.put(`/inspecciones/${idRef.current}`, payload)
        : await api.post("/inspecciones/", payload);
      idRef.current = guardada.id_inspeccion;
      setIdInspeccion(guardada.id_inspeccion);
      setEstadoGuardado("guardado");
      onGuardado?.(guardada);
    } catch (err) {
      setEstadoGuardado("error");
    }
  }

  function encolar() {
    timerRef.current = null;
    colaRef.current = colaRef.current.then(persistir);
    return colaRef.current;
  }

  useEffect(() => {
    if (!pendiente) return undefined;
    setEstadoGuardado("guardando");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(encolar, pendiente.retraso);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendiente]);

  function guardarLuego(retraso = 0) {
    setPendiente((p) => ({ n: (p?.n || 0) + 1, retraso }));
  }

  function actualizar(idItem, campo, valor) {
    setResultados((prev) => ({ ...prev, [idItem]: { ...prev[idItem], [campo]: valor } }));
    guardarLuego(campo === "comentario" ? 900 : 0);
  }

  function marcarCategoria(cat, estado) {
    setResultados((prev) => {
      const siguiente = { ...prev };
      items.filter((i) => i.categoria === cat).forEach((i) => { siguiente[i.id_item] = { ...siguiente[i.id_item], estado }; });
      return siguiente;
    });
    guardarLuego(0);
  }

  async function cerrar() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      encolar();
    }
    await colaRef.current;
    onClose();
  }

  const categorias = [...new Set(items.map((i) => i.categoria))];
  const valores = Object.values(resultados);
  const conteo = {
    bien: valores.filter((r) => r.estado === "bien").length,
    regular: valores.filter((r) => r.estado === "regular").length,
    mal: valores.filter((r) => r.estado === "mal").length,
  };

  const textoGuardado = {
    guardando: "⏳ Guardando…",
    guardado: "✓ Guardado",
    error: "⚠️ No se guardó",
  }[estadoGuardado] || (idInspeccion ? "✓ Guardado" : "Se guarda solo al tocar");

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cerrar}>
      <View style={styles.header}>
        <Text style={styles.headerTitulo}>Inspección digital</Text>
        <TouchableOpacity onPress={cerrar} disabled={estadoGuardado === "guardando"}>
          <Text style={styles.cerrar}>{estadoGuardado === "guardando" ? "Guardando…" : "Listo"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.contadores}>
        <Text style={[styles.cont, { color: colors.teal600 }]}>✅ {conteo.bien} Bien</Text>
        <Text style={[styles.cont, { color: colors.warn600 }]}>⚠️ {conteo.regular} Regular</Text>
        <Text style={[styles.cont, { color: colors.red600 }]}>❌ {conteo.mal} Mal</Text>
        <Text style={styles.guardadoAuto}>{textoGuardado}</Text>
      </View>

      <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <Text style={styles.hint}>Toca el estado de cada punto; se guarda al instante. Lo que quede en "Mal" lo puedes ligar a la refacción que se necesita.</Text>

        {categorias.map((cat) => {
          const delaCat = items.filter((i) => i.categoria === cat);
          const malos = delaCat.filter((i) => resultados[i.id_item]?.estado === "mal").length;
          return (
            <View key={cat} style={{ marginBottom: spacing.lg }}>
              <View style={styles.categoriaTitulo}>
                <Text style={styles.categoriaIcono}>{ICONO_CATEGORIA[cat] || "🔍"}</Text>
                <Text style={styles.categoria}>{cat}</Text>
                {malos > 0 && (
                  <View style={styles.badgeMal}><Text style={styles.badgeMalTexto}>{malos} mal</Text></View>
                )}
                <TouchableOpacity style={styles.botonTodoBien} onPress={() => marcarCategoria(cat, "bien")}>
                  <Text style={styles.botonTodoBienTexto}>✅ Todo bien</Text>
                </TouchableOpacity>
              </View>
              {delaCat.map((item) => {
                const r = resultados[item.id_item] || { estado: "bien", comentario: "", id_refaccion_sugerida: null };
                return (
                  <View key={item.id_item} style={styles.itemCard}>
                    <Text style={styles.itemNombre}>{item.nombre_item}</Text>
                    <View style={styles.estadoRow}>
                      {Object.entries(ESTADOS).map(([estado, e]) => (
                        <TouchableOpacity
                          key={estado}
                          style={[styles.estadoBtn, r.estado === estado && styles.estadoBtnActivo]}
                          onPress={() => actualizar(item.id_item, "estado", estado)}
                        >
                          <Text style={[styles.estadoBtnTexto, r.estado === estado && styles.estadoBtnTextoActivo]}>{e.icono} {e.texto}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {r.estado !== "bien" && (
                      <View style={{ marginTop: 8 }}>
                        <TextInput placeholderTextColor={colors.ink500}
                          style={styles.input}
                          placeholder="📝 Comentario (opcional)"
                          value={r.comentario}
                          onChangeText={(v) => actualizar(item.id_item, "comentario", v)}
                        />
                        {r.estado === "mal" && (
                          <View style={[styles.pickerWrap, { marginTop: 8 }]}>
                            <Picker titulo="Sugerir refacción" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500}
                              selectedValue={r.id_refaccion_sugerida || ""}
                              onValueChange={(v) => actualizar(item.id_item, "id_refaccion_sugerida", v || null)}
                            >
                              <Picker.Item label="🔧 Sugerir refacción (opcional)" value="" />
                              {refacciones.map((ref) => (
                                <Picker.Item key={ref.id_refaccion} label={ref.nombre_refaccion} value={ref.id_refaccion} />
                              ))}
                            </Picker>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        <Text style={styles.label}>📋 Comentario general</Text>
        <TextInput placeholderTextColor={colors.ink500}
          style={[styles.input, styles.textarea]}
          value={comentarioGeneral}
          onChangeText={(v) => { setComentarioGeneral(v); guardarLuego(900); }}
          multiline
          placeholder="Observaciones generales de la inspección"
        />

        {idInspeccion && (
          <View style={{ marginTop: spacing.lg }}>
            <FotoGaleria entidadTipo="inspeccion" entidadId={idInspeccion} />
          </View>
        )}
      </ScrollView>
    </Modal>
  );
}

const styles = crearEstilos({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.ink300, backgroundColor: colors.paper100 },
  headerTitulo: { fontSize: 16, fontWeight: "800", color: colors.ink900, textTransform: "uppercase" },
  cerrar: { fontSize: 13, color: colors.petrol600, fontWeight: "700" },
  contadores: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300, alignItems: "center" },
  cont: { fontSize: 12, fontWeight: "700" },
  guardadoAuto: { fontSize: 11, color: colors.ink500, marginLeft: "auto" },
  screen: { flex: 1, backgroundColor: colors.paper0 },
  hint: { fontSize: 12, color: colors.ink500, marginBottom: spacing.md },
  categoriaTitulo: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm, flexWrap: "wrap" },
  categoriaIcono: { fontSize: 15 },
  categoria: { fontSize: 12, fontWeight: "800", color: colors.petrol600, textTransform: "uppercase" },
  badgeMal: { backgroundColor: colors.red100, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  badgeMalTexto: { fontSize: 10, fontWeight: "800", color: colors.red600 },
  botonTodoBien: { marginLeft: "auto", backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  botonTodoBienTexto: { fontSize: 11, fontWeight: "700", color: colors.ink700 },
  itemCard: { backgroundColor: colors.paper100, borderRadius: 8, padding: spacing.sm, marginBottom: spacing.sm },
  itemNombre: { fontSize: 13, fontWeight: "600", color: colors.ink900, marginBottom: 8 },
  estadoRow: { flexDirection: "row", gap: 6 },
  estadoBtn: { flex: 1, backgroundColor: colors.paper0, borderRadius: 8, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: colors.ink300 },
  estadoBtnActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  estadoBtnTexto: { fontSize: 11, fontWeight: "700", color: colors.ink700 },
  estadoBtnTextoActivo: { color: "#fff" },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 10, fontSize: 13 },
  textarea: { minHeight: 70, textAlignVertical: "top" },
  pickerWrap: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, overflow: "hidden" },
  label: { fontSize: 11, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 },
});
