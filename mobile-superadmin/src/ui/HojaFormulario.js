import { useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, Switch, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme";
import { crearEstilos } from "./estilos";

/*
 * Formulario en hoja deslizable — equivalente móvil del FormModal de la web.
 * Mismo contrato de campos que web-admin/src/components/FormModal.jsx, así una
 * pantalla puede declarar exactamente los mismos campos que su página web:
 *
 *   campos: [{ name, label, type, options, required, placeholder, hint, grupo, full, disabled, onElegir }]
 *            o una función (valores) => campos, para campos que dependen de otros.
 *   type: text | number | textarea | select | multiselect | checkbox | date | email | phone | password
 *   options: [{ value, label }]   (select/multiselect)
 *   onElegir(valor, valores) -> objeto con valores a precargar (igual que la web)
 *
 * En celular: opciones como botones táctiles (≤ 8) o lista con buscador,
 * campos obligatorios sin alerta (se marca y se lleva al campo), y el botón
 * Guardar siempre visible abajo.
 */

const hoyISO = (dias = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

function Selector({ campo, valor, onCambiar, multiple }) {
  const [buscando, setBuscando] = useState("");
  const [abierto, setAbierto] = useState(false);
  const opciones = campo.options || [];
  const elegidos = multiple ? (valor || []).map(String) : [String(valor ?? "")];
  const alternar = (v) => {
    if (multiple) {
      const s = String(v);
      onCambiar(elegidos.includes(s) ? (valor || []).filter((x) => String(x) !== s) : [...(valor || []), v]);
    } else {
      onCambiar(String(valor) === String(v) ? "" : v);
      setAbierto(false);
    }
  };

  if (opciones.length <= 8) {
    return (
      <View style={styles.chips}>
        {opciones.map((o) => {
          const activo = elegidos.includes(String(o.value));
          return (
            <TouchableOpacity key={String(o.value)} style={[styles.chip, activo && styles.chipActivo]} onPress={() => !campo.disabled && alternar(o.value)} activeOpacity={0.75}>
              {activo && <Ionicons name="checkmark" size={14} color={colors.paper100} />}
              <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
        {opciones.length === 0 && <Text style={styles.hint}>No hay opciones registradas todavía.</Text>}
      </View>
    );
  }

  const etiqueta = multiple
    ? `${elegidos.length} seleccionado(s)`
    : opciones.find((o) => String(o.value) === String(valor))?.label;
  const filtradas = opciones.filter((o) => !buscando || String(o.label).toLowerCase().includes(buscando.toLowerCase()));
  return (
    <>
      <TouchableOpacity style={[styles.selectorBoton, campo.disabled && { opacity: 0.5 }]} onPress={() => !campo.disabled && setAbierto(true)}>
        <Text style={[styles.selectorTexto, !etiqueta && { color: colors.ink500 }]} numberOfLines={1}>{etiqueta || campo.placeholder || "Toca para elegir"}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.ink500} />
      </TouchableOpacity>
      <Modal visible={abierto} animationType="slide" onRequestClose={() => setAbierto(false)}>
        <View style={styles.listaPantalla}>
          <View style={styles.listaHeader}>
            <Text style={styles.titulo}>{campo.label}</Text>
            <TouchableOpacity onPress={() => setAbierto(false)} hitSlop={10}><Ionicons name="close" size={24} color={colors.ink900} /></TouchableOpacity>
          </View>
          <View style={styles.buscador}>
            <Ionicons name="search" size={18} color={colors.ink500} />
            <TextInput style={styles.buscadorInput} placeholder="Buscar…" placeholderTextColor={colors.ink500} value={buscando} onChangeText={setBuscando} autoFocus />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {filtradas.map((o) => {
              const activo = elegidos.includes(String(o.value));
              return (
                <TouchableOpacity key={String(o.value)} style={styles.listaItem} onPress={() => alternar(o.value)}>
                  <Ionicons name={multiple ? (activo ? "checkbox" : "square-outline") : (activo ? "radio-button-on" : "radio-button-off")} size={21} color={activo ? colors.petrol500 : colors.ink500} />
                  <Text style={styles.listaItemTexto}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
            {filtradas.length === 0 && <Text style={[styles.hint, { padding: spacing.lg }]}>Sin coincidencias.</Text>}
          </ScrollView>
          {multiple && (
            <View style={styles.pie}>
              <TouchableOpacity style={[styles.btnPrimario, { flex: 1 }]} onPress={() => setAbierto(false)}>
                <Text style={styles.btnPrimarioTexto}>Listo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

export default function HojaFormulario({ visible, titulo, subtitulo, icono = "create-outline", campos, valoresIniciales, onGuardar, onCerrar, textoGuardar = "Guardar", grupos }) {
  const [valores, setValores] = useState(valoresIniciales || {});
  const [faltantes, setFaltantes] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const scrollRef = useRef(null);
  const posiciones = useRef({});
  const refs = useRef({});
  const [clave, setClave] = useState(0);

  // Al abrir, se reinician los valores
  const [abiertoAntes, setAbiertoAntes] = useState(false);
  if (visible && !abiertoAntes) {
    setAbiertoAntes(true);
    setValores(valoresIniciales || {});
    setFaltantes([]); setError(""); setClave((k) => k + 1);
  } else if (!visible && abiertoAntes) {
    setAbiertoAntes(false);
  }

  const lista = useMemo(() => (typeof campos === "function" ? campos(valores) : campos) || [], [campos, valores]);

  function actualizar(campo, valor) {
    setValores((prev) => {
      let nuevo = { ...prev, [campo.name]: valor };
      if (campo.onElegir) {
        const extra = campo.onElegir(valor, nuevo);
        if (extra) nuevo = { ...nuevo, ...extra };
      }
      return nuevo;
    });
    if (faltantes.includes(campo.name)) setFaltantes((f) => f.filter((x) => x !== campo.name));
  }

  const vacio = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

  async function guardar() {
    const falta = lista.filter((c) => c.required && !c.disabled && vacio(valores[c.name])).map((c) => c.name);
    if (falta.length) {
      setFaltantes(falta);
      setError("");
      const y = posiciones.current[falta[0]];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
      setTimeout(() => refs.current[falta[0]]?.focus?.(), 250);
      return;
    }
    setGuardando(true);
    setError("");
    try {
      // Números como número (igual que la web)
      const limpio = { ...valores };
      lista.forEach((c) => {
        if (c.type === "number" && limpio[c.name] !== "" && limpio[c.name] != null) limpio[c.name] = Number(String(limpio[c.name]).replace(",", "."));
        if (c.type === "number" && limpio[c.name] === "") limpio[c.name] = null;
      });
      await onGuardar(limpio);
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  function renderCampo(c) {
    const valor = valores[c.name];
    const conError = faltantes.includes(c.name);
    const comunes = {
      ref: (r) => { refs.current[c.name] = r; },
      editable: !c.disabled,
      placeholder: c.placeholder,
      placeholderTextColor: colors.ink500,
      style: [styles.input, conError && styles.inputError, c.type === "textarea" && styles.textarea, c.disabled && { opacity: 0.55 }],
    };
    let control;
    if (c.type === "select") control = <Selector campo={c} valor={valor} onCambiar={(v) => actualizar(c, v)} />;
    else if (c.type === "multiselect") control = <Selector campo={c} valor={valor} onCambiar={(v) => actualizar(c, v)} multiple />;
    else if (c.type === "checkbox") {
      control = (
        <View style={styles.switchFila}>
          <Text style={styles.switchTexto}>{c.hint || (valor ? "Sí" : "No")}</Text>
          <Switch value={!!valor} onValueChange={(v) => actualizar(c, v)} disabled={c.disabled} trackColor={{ true: colors.petrol500 }} />
        </View>
      );
    } else if (c.type === "date") {
      control = (
        <>
          <TextInput {...comunes} value={valor ? String(valor).slice(0, 10) : ""} onChangeText={(v) => actualizar(c, v)} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
          <View style={[styles.chips, { marginTop: 6 }]}>
            {[["Hoy", 0], ["+7 días", 7], ["+30 días", 30]].map(([t, d]) => (
              <TouchableOpacity key={t} style={styles.chipChico} onPress={() => actualizar(c, hoyISO(d))}><Text style={styles.chipChicoTexto}>{t}</Text></TouchableOpacity>
            ))}
            {valor ? <TouchableOpacity style={styles.chipChico} onPress={() => actualizar(c, "")}><Text style={styles.chipChicoTexto}>Quitar</Text></TouchableOpacity> : null}
          </View>
        </>
      );
    } else {
      control = (
        <TextInput
          {...comunes}
          value={valor == null ? "" : String(valor)}
          onChangeText={(v) => actualizar(c, v)}
          multiline={c.type === "textarea"}
          keyboardType={c.type === "number" ? "decimal-pad" : c.type === "email" ? "email-address" : c.type === "phone" ? "phone-pad" : "default"}
          autoCapitalize={c.type === "email" || c.type === "password" ? "none" : c.autoCapitalize || "sentences"}
          secureTextEntry={c.type === "password"}
          autoCorrect={c.type === "password" ? false : undefined}
        />
      );
    }
    return (
      <View key={c.name} style={[styles.campo, c.mitad && styles.campoMitad]} onLayout={(e) => { posiciones.current[c.name] = e.nativeEvent.layout.y; }}>
        {c.type !== "checkbox" || c.label ? (
          <Text style={[styles.label, conError && { color: colors.red600 }]}>{c.label}{c.required ? " *" : ""}</Text>
        ) : null}
        {control}
        {conError ? <Text style={styles.errorCampo}>Este dato es obligatorio</Text> : c.hint && c.type !== "checkbox" ? <Text style={styles.hint}>{c.hint}</Text> : null}
      </View>
    );
  }

  // Agrupado por secciones (como los "grupos" de la web)
  const secciones = [];
  lista.forEach((c) => {
    const g = c.grupo || "";
    let s = secciones.find((x) => x.grupo === g);
    if (!s) { s = { grupo: g, campos: [] }; secciones.push(s); }
    s.campos.push(c);
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <KeyboardAvoidingView style={styles.fondo} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.hoja} key={clave}>
          <View style={styles.agarradera} />
          <View style={styles.encabezado}>
            <View style={styles.icono}><Ionicons name={icono} size={18} color={colors.petrol600} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.titulo}>{titulo}</Text>
              {subtitulo ? <Text style={styles.subtitulo}>{subtitulo}</Text> : null}
            </View>
            <TouchableOpacity onPress={onCerrar} hitSlop={10}><Ionicons name="close" size={24} color={colors.ink700} /></TouchableOpacity>
          </View>
          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            {secciones.map((s) => (
              <View key={s.grupo || "general"}>
                {s.grupo ? <Text style={styles.seccion}>{(grupos && grupos[s.grupo]) || s.grupo}</Text> : null}
                <View style={styles.filaCampos}>{s.campos.map(renderCampo)}</View>
              </View>
            ))}
            {error ? (
              <View style={styles.errorCaja}>
                <Ionicons name="alert-circle" size={18} color={colors.red600} />
                <Text style={styles.errorTexto}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.pie}>
            <TouchableOpacity style={styles.btnSecundario} onPress={onCerrar}><Text style={styles.btnSecundarioTexto}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimario, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
              {guardando ? <ActivityIndicator color={colors.paper100} /> : <Text style={styles.btnPrimarioTexto}>{textoGuardar}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = crearEstilos({
  fondo: { flex: 1, backgroundColor: "rgba(20,24,28,0.55)", justifyContent: "flex-end" },
  hoja: { backgroundColor: colors.paper0, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "92%" },
  agarradera: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.ink300, marginTop: 8 },
  encabezado: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  icono: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  titulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 22, color: colors.ink900 },
  subtitulo: { fontSize: 12.5, color: colors.ink500 },
  seccion: { fontSize: 12, fontWeight: "700", color: colors.petrol600, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 10, marginBottom: 8 },
  filaCampos: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  campo: { width: "100%", marginBottom: 14 },
  campoMitad: { width: "48.5%" },
  label: { fontSize: 12, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: colors.ink900 },
  inputError: { borderColor: colors.red600, borderWidth: 2 },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  hint: { fontSize: 12, color: colors.ink700, marginTop: 5 },
  errorCampo: { fontSize: 12, fontWeight: "600", color: colors.red600, marginTop: 5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderColor: colors.ink300, borderRadius: 100, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.paper100 },
  chipActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  chipTexto: { fontSize: 14, fontWeight: "600", color: colors.ink700 },
  chipTextoActivo: { color: colors.paper100 },
  chipChico: { borderRadius: 100, paddingVertical: 5, paddingHorizontal: 11, backgroundColor: colors.petrol100 },
  chipChicoTexto: { fontSize: 12.5, fontWeight: "600", color: colors.petrol600 },
  selectorBoton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, paddingHorizontal: 13, height: 46 },
  selectorTexto: { flex: 1, fontSize: 15, color: colors.ink900 },
  switchFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.paper100, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8 },
  switchTexto: { flex: 1, fontSize: 14, color: colors.ink700 },
  listaPantalla: { flex: 1, backgroundColor: colors.paper0, paddingTop: 36 },
  listaHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: 10 },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.lg, marginBottom: 8, backgroundColor: colors.paper100, borderWidth: 1.5, borderColor: colors.petrol300, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  buscadorInput: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  listaItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  listaItemTexto: { flex: 1, fontSize: 15, color: colors.ink900 },
  errorCaja: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.red100, borderRadius: 10, padding: 12, marginTop: 4 },
  errorTexto: { flex: 1, fontSize: 13.5, fontWeight: "600", color: colors.red600 },
  pie: { flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 18, backgroundColor: colors.paper100, borderTopWidth: 1, borderTopColor: colors.ink300 },
  btnPrimario: { flex: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: colors.petrol500, borderRadius: 10, height: 48 },
  btnPrimarioTexto: { fontSize: 15, fontWeight: "600", color: colors.paper100 },
  btnSecundario: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, height: 48 },
  btnSecundarioTexto: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
});
