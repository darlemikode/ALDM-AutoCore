import { Children, isValidElement, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { modalAbierto, modalCerrado } from "../lib/bloqueoMenu";
import { View, Text, TouchableOpacity, Modal, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform, PanResponder } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "./IconoWeb";
import { colors, temaActivo } from "../theme";
import { crearEstilos } from "./estilos";

/*
 * Reemplazo de @react-native-picker/picker con la misma API
 * (<Picker selectedValue onValueChange enabled><Picker.Item label value /></Picker>),
 * pero con hoja inferior translúcida, tipografía de la app, buscador en listas
 * largas, opciones ordenadas alfabéticamente con índice por letra y la opción
 * elegida marcada. `ordenar={false}` respeta el orden original (p. ej. etapas).
 */
function Item() { return null; }

function recolectar(children, lista = []) {
  Children.forEach(children, (h) => {
    if (!isValidElement(h)) return;
    if (h.type === Fragment) return recolectar(h.props.children, lista);
    if (h.type === Item) lista.push({ label: String(h.props.label ?? ""), value: h.props.value, enabled: h.props.enabled !== false });
    else if (h.props?.children) recolectar(h.props.children, lista);
  });
  return lista;
}
const vacio = (v) => v === "" || v === null || v === undefined;
const limpiarEtiqueta = (t) => t.replace(/^\s*-+\s*|\s*-+\s*$/g, "").trim();
const quitarAcentos = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function alfa(hex, a) {
  const h = String(hex).replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Riel A–Z: toca o desliza el dedo para saltar a la primera opción con esa letra
function RielLetras({ disponibles, onLetra }) {
  const alto = useRef(1);
  const ultima = useRef(null);
  const [activa, setActiva] = useState(null);
  const ir = (y) => {
    const i = Math.max(0, Math.min(ABC.length - 1, Math.floor((y / alto.current) * ABC.length)));
    // si esa letra no tiene opciones, salta a la siguiente que sí
    const l = ABC.slice(i).find((x) => disponibles.has(x)) || [...ABC].slice(0, i).reverse().find((x) => disponibles.has(x));
    if (l && l !== ultima.current) { ultima.current = l; setActiva(l); onLetra(l); }
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { ultima.current = null; ir(e.nativeEvent.locationY); },
    onPanResponderMove: (e) => ir(e.nativeEvent.locationY),
    onPanResponderRelease: () => setActiva(null),
    onPanResponderTerminate: () => setActiva(null),
  })).current;
  return (
    <View style={styles.riel} onLayout={(e) => { alto.current = e.nativeEvent.layout.height || 1; }} {...pan.panHandlers}>
      {ABC.map((l) => (
        <Text key={l} pointerEvents="none" style={[styles.rielLetra, !disponibles.has(l) && { opacity: 0.25 }, activa === l && styles.rielActiva]}>{l}</Text>
      ))}
    </View>
  );
}

export function Picker({ selectedValue, onValueChange, enabled = true, children, ordenar = true, titulo, style, estiloDisparador }) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const lista = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    modalAbierto();
    return () => modalCerrado();
  }, [abierto]);
  const todas = recolectar(children);
  const marcador = todas.find((o) => vacio(o.value));
  const opciones = useMemo(() => {
    const reales = todas.filter((o) => !vacio(o.value));
    return ordenar ? [...reales].sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true, sensitivity: "base" })) : reales;
  }, [children, ordenar]); // eslint-disable-line react-hooks/exhaustive-deps
  const elegida = todas.find((o) => !vacio(o.value) && String(o.value) === String(selectedValue));
  const largo = opciones.length > 8;
  // Al buscar: primero las que EMPIEZAN con lo escrito ("Ni" → Nissan antes que Infiniti)
  const buscado = quitarAcentos(q.trim());
  const filtradas = buscado
    ? opciones.filter((o) => quitarAcentos(o.label).includes(buscado))
      .sort((a, b) => (quitarAcentos(a.label).startsWith(buscado) ? 0 : 1) - (quitarAcentos(b.label).startsWith(buscado) ? 0 : 1))
    : opciones;
  const conLetras = ordenar && largo && !q.trim();
  const filas = [];
  let letra = null;
  for (const o of filtradas) {
    const l = quitarAcentos(o.label).charAt(0).toUpperCase();
    if (conLetras && l !== letra) { letra = l; filas.push({ tipo: "letra", l }); }
    filas.push({ tipo: "op", o });
  }
  const conRiel = ordenar && opciones.length > 30 && !q.trim();
  const indiceLetra = {};
  filas.forEach((f, i) => { if (f.tipo === "letra" && indiceLetra[f.l] === undefined) indiceLetra[f.l] = i; });
  const disponibles = new Set(Object.keys(indiceLetra));
  function saltarA(l) {
    const index = indiceLetra[l];
    if (index === undefined || !lista.current) return;
    lista.current.scrollToIndex({ index, animated: false, viewPosition: 0 });
  }
  const oscuro = temaActivo() === "oscuro";
  const textoMarcador = marcador ? limpiarEtiqueta(marcador.label) || "Selecciona" : "Selecciona";

  function elegir(o) {
    setAbierto(false);
    setQ("");
    if (String(o?.value) !== String(selectedValue)) onValueChange?.(o ? o.value : (marcador?.value ?? ""));
  }

  return (
    <>
      <TouchableOpacity style={[styles.disparador, estiloDisparador, !enabled && { opacity: 0.5 }]} disabled={!enabled} onPress={() => setAbierto(true)} activeOpacity={0.7} accessibilityRole="button">
        <Text style={[styles.disparadorTexto, !elegida && styles.disparadorVacio, style?.color && elegida ? { color: colors.ink900 } : null]} numberOfLines={1}>
          {elegida ? elegida.label : textoMarcador}
        </Text>
        <Ionicons name="chevron-down-outline" size={18} color={colors.ink500} />
      </TouchableOpacity>

      <Modal visible={abierto} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAbierto(false)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={[styles.velo, { backgroundColor: oscuro ? "rgba(0,0,0,0.55)" : "rgba(10,30,36,0.35)" }]} onPress={() => setAbierto(false)}>
          {/* Con buscador la hoja tiene alto fijo: al filtrar no se encoge ni se esconde tras el teclado */}
          <Pressable style={[styles.hoja, largo && styles.hojaAlta, { backgroundColor: alfa(colors.paper100, oscuro ? 0.93 : 0.95), borderColor: alfa(colors.petrol500, 0.25) }]} onPress={() => {}}>
            <View style={styles.agarradera} />
            <View style={styles.cabecera}>
              <View style={{ flex: 1 }}>
                <Text style={styles.titulo} numberOfLines={1}>{titulo || textoMarcador.replace(/^selecciona\s*/i, "") || "Selecciona"}</Text>
                <Text style={styles.subtitulo}>{opciones.length} {opciones.length === 1 ? "opción" : "opciones"}{ordenar ? " · A–Z" : ""}</Text>
              </View>
              <TouchableOpacity onPress={() => setAbierto(false)} hitSlop={10} style={[styles.cerrar, { backgroundColor: alfa(colors.ink500, 0.14) }]}>
                <Ionicons name="close-outline" size={20} color={colors.ink700} />
              </TouchableOpacity>
            </View>

            {largo ? (
              <View style={[styles.buscador, { backgroundColor: alfa(colors.ink500, 0.12) }]}>
                <Ionicons name="search-outline" size={17} color={colors.ink500} />
                <TextInput style={styles.buscadorTexto} value={q} onChangeText={setQ} placeholder="Buscar…" placeholderTextColor={colors.ink500} autoCorrect={false} />
                {q ? <TouchableOpacity onPress={() => setQ("")} hitSlop={8}><Ionicons name="close-circle-outline" size={17} color={colors.ink500} /></TouchableOpacity> : null}
              </View>
            ) : null}

            <View style={largo ? { flex: 1 } : undefined}>
            <FlatList
              ref={lista}
              onScrollToIndexFailed={(info) => {
                lista.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
                setTimeout(() => lista.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0 }), 60);
              }}
              data={filas}
              keyExtractor={(f, i) => (f.tipo === "letra" ? `l-${f.l}` : `o-${String(f.o.value)}-${i}`)}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 18, paddingRight: conRiel ? 24 : 0 }}
              initialNumToRender={40}
              ListHeaderComponent={marcador && elegida && !q ? (
                <TouchableOpacity style={styles.opcion} onPress={() => elegir(null)}>
                  <Ionicons name="remove-circle-outline" size={18} color={colors.ink500} />
                  <Text style={[styles.opcionTexto, { color: colors.ink500, fontWeight: "500" }]}>Quitar selección</Text>
                </TouchableOpacity>
              ) : null}
              renderItem={({ item: f }) => {
                if (f.tipo === "letra") return <Text style={styles.letra}>{f.l}</Text>;
                const activa = elegida && String(f.o.value) === String(elegida.value);
                return (
                  <TouchableOpacity
                    style={[styles.opcion, activa && { backgroundColor: alfa(colors.petrol500, oscuro ? 0.16 : 0.12) }, !f.o.enabled && { opacity: 0.4 }]}
                    disabled={!f.o.enabled}
                    onPress={() => elegir(f.o)}
                  >
                    <Text style={[styles.opcionTexto, activa && styles.opcionActiva]} numberOfLines={2}>{f.o.label}</Text>
                    {activa ? <Ionicons name="checkmark-circle-outline" size={20} color={colors.petrol600} /> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.sinResultados}>Sin coincidencias</Text>}
            />
            {conRiel ? <RielLetras disponibles={disponibles} onLetra={saltarA} /> : null}
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}
Picker.Item = Item;
export default Picker;

const styles = crearEstilos({
  disparador: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 14, paddingVertical: 10 },
  disparadorTexto: { flex: 1, fontSize: 15.5, fontWeight: "500", color: colors.ink900 },
  disparadorVacio: { color: colors.ink500, fontWeight: "400" },
  velo: { flex: 1, justifyContent: "flex-end" },
  hojaAlta: { height: "88%", maxHeight: "88%" },
  hoja: { maxHeight: "78%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 16, paddingBottom: 16 },
  agarradera: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.ink300, marginTop: 10, marginBottom: 6 },
  cabecera: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  titulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 24, color: colors.ink900 },
  subtitulo: { fontSize: 12, color: colors.ink500, marginTop: 1, letterSpacing: 0.3 },
  cerrar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, height: 44, marginBottom: 8 },
  buscadorTexto: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  letra: { fontSize: 11.5, fontWeight: "700", color: colors.petrol600, letterSpacing: 1.2, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  opcion: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  opcionTexto: { flex: 1, fontSize: 16, fontWeight: "500", color: colors.ink900, letterSpacing: 0.1 },
  opcionActiva: { color: colors.petrol600, fontWeight: "700" },
  riel: { position: "absolute", right: 0, top: 4, bottom: 18, width: 22, alignItems: "center", justifyContent: "space-between" },
  rielLetra: { fontSize: 10.5, fontWeight: "700", color: colors.petrol600, lineHeight: 12 },
  rielActiva: { color: colors.ink900, transform: [{ scale: 1.5 }] },
  sinResultados: { fontSize: 14, color: colors.ink500, textAlign: "center", paddingVertical: 30 },
});
