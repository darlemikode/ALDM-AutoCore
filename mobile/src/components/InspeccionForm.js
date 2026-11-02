import ScrollCampos from "../ui/ScrollCampos";
import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, StyleSheet, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "../ui/IconoWeb";
import { Picker } from "../ui/Picker";
import { api } from "../api";
import { colors, spacing } from "../theme";
import FotoGaleria from "./FotoGaleria";
import { crearEstilos } from "../ui/estilos";
import Auto3D from "./Auto3D";
import VisorFoto from "./VisorFoto";
import { ZONAS, zonasDe, peorEstado } from "../lib/zonas";
import { urlFoto, elegirOrigenFoto, capturarFoto, subirFoto } from "../lib/fotos";
import { alerta } from "../ui/Dialogo";

const ESTADOS = {
  bien: { icono: "checkmark-circle-outline", texto: "Bien", tono: "teal600", fondo: "teal100" },
  regular: { icono: "alert-circle-outline", texto: "Regular", tono: "warn600", fondo: "warn100" },
  mal: { icono: "close-circle-outline", texto: "Mal", tono: "red600", fondo: "red100" },
};

// Ícono por categoría del checklist (las que no estén aquí usan una libreta)
const ICONO_CATEGORIA = {
  "Llantas": "disc-outline", "Frenos": "stop-circle-outline", "Luces": "bulb-outline", "Fluidos": "water-outline",
  "Batería y eléctrico": "battery-charging-outline", "Suspensión y dirección": "build-outline", "Carrocería": "car-sport-outline",
  "Enfriamiento y clima": "snow-outline", "Motor": "cog-outline",
};

/**
 * Checklist de inspección digital, agrupado por categoría — misma lógica
 * que el panel web. Se guarda solo: cada toque se guarda al momento y los
 * comentarios al dejar de escribir (con una breve pausa). El primer cambio
 * crea la inspección; los siguientes la actualizan.
 */
export default function InspeccionForm({ visible, idVehiculo, idServicio, inspeccionExistente, refacciones, onGuardado, onClose, puedeEditar = true }) {
  const [items, setItems] = useState([]);
  const [resultados, setResultados] = useState({});
  const [comentarioGeneral, setComentarioGeneral] = useState("");
  const [idInspeccion, setIdInspeccion] = useState(inspeccionExistente?.id_inspeccion || null);
  const [estadoGuardado, setEstadoGuardado] = useState(""); // "" | guardando | guardado | error
  const [pendiente, setPendiente] = useState(null);
  const [zona, setZona] = useState(null); // zona elegida en el auto 3D
  const [fotosPuntos, setFotosPuntos] = useState({}); // { id_item: [foto] } — fotos de puntos en Regular/Mal
  const [subiendoFoto, setSubiendoFoto] = useState(null);
  const [visor, setVisor] = useState(null); // { fotos: [url], indice }
  const [soloProblemas, setSoloProblemas] = useState(false); // ver solo puntos en Regular/Mal

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
    setZona(null);
    cargarFotosPuntos(inspeccionExistente?.id_inspeccion);
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

  async function cargarFotosPuntos(id) {
    setFotosPuntos({});
    if (!id) return;
    try {
      const lista = await api.get(`/fotos/?entidad_tipo=inspeccion_item&entidad_id=${id}`);
      const por = {};
      (Array.isArray(lista) ? lista : []).forEach((f) => { (por[f.descripcion] = por[f.descripcion] || []).push(f); });
      setFotosPuntos(por);
    } catch { /* sin fotos */ }
  }

  async function agregarFotoPunto(idItem) {
    const origen = await elegirOrigenFoto();
    if (!origen) return;
    const foto = await capturarFoto(origen);
    if (!foto) return;
    setSubiendoFoto(idItem);
    try {
      // La foto necesita una inspección guardada: si todavía no existe, se guarda primero
      if (!idRef.current) {
        clearTimeout(timerRef.current);
        await encolar();
      }
      if (!idRef.current) throw new Error("No se pudo guardar la inspección para adjuntar la foto.");
      const nueva = await subirFoto(api, { entidadTipo: "inspeccion_item", entidadId: idRef.current, descripcion: idItem, foto });
      setFotosPuntos((prev) => ({ ...prev, [idItem]: [...(prev[idItem] || []), nueva] }));
    } catch (err) {
      alerta("No se subió la foto", err.message);
    } finally {
      setSubiendoFoto(null);
    }
  }

  function borrarFotoPunto(idItem, foto) {
    alerta("Eliminar foto", "¿Seguro? No se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        try {
          await api.del(`/fotos/${foto.id_foto}`);
          setFotosPuntos((prev) => ({ ...prev, [idItem]: (prev[idItem] || []).filter((f) => f.id_foto !== foto.id_foto) }));
        } catch (err) { alerta("Error", err.message); }
      } },
    ]);
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
    if (!puedeEditar) return; // solo lectura
    setResultados((prev) => ({ ...prev, [idItem]: { ...prev[idItem], [campo]: valor } }));
    guardarLuego(campo === "comentario" ? 900 : 0);
  }

  function marcarCategoria(cat, estado) {
    if (!puedeEditar) return;
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

  // Puntos del checklist por zona del auto
  const itemsPorZona = {};
  items.forEach((it) => zonasDe(it.categoria, it.nombre_item).forEach((z) => { (itemsPorZona[z] = itemsPorZona[z] || []).push(it); }));
  const estadoZona = (z) => peorEstado((itemsPorZona[z] || []).map((it) => resultados[it.id_item]?.estado || "bien"));
  const itemsZona = zona && itemsPorZona[zona] ? itemsPorZona[zona] : items;
  const itemsVisibles = soloProblemas ? itemsZona.filter((i) => (resultados[i.id_item]?.estado || "bien") !== "bien") : itemsZona;
  function marcarZona(z, estado) {
    if (!puedeEditar) return;
    setResultados((prev) => {
      const siguiente = { ...prev };
      (itemsPorZona[z] || []).forEach((i) => { siguiente[i.id_item] = { ...siguiente[i.id_item], estado }; });
      return siguiente;
    });
    guardarLuego(0);
  }

  const categorias = [...new Set(itemsVisibles.map((i) => i.categoria))];
  const valores = Object.values(resultados);
  const conteo = {
    bien: valores.filter((r) => r.estado === "bien").length,
    regular: valores.filter((r) => r.estado === "regular").length,
    mal: valores.filter((r) => r.estado === "mal").length,
  };

  const textoGuardado = {
    guardando: "Guardando…",
    guardado: "Guardado",
    error: "No se guardó",
  }[estadoGuardado] || (idInspeccion ? "Guardado" : "Se guarda solo");
  const iconoGuardado = estadoGuardado === "guardando" ? "time-outline" : estadoGuardado === "error" ? "alert-circle-outline" : "checkmark-outline";
  const colorGuardado = estadoGuardado === "error" ? colors.red600 : colors.ink500;
  const totalPuntos = Math.max(1, conteo.bien + conteo.regular + conteo.mal);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cerrar}>
      <View style={styles.header}>
        <View style={styles.headerIcono}><Ionicons name="clipboard-outline" size={18} color={colors.petrol600} /></View>
        <Text style={styles.headerTitulo}>Inspección digital</Text>
        <TouchableOpacity onPress={cerrar} disabled={estadoGuardado === "guardando"} style={styles.botonListo}>
          <Text style={styles.cerrar}>{estadoGuardado === "guardando" ? "Guardando…" : "Listo"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.resumen}>
        <View style={styles.contadores}>
          {Object.entries(ESTADOS).map(([k, e]) => (
            <View key={k} style={[styles.chipCont, { backgroundColor: colors[e.fondo] }]}>
              <Ionicons name={e.icono} size={14} color={colors[e.tono]} />
              <Text style={[styles.cont, { color: colors[e.tono] }]}>{conteo[k]} {e.texto}</Text>
            </View>
          ))}
          <View style={styles.guardadoFila}>
            <Ionicons name={iconoGuardado} size={13} color={colorGuardado} />
            <Text style={[styles.guardadoAuto, { color: colorGuardado }]}>{textoGuardado}</Text>
          </View>
        </View>
        <View style={styles.progreso}>
          {Object.entries(ESTADOS).map(([k, e]) => (conteo[k] ? <View key={k} style={{ flex: conteo[k] / totalPuntos, backgroundColor: colors[e.tono] }} /> : null))}
        </View>
      </View>

      <ScrollCampos style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={styles.mapa}>
          <Auto3D altura={250} compacto fps={18} estadoZona={(z) => (itemsPorZona[z] ? estadoZona(z) : "ninguno")} elegida={zona}
            onSelect={(z) => setZona(zona === z ? null : z)} ayuda="Gira el auto · toca una zona para ver solo sus puntos" />
          <View style={styles.leyenda}>
            {Object.entries(ESTADOS).map(([k, e]) => (
              <View key={k} style={styles.leyendaFila}>
                <View style={[styles.leyendaPunto, { backgroundColor: colors[e.tono] }]} />
                <Text style={[styles.leyendaItem, { color: colors[e.tono] }]}>{e.texto}</Text>
              </View>
            ))}
          </View>
          {zona && itemsPorZona[zona] && (
            <View style={styles.zonaBarra}>
              <Text style={styles.zonaNombre} numberOfLines={2}>{ZONAS[zona]}</Text>
              {puedeEditar && (
                <TouchableOpacity style={styles.botonTodoBien} onPress={() => marcarZona(zona, "bien")}>
                  <Ionicons name="checkmark-done-outline" size={14} color={colors.teal600} />
                  <Text style={styles.botonTodoBienTexto}>Todo bien aquí</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.botonTodoBien} onPress={() => setZona(null)}>
                <Ionicons name="apps-outline" size={14} color={colors.ink700} />
                <Text style={styles.botonTodoBienTexto}>Ver todos</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.barraFiltro}>
          <Text style={styles.hint} numberOfLines={2}>Toca el estado de cada punto; se guarda al instante.</Text>
          <TouchableOpacity style={[styles.chipFiltro, soloProblemas && { backgroundColor: colors.petrol500, borderColor: colors.petrol500 }]} onPress={() => setSoloProblemas((v) => !v)} activeOpacity={0.8}>
            <Ionicons name="funnel-outline" size={14} color={soloProblemas ? colors.sobreAcento : colors.ink700} />
            <Text style={[styles.chipFiltroTexto, soloProblemas && { color: colors.sobreAcento }]}>Solo con problemas</Text>
          </TouchableOpacity>
        </View>

        {categorias.length === 0 && (
          <View style={styles.vacio}>
            <Ionicons name="checkmark-done-outline" size={28} color={colors.teal600} />
            <Text style={styles.vacioTexto}>Todo en orden: no hay puntos en Regular ni en Mal.</Text>
          </View>
        )}

        {categorias.map((cat) => {
          const delaCat = itemsVisibles.filter((i) => i.categoria === cat);
          const malos = delaCat.filter((i) => resultados[i.id_item]?.estado === "mal").length;
          const regulares = delaCat.filter((i) => resultados[i.id_item]?.estado === "regular").length;
          return (
            <View key={cat} style={{ marginBottom: spacing.lg }}>
              <View style={styles.categoriaTitulo}>
                <View style={styles.categoriaIconoCaja}><Ionicons name={ICONO_CATEGORIA[cat] || "clipboard-outline"} size={16} color={colors.petrol600} /></View>
                <Text style={styles.categoria} numberOfLines={2}>{cat}</Text>
                {malos > 0 && (
                  <View style={styles.badgeMal}><Text style={styles.badgeMalTexto}>{malos} mal</Text></View>
                )}
                {regulares > 0 && (
                  <View style={styles.badgeReg}><Text style={styles.badgeRegTexto}>{regulares} regular</Text></View>
                )}
                {puedeEditar && (
                <TouchableOpacity style={styles.botonTodoBien} onPress={() => marcarCategoria(cat, "bien")}>
                  <Ionicons name="checkmark-done-outline" size={14} color={colors.teal600} />
                  <Text style={styles.botonTodoBienTexto}>Todo bien</Text>
                </TouchableOpacity>
                )}
              </View>
              {delaCat.map((item) => {
                const r = resultados[item.id_item] || { estado: "bien", comentario: "", id_refaccion_sugerida: null };
                const est = ESTADOS[r.estado] || ESTADOS.bien;
                const conProblema = r.estado !== "bien";
                return (
                  <View key={item.id_item} style={[styles.itemCard, { borderLeftColor: conProblema ? colors[est.tono] : colors.ink300 }, conProblema && { backgroundColor: colors[est.fondo] }]}>
                    <Text style={styles.itemNombre}>{item.nombre_item}</Text>
                    <View style={styles.estadoRow}>
                      {Object.entries(ESTADOS).map(([estado, e]) => {
                        const activo = r.estado === estado;
                        return (
                          <TouchableOpacity
                            key={estado}
                            activeOpacity={0.8}
                            style={[styles.estadoBtn, activo && { backgroundColor: colors[e.fondo], borderColor: colors[e.tono] }]}
                            onPress={() => actualizar(item.id_item, "estado", estado)}
                          >
                            <Ionicons name={e.icono} size={16} color={activo ? colors[e.tono] : colors.ink500} />
                            <Text style={[styles.estadoBtnTexto, activo && { color: colors[e.tono], fontWeight: "800" }]}>{e.texto}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {r.estado !== "bien" && (
                      <View style={{ marginTop: 10 }}>
                        <TextInput placeholderTextColor={colors.ink500}
                          editable={puedeEditar}
                          style={styles.input}
                          placeholder="Comentario (opcional)"
                          value={r.comentario}
                          onChangeText={(v) => actualizar(item.id_item, "comentario", v)}
                        />
                        <View style={styles.fotosFila}>
                          {(fotosPuntos[item.id_item] || []).map((foto, k, lista) => (
                            <View key={foto.id_foto} style={styles.fotoMini}>
                              <TouchableOpacity onPress={() => setVisor({ fotos: lista.map((x) => urlFoto(x.ruta_archivo)), indice: k })}>
                                <Image source={{ uri: urlFoto(foto.ruta_archivo) }} style={styles.fotoImg} />
                              </TouchableOpacity>
                              {puedeEditar && (
                                <TouchableOpacity style={styles.fotoBorrar} onPress={() => borrarFotoPunto(item.id_item, foto)} accessibilityLabel="Eliminar foto">
                                  <Ionicons name="close-outline" size={13} color="#fff" />
                                </TouchableOpacity>
                              )}
                            </View>
                          ))}
                          {puedeEditar && (
                            <TouchableOpacity style={styles.fotoAgregar} onPress={() => agregarFotoPunto(item.id_item)} disabled={subiendoFoto !== null}>
                              {subiendoFoto === item.id_item ? <ActivityIndicator color={colors.petrol500} /> : (
                                <>
                                  <Ionicons name="camera-outline" size={20} color={colors.ink700} />
                                  <Text style={styles.fotoAgregarTexto}>Foto</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                        {r.estado === "mal" && (
                          <View style={[styles.pickerWrap, { marginTop: 8 }]}>
                            <Picker titulo="Sugerir refacción" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500}
                              selectedValue={r.id_refaccion_sugerida || ""}
                              onValueChange={(v) => actualizar(item.id_item, "id_refaccion_sugerida", v || null)}
                            >
                              <Picker.Item label="Sugerir refacción (opcional)" value="" />
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

        <View style={styles.labelFila}>
          <Ionicons name="document-text-outline" size={15} color={colors.ink500} />
          <Text style={styles.label}>Comentario general</Text>
        </View>
        <TextInput placeholderTextColor={colors.ink500}
          editable={puedeEditar}
          style={[styles.input, styles.textarea]}
          value={comentarioGeneral}
          onChangeText={(v) => { setComentarioGeneral(v); guardarLuego(900); }}
          multiline
          placeholder="Observaciones generales de la inspección"
        />

        {idInspeccion && (
          <View style={{ marginTop: spacing.lg }}>
            <FotoGaleria entidadTipo="inspeccion" entidadId={idInspeccion} soloLectura={!puedeEditar} />
          </View>
        )}
      </ScrollCampos>
      {visor && <VisorFoto fotos={visor.fotos} indice={visor.indice} onClose={() => setVisor(null)} />}
    </Modal>
  );
}

const styles = crearEstilos({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.ink300, backgroundColor: colors.paper100 },
  headerIcono: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  headerTitulo: { flex: 1, fontSize: 17, fontWeight: "800", color: colors.ink900 },
  botonListo: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.petrol100 },
  cerrar: { fontSize: 13, color: colors.petrol600, fontWeight: "700" },
  resumen: { backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 10, gap: 8 },
  contadores: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  chipCont: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10 },
  cont: { fontSize: 12, fontWeight: "700" },
  guardadoFila: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" },
  guardadoAuto: { fontSize: 11.5 },
  progreso: { flexDirection: "row", height: 5, borderRadius: 3, overflow: "hidden", gap: 2, backgroundColor: colors.ink300 },
  screen: { flex: 1, backgroundColor: colors.paper0 },
  barraFiltro: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.md },
  hint: { flex: 1, fontSize: 12, color: colors.ink500 },
  chipFiltro: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.ink300, backgroundColor: colors.paper100, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12 },
  chipFiltroTexto: { fontSize: 12, fontWeight: "700", color: colors.ink700 },
  vacio: { alignItems: "center", gap: 8, paddingVertical: 30 },
  vacioTexto: { fontSize: 13, color: colors.ink500, textAlign: "center" },
  categoriaTitulo: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm, flexWrap: "wrap" },
  categoriaIconoCaja: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  categoria: { flexShrink: 1, fontSize: 13, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.3 },
  badgeMal: { backgroundColor: colors.red100, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  badgeMalTexto: { fontSize: 10, fontWeight: "800", color: colors.red600 },
  badgeReg: { backgroundColor: colors.warn100, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  badgeRegTexto: { fontSize: 10, fontWeight: "800", color: colors.warn600 },
  botonTodoBien: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  botonTodoBienTexto: { fontSize: 11.5, fontWeight: "700", color: colors.ink700 },
  itemCard: { backgroundColor: colors.paper100, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: colors.ink300, paddingVertical: 12, paddingHorizontal: 12, marginBottom: spacing.sm },
  itemNombre: { fontSize: 14, fontWeight: "600", color: colors.ink900, marginBottom: 10 },
  estadoRow: { flexDirection: "row", gap: 6 },
  estadoBtn: { flex: 1, flexDirection: "row", gap: 5, backgroundColor: colors.paper0, borderRadius: 8, paddingVertical: 9, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.ink300 },
  estadoBtnTexto: { fontSize: 12, fontWeight: "600", color: colors.ink500 },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 10, fontSize: 13 },
  textarea: { minHeight: 70, textAlignVertical: "top" },
  pickerWrap: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, overflow: "hidden" },
  labelFila: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  label: { fontSize: 11.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.4 },
  mapa: { marginBottom: spacing.lg },
  leyenda: { flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 6 },
  leyendaFila: { flexDirection: "row", alignItems: "center", gap: 6 },
  leyendaPunto: { width: 9, height: 9, borderRadius: 5 },
  leyendaItem: { fontSize: 11.5, fontWeight: "700" },
  zonaBarra: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: spacing.sm },
  zonaNombre: { flex: 1, minWidth: 140, fontSize: 13, fontWeight: "800", color: colors.petrol600 },
  fotosFila: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" },
  fotoMini: { position: "relative" },
  fotoImg: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.paper0 },
  fotoBorrar: { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(20,24,28,0.85)", alignItems: "center", justifyContent: "center" },
  fotoAgregar: { height: 64, minWidth: 84, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.ink300, alignItems: "center", justifyContent: "center", gap: 2 },
  fotoAgregarTexto: { fontSize: 12, fontWeight: "700", color: colors.ink700 },
});
