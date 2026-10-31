import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, Image, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { api } from "../api";
import { colors, spacing } from "../theme";
import Auto3D from "./Auto3D";
import VisorFoto from "./VisorFoto";
import { PIEZAS3D, PUNTOS3D } from "../lib/autoGeometria";
import { ZONAS } from "../lib/zonas";
import { urlFoto, elegirOrigenFoto, capturarFoto, subirFoto } from "../lib/fotos";
import { alerta } from "../ui/Dialogo";
import { crearEstilos } from "../ui/estilos";

const TIPOS = [
  ["rayon", "Rayón"], ["golpe", "Golpe"], ["abolladura", "Abolladura"], ["pintura", "Pintura dañada"],
  ["cristal", "Cristal roto"], ["faltante", "Faltante"], ["otro", "Otro"],
];
const GRAVEDADES = [["leve", "Leve"], ["medio", "Medio"], ["severo", "Severo"]];
const NOMBRE_TIPO = Object.fromEntries(TIPOS);
const ORDEN_GRAVEDAD = { leve: 1, medio: 2, severo: 3 };
const ESTADOS_AVANCE = [["", "Sin iniciar"], ["proceso", "En proceso"], ["listo", "Listo"]];
const COLOR_GRAVEDAD = { leve: colors.teal600, medio: colors.warn600, severo: colors.red600 };

/**
 * Recepción del vehículo (daños previos marcados en el auto 3D) y avance por zonas de la orden.
 * Pestaña 1: toca una pieza → registra el daño con tipo, gravedad, comentario y fotos.
 * Pestaña 2: marca qué zonas ya se atendieron; el cliente lo ve iluminado en su seguimiento.
 */
export default function RecepcionAutoModal({ visible, idServicio, puedeEditar = true, onClose }) {
  const [pestana, setPestana] = useState("recepcion");
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [pieza, setPieza] = useState(null);
  const [zona, setZona] = useState(null);
  const [form, setForm] = useState({ tipo: "golpe", gravedad: "leve", comentario: "" });
  const [fotosNuevas, setFotosNuevas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [subiendoDano, setSubiendoDano] = useState(null);
  const [visor, setVisor] = useState(null);

  async function cargar() {
    try {
      setDatos(await api.get(`/recepcion/${idServicio}`));
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo cargar la recepción.");
    }
  }
  useEffect(() => {
    if (!visible) return;
    setPestana("recepcion"); setPieza(null); setZona(null); setFotosNuevas([]); setDatos(null);
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, idServicio]);

  const danos = datos?.danos || [];
  const avance = datos?.avance_zonas || {};

  const danosPorPieza = useMemo(() => {
    const m = {};
    danos.forEach((d) => { (m[d.pieza] = m[d.pieza] || []).push(d); });
    return m;
  }, [danos]);
  const estadoPieza = (k) => {
    const lista = danosPorPieza[k];
    if (!lista) return "ninguno";
    return Math.max(...lista.map((d) => ORDEN_GRAVEDAD[d.gravedad] || 1)) >= 3 ? "mal" : "regular";
  };

  async function agregarFotoNueva() {
    const origen = await elegirOrigenFoto();
    if (!origen) return;
    const foto = await capturarFoto(origen);
    if (foto) setFotosNuevas((prev) => [...prev, foto].slice(0, 6));
  }

  async function guardarDano() {
    if (!pieza) return;
    setGuardando(true);
    try {
      const d = await api.post(`/recepcion/${idServicio}/danos`, { pieza, tipo: form.tipo, gravedad: form.gravedad, comentario: form.comentario.trim() || null });
      for (const f of fotosNuevas) {
        try { await subirFoto(api, { entidadTipo: "dano_recepcion", entidadId: d.id_dano, foto: f }); } catch (e) { alerta("Una foto no se subió", e.message); }
      }
      setFotosNuevas([]);
      setForm((f) => ({ ...f, comentario: "" }));
      await cargar();
    } catch (e) {
      alerta("Error", e.message);
    } finally {
      setGuardando(false);
    }
  }

  function borrarDano(d) {
    alerta("Eliminar daño", "Se borrará el daño y sus fotos. No se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => { try { await api.del(`/recepcion/danos/${d.id_dano}`); await cargar(); } catch (e) { alerta("Error", e.message); } } },
    ]);
  }

  async function agregarFotoADano(d) {
    const origen = await elegirOrigenFoto();
    if (!origen) return;
    const foto = await capturarFoto(origen);
    if (!foto) return;
    setSubiendoDano(d.id_dano);
    try {
      await subirFoto(api, { entidadTipo: "dano_recepcion", entidadId: d.id_dano, foto });
      await cargar();
    } catch (e) {
      alerta("No se subió la foto", e.message);
    } finally {
      setSubiendoDano(null);
    }
  }

  function borrarFoto(f) {
    alerta("Eliminar foto", "¿Seguro? No se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => { try { await api.del(`/fotos/${f.id_foto}`); await cargar(); } catch (e) { alerta("Error", e.message); } } },
    ]);
  }

  async function marcarZona(z, estado) {
    const siguiente = { ...avance };
    if (estado) siguiente[z] = estado; else delete siguiente[z];
    setDatos((d) => ({ ...d, avance_zonas: siguiente }));
    try {
      await api.put(`/recepcion/${idServicio}/avance`, { zonas: siguiente });
    } catch (e) {
      alerta("Error", e.message);
      cargar();
    }
  }
  const estadoZonaAv = (k) => (avance[k] === "listo" ? "bien" : avance[k] === "proceso" ? "regular" : "ninguno");
  const listos = Object.values(avance).filter((e) => e === "listo").length;
  const enProceso = Object.values(avance).filter((e) => e === "proceso").length;
  const luz = { progreso: datos?.progreso_auto ?? 0, zonas: avance };
  const listaPieza = pieza ? danosPorPieza[pieza] || [] : [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.header}>
        <Text style={s.headerTitulo}>Recepción y avance</Text>
        <TouchableOpacity onPress={onClose}><Text style={s.cerrar}>Listo</Text></TouchableOpacity>
      </View>
      <View style={s.tabs}>
        {[["recepcion", `Recepción (${danos.length})`], ["avance", `Avance (${listos + enProceso})`]].map(([k, n]) => (
          <TouchableOpacity key={k} style={[s.tab, pestana === k && s.tabActivo]} onPress={() => setPestana(k)}>
            <Text style={[s.tabTexto, pestana === k && s.tabTextoActivo]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={s.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {error ? <Text style={s.error}>{error}</Text> : null}
          {!datos && !error && <ActivityIndicator color={colors.petrol500} style={{ marginVertical: 30 }} />}

          {datos && pestana === "recepcion" && (
            <>
              <Text style={s.hint}>Marca los daños con los que llega el auto: toca una pieza. El cliente lo verá en su seguimiento.</Text>
              <Auto3D puntos={PIEZAS3D} compacto altura={260} fps={18} estadoZona={estadoPieza} elegida={pieza}
                onSelect={(k) => setPieza(pieza === k ? null : k)} ayuda="Gira el auto · toca una pieza para registrar un daño" />
              <View style={s.leyenda}>
                <Text style={[s.leyendaItem, { color: "#5b6b85" }]}>● Sin daño</Text>
                <Text style={[s.leyendaItem, { color: colors.warn600 }]}>● Leve / medio</Text>
                <Text style={[s.leyendaItem, { color: colors.red600 }]}>● Severo</Text>
              </View>

              {!pieza ? (
                <View style={{ marginTop: spacing.md }}>
                  <Text style={s.subtitulo}>Daños registrados ({danos.length})</Text>
                  {danos.length === 0 ? (
                    <Text style={s.vacio}>Sin daños registrados. Si el auto llega en buen estado no hace falta marcar nada.</Text>
                  ) : danos.map((d) => (
                    <TouchableOpacity key={d.id_dano} style={[s.fila, { borderLeftColor: COLOR_GRAVEDAD[d.gravedad] }]} onPress={() => setPieza(d.pieza)}>
                      <Text style={s.filaTitulo}>{d.pieza_nombre}</Text>
                      <Text style={s.filaSub}>{NOMBRE_TIPO[d.tipo] || d.tipo} · {d.gravedad}{d.fotos.length ? ` · ${d.fotos.length} foto${d.fotos.length !== 1 ? "s" : ""}` : ""}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={{ marginTop: spacing.md }}>
                  <View style={s.barra}>
                    <Text style={[s.subtitulo, { flex: 1 }]}>{PIEZAS3D[pieza].nombre}</Text>
                    <TouchableOpacity style={s.botonChico} onPress={() => setPieza(null)}><Text style={s.botonChicoTexto}>Ver todos</Text></TouchableOpacity>
                  </View>

                  {listaPieza.map((d) => (
                    <View key={d.id_dano} style={[s.dano, { borderColor: COLOR_GRAVEDAD[d.gravedad] }]}>
                      <View style={s.barra}>
                        <Text style={s.filaTitulo}>{NOMBRE_TIPO[d.tipo] || d.tipo}</Text>
                        <Text style={[s.chip, { color: COLOR_GRAVEDAD[d.gravedad], borderColor: COLOR_GRAVEDAD[d.gravedad] }]}>{d.gravedad}</Text>
                        <View style={{ flex: 1 }} />
                        {puedeEditar && <TouchableOpacity onPress={() => borrarDano(d)} accessibilityLabel="Eliminar daño"><Text style={s.borrar}>Eliminar</Text></TouchableOpacity>}
                      </View>
                      {d.comentario ? <Text style={s.comentario}>{d.comentario}</Text> : null}
                      <View style={s.fotosFila}>
                        {d.fotos.map((f, k) => (
                          <View key={f.id_foto} style={{ position: "relative" }}>
                            <TouchableOpacity onPress={() => setVisor({ fotos: d.fotos.map((x) => urlFoto(x.url)), indice: k })}>
                              <Image source={{ uri: urlFoto(f.url) }} style={s.foto} />
                            </TouchableOpacity>
                            {puedeEditar && <TouchableOpacity style={s.fotoX} onPress={() => borrarFoto(f)} accessibilityLabel="Eliminar foto"><Text style={s.fotoXTexto}>✕</Text></TouchableOpacity>}
                          </View>
                        ))}
                        {puedeEditar && (
                          <TouchableOpacity style={s.fotoMas} onPress={() => agregarFotoADano(d)} disabled={subiendoDano !== null}>
                            {subiendoDano === d.id_dano ? <ActivityIndicator color={colors.petrol500} /> : <Text style={s.fotoMasTexto}>📷 Foto</Text>}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}

                  {puedeEditar && (
                    <View style={s.form}>
                      <Text style={s.label}>Registrar daño en esta pieza</Text>
                      <Text style={s.etiqueta}>Tipo de daño</Text>
                      <View style={s.chips}>
                        {TIPOS.map(([k, n]) => (
                          <TouchableOpacity key={k} style={[s.chipBtn, form.tipo === k && s.chipBtnActivo]} onPress={() => setForm({ ...form, tipo: k })}>
                            <Text style={[s.chipBtnTexto, form.tipo === k && s.chipBtnTextoActivo]}>{n}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={s.etiqueta}>Gravedad</Text>
                      <View style={s.segmento}>
                        {GRAVEDADES.map(([k, n]) => (
                          <TouchableOpacity key={k} style={[s.seg, form.gravedad === k && { backgroundColor: COLOR_GRAVEDAD[k], borderColor: COLOR_GRAVEDAD[k] }]} onPress={() => setForm({ ...form, gravedad: k })}>
                            <Text style={[s.segTexto, form.gravedad === k && { color: "#fff" }]}>{n}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={s.etiqueta}>Comentario (opcional)</Text>
                      <TextInput style={s.input} placeholderTextColor={colors.ink500} value={form.comentario} maxLength={255}
                        placeholder="Ej. Rayón largo en la parte baja" onChangeText={(v) => setForm({ ...form, comentario: v })} />
                      <Text style={s.etiqueta}>Fotos</Text>
                      <View style={s.fotosFila}>
                        {fotosNuevas.map((f, i) => (
                          <View key={i} style={{ position: "relative" }}>
                            <Image source={{ uri: f.uri }} style={s.foto} />
                            <TouchableOpacity style={s.fotoX} onPress={() => setFotosNuevas(fotosNuevas.filter((_, j) => j !== i))} accessibilityLabel="Quitar foto"><Text style={s.fotoXTexto}>✕</Text></TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity style={s.fotoMas} onPress={agregarFotoNueva}><Text style={s.fotoMasTexto}>📷 Foto</Text></TouchableOpacity>
                      </View>
                      <TouchableOpacity style={[s.guardar, guardando && { opacity: 0.6 }]} onPress={guardarDano} disabled={guardando}>
                        <Text style={s.guardarTexto}>{guardando ? "Guardando…" : "Guardar daño"}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {datos && pestana === "avance" && (
            <>
              <Text style={s.hint}>El auto se ilumina solo según la etapa de la orden ({Math.round((datos.progreso_auto || 0) * 100)}%). Marca además las zonas que ya trabajaste.</Text>
              <Auto3D puntos={PUNTOS3D} compacto altura={260} fps={18} avance={luz} estadoZona={estadoZonaAv} elegida={zona}
                onSelect={(k) => setZona(zona === k ? null : k)} ayuda="Así lo verá el cliente · toca una zona para marcarla" />
              <View style={s.leyenda}>
                <Text style={[s.leyendaItem, { color: "#46e1be" }]}>● Avance por etapa</Text>
                <Text style={[s.leyendaItem, { color: colors.warn600 }]}>● En proceso</Text>
                <Text style={[s.leyendaItem, { color: colors.teal600 }]}>● Listo</Text>
              </View>
              <View style={{ marginTop: spacing.md }}>
                {Object.entries(ZONAS).map(([k, nombre]) => (
                  <View key={k} style={[s.zonaFila, zona === k && s.zonaFilaElegida]}>
                    <TouchableOpacity onPress={() => setZona(zona === k ? null : k)}><Text style={s.filaTitulo}>{nombre}</Text></TouchableOpacity>
                    <View style={[s.segmento, { marginTop: 6 }]}>
                      {ESTADOS_AVANCE.map(([e, n]) => {
                        const activo = (avance[k] || "") === e;
                        const fondo = e === "listo" ? "#1f9d6a" : e === "proceso" ? "#d98a00" : colors.ink500;
                        return (
                          <TouchableOpacity key={e || "ninguno"} disabled={!puedeEditar} style={[s.seg, activo && { backgroundColor: fondo, borderColor: fondo }]} onPress={() => marcarZona(k, e)}>
                            <Text style={[s.segTexto, activo && { color: "#fff" }]}>{n}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {visor && <VisorFoto fotos={visor.fotos} indice={visor.indice} onClose={() => setVisor(null)} />}
    </Modal>
  );
}

const s = crearEstilos({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.ink300, backgroundColor: colors.paper100 },
  headerTitulo: { fontSize: 16, fontWeight: "800", color: colors.ink900, textTransform: "uppercase" },
  cerrar: { fontSize: 13, color: colors.petrol600, fontWeight: "700" },
  tabs: { flexDirection: "row", backgroundColor: colors.paper100, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.ink300, alignItems: "center", backgroundColor: colors.paper0 },
  tabActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  tabTexto: { fontSize: 13, fontWeight: "700", color: colors.ink700 },
  tabTextoActivo: { color: "#fff" },
  screen: { flex: 1, backgroundColor: colors.paper0 },
  hint: { fontSize: 12, color: colors.ink500, marginBottom: spacing.md },
  error: { color: colors.red600, marginBottom: spacing.md },
  leyenda: { flexDirection: "row", justifyContent: "center", gap: 14, marginTop: 4, flexWrap: "wrap" },
  leyendaItem: { fontSize: 11, fontWeight: "700" },
  subtitulo: { fontSize: 14, fontWeight: "800", color: colors.ink900, marginBottom: spacing.sm },
  vacio: { fontSize: 13, color: colors.ink500, lineHeight: 19 },
  fila: { backgroundColor: colors.paper100, borderRadius: 10, padding: spacing.md, marginBottom: 8, borderLeftWidth: 4 },
  filaTitulo: { fontSize: 13, fontWeight: "700", color: colors.ink900 },
  filaSub: { fontSize: 12, color: colors.ink500, marginTop: 2, textTransform: "capitalize" },
  barra: { flexDirection: "row", alignItems: "center", gap: 8 },
  botonChico: { borderWidth: 1, borderColor: colors.ink300, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
  botonChicoTexto: { fontSize: 12, fontWeight: "700", color: colors.ink700 },
  dano: { backgroundColor: colors.paper100, borderRadius: 12, borderWidth: 1.5, padding: spacing.md, marginBottom: 10 },
  chip: { fontSize: 11, fontWeight: "800", borderWidth: 1.5, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 1, textTransform: "capitalize" },
  borrar: { fontSize: 12, fontWeight: "700", color: colors.red600 },
  comentario: { fontSize: 13, color: colors.ink700, marginTop: 6 },
  fotosFila: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" },
  foto: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.paper0 },
  fotoX: { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(20,24,28,0.85)", alignItems: "center", justifyContent: "center" },
  fotoXTexto: { color: "#fff", fontSize: 11, fontWeight: "800" },
  fotoMas: { height: 64, minWidth: 84, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.ink300, alignItems: "center", justifyContent: "center" },
  fotoMasTexto: { fontSize: 12, fontWeight: "700", color: colors.ink700 },
  form: { borderTopWidth: 1, borderTopColor: colors.ink300, marginTop: spacing.md, paddingTop: spacing.md },
  label: { fontSize: 12, fontWeight: "800", color: colors.petrol600, textTransform: "uppercase", marginBottom: 6 },
  etiqueta: { fontSize: 11, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 10, marginBottom: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chipBtn: { borderWidth: 1.5, borderColor: colors.ink300, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.paper100 },
  chipBtnActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  chipBtnTexto: { fontSize: 12, fontWeight: "700", color: colors.ink700 },
  chipBtnTextoActivo: { color: "#fff" },
  segmento: { flexDirection: "row", gap: 6 },
  seg: { flex: 1, borderWidth: 1.5, borderColor: colors.ink300, borderRadius: 10, paddingVertical: 8, alignItems: "center", backgroundColor: colors.paper100 },
  segTexto: { fontSize: 12, fontWeight: "700", color: colors.ink700 },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 10, fontSize: 13, color: colors.ink900 },
  guardar: { marginTop: spacing.lg, backgroundColor: colors.petrol500, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  guardarTexto: { color: "#fff", fontWeight: "800", fontSize: 14 },
  zonaFila: { backgroundColor: colors.paper100, borderRadius: 10, padding: spacing.md, marginBottom: 8, borderWidth: 1.5, borderColor: "transparent" },
  zonaFilaElegida: { borderColor: colors.petrol500 },
});
