import { contiene } from "../lib/texto";
import BadgeIcono from "./BadgeIcono";
import { colorPorIcono } from "../iconosModulo";
import { useCallback, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, RefreshControl, Modal, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "./estilos";
import HojaFormulario from "./HojaFormulario";
import FotoGaleria from "../components/FotoGaleria";
import { alerta } from "./Dialogo";
import { useActualizacionGlobal } from "../useActualizacionGlobal";

/*
 * Pantalla de lista con alta/edición/baja — patrón común de la app del taller.
 * Props:
 *   endpoint: "/empleados/"      idCampo: "id_empleado"
 *   titulo(item), subtitulo(item), icono, etiqueta ("empleado")
 *   campos: igual que en la web (ver HojaFormulario)   grupos
 *   permisos: { crear, editar, eliminar }  (claves de permiso)
 *   buscarEn(item) -> texto para el buscador
 *   prepararGuardar(valores, editando) -> cuerpo a mandar (opcional)
 *   valoresParaEditar(item) (opcional)   alTocar(item, navigation) (opcional, p. ej. abrir detalle)
 *   badge(item) -> { texto, tono: "petrol"|"teal"|"red"|"warn" } (opcional)
 *   cargarExtra(): Promise — datos auxiliares (p. ej. catálogos del formulario)
 *   fotos: "herramienta" — agrega botón de galería (FotoGaleria con ese entidadTipo)
 *   resumen(lista) -> [{ etiqueta, valor }] tarjetas de totales arriba de la lista (opcional)
 */
export default function ListaCrud(props) {
  const {
    endpoint, idCampo, titulo, subtitulo, icono = "list-outline", etiqueta = "registro", campos, grupos,
    permisos = {}, buscarEn, prepararGuardar, valoresParaEditar, alTocar, badge, cargarExtra, hasPermission,
    navigation, textoVacio, filtrarLista, despuesDeCrear, fotos, resumen, valoresNuevo, derecha,
  } = props;
  const [fotosDe, setFotosDe] = useState(null);
  const [lista, setLista] = useState([]);
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState(null);
  const [refrescando, setRefrescando] = useState(false);

  const puede = (p) => !p || hasPermission(p);

  async function load() {
    const data = await api.get(endpoint);
    setLista(Array.isArray(data) ? data : []);
  }

  useFocusEffect(
    useCallback(() => {
      load().catch((err) => alerta("Error", err.message));
      cargarExtra?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [endpoint])
  );

  // Si alguien más (web, otro celular) cambia esto mismo mientras esta
  // pantalla está abierta, se refresca sola.
  const tabla = endpoint.replace(/^\/|\/$/g, "").split("/")[0];
  useActualizacionGlobal(tabla, () => load().catch(() => {}));

  const base = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;

  async function guardar(valores) {
    const cuerpo = prepararGuardar ? prepararGuardar(valores, editando) : valores;
    const eraNuevo = !editando?.[idCampo];
    const guardado = eraNuevo ? await api.post(endpoint, cuerpo) : await api.put(`${base}${editando[idCampo]}`, cuerpo);
    setEditando(null);
    await load();
    if (eraNuevo && despuesDeCrear && guardado) despuesDeCrear(guardado, navigation);
  }

  function eliminar(item) {
    alerta(`Eliminar ${etiqueta}`, `¿Eliminar "${titulo(item)}"? No se puede deshacer.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        try { await api.del(`${base}${item[idCampo]}`); load(); } catch (err) { alerta("Error", err.message); }
      } },
    ]);
  }

  let visibles = filtrarLista ? filtrarLista(lista) : lista;
  if (q.trim()) {
    visibles = visibles.filter((it) => contiene(buscarEn ? buscarEn(it) : JSON.stringify(it), q));
  }
  const tonos = {
    petrol: [colors.petrol100, colors.petrol600], teal: [colors.teal100, colors.teal600],
    red: [colors.red100, colors.red600], warn: [colors.warn100, colors.warn600], gris: [colors.paper0, colors.ink500],
  };

  return (
    <View style={styles.screen}>
      <View style={styles.cabecera}>
        <View style={styles.buscador}>
          <Ionicons name="search" size={18} color={colors.ink500} />
          <TextInput style={styles.buscadorInput} placeholder={`Buscar ${etiqueta}…`} placeholderTextColor={colors.ink500} value={q} onChangeText={setQ} />
          {q ? <TouchableOpacity onPress={() => setQ("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.ink500} /></TouchableOpacity> : null}
        </View>
        <Text style={styles.contador}>{visibles.length} {visibles.length === 1 ? etiqueta : `${etiqueta}s`}</Text>
        {resumen ? (
          <View style={styles.resumen}>
            {resumen(visibles).map((r) => (
              <View key={r.etiqueta} style={styles.resumenItem}>
                <Text style={styles.resumenValor} numberOfLines={1}>{r.valor}</Text>
                <Text style={styles.resumenEtiqueta}>{r.etiqueta}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(item) => String(item[idCampo])}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await load().catch(() => {}); setRefrescando(false); }} tintColor={colors.petrol500} colors={[colors.petrol500]} />}
        renderItem={({ item }) => {
          const b = badge?.(item);
          const tocar = alTocar ? () => alTocar(item, navigation) : puede(permisos.editar) ? () => setEditando(item) : null;
          return (
            <TouchableOpacity style={styles.tarjeta} onPress={tocar} disabled={!tocar} activeOpacity={0.75}>
              {colorPorIcono(icono) ? <BadgeIcono icono={icono} color={colorPorIcono(icono)} size={40} /> : <View style={styles.avatar}><Ionicons name={icono} size={19} color={colors.petrol600} /></View>}
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre}>{titulo(item)}</Text>
                {subtitulo ? <Text style={styles.meta} numberOfLines={2}>{subtitulo(item) || "—"}</Text> : null}
                {b ? <View style={[styles.badge, { backgroundColor: tonos[b.tono || "petrol"][0] }]}><Text style={[styles.badgeTexto, { color: tonos[b.tono || "petrol"][1] }]}>{b.texto}</Text></View> : null}
              </View>
              <View style={styles.acciones}>
                {derecha ? derecha(item, load) : null}
                {fotos ? (
                  <TouchableOpacity onPress={() => setFotosDe(item)} hitSlop={8} accessibilityLabel="Fotos"><Ionicons name="images-outline" size={20} color={colors.petrol600} /></TouchableOpacity>
                ) : null}
                {alTocar && puede(permisos.editar) && (
                  <TouchableOpacity onPress={() => setEditando(item)} hitSlop={8}><Ionicons name="create-outline" size={20} color={colors.ink700} /></TouchableOpacity>
                )}
                {puede(permisos.eliminar) && permisos.eliminar !== false && (
                  <TouchableOpacity onPress={() => eliminar(item)} hitSlop={8}><Ionicons name="trash-outline" size={20} color={colors.red600} /></TouchableOpacity>
                )}
                {alTocar && <Ionicons name="chevron-forward" size={18} color={colors.ink500} />}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Ionicons name={icono} size={36} color={colors.ink500} />
            <Text style={styles.vacioTexto}>{q ? "Sin resultados." : textoVacio || `Aún no hay ${etiqueta}s. Toca + para agregar.`}</Text>
          </View>
        }
      />

      {puede(permisos.crear) && permisos.crear !== false && (
        <TouchableOpacity style={styles.fab} onPress={() => setEditando({})} accessibilityLabel={`Nuevo ${etiqueta}`}>
          <Ionicons name="add" size={28} color={colors.paper100} />
        </TouchableOpacity>
      )}

      <Modal visible={!!fotosDe} animationType="slide" transparent onRequestClose={() => setFotosDe(null)}>
        <View style={styles.velo}>
          <View style={styles.hojaFotos}>
            <View style={styles.hojaCabecera}>
              <Text style={styles.hojaTitulo} numberOfLines={1}>Fotos · {fotosDe ? titulo(fotosDe) : ""}</Text>
              <TouchableOpacity onPress={() => setFotosDe(null)} hitSlop={10}><Ionicons name="close" size={24} color={colors.ink700} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              {fotosDe ? <FotoGaleria entidadTipo={fotos} entidadId={fotosDe[idCampo]} /> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <HojaFormulario
        visible={!!editando}
        titulo={editando?.[idCampo] ? `Editar ${etiqueta}` : `Nuevo ${etiqueta}`}
        icono={icono}
        campos={campos}
        grupos={grupos}
        valoresIniciales={editando?.[idCampo] ? (valoresParaEditar ? valoresParaEditar(editando) : editando) : (valoresNuevo || {})}
        onGuardar={guardar}
        onCerrar={() => setEditando(null)}
      />
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cabecera: { paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 8, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper0, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  buscadorInput: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  contador: { fontSize: 12, color: colors.ink700, marginTop: 6 },
  tarjeta: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  nombre: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  badge: { alignSelf: "flex-start", borderRadius: 100, paddingVertical: 2, paddingHorizontal: 9, marginTop: 6 },
  badgeTexto: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  acciones: { flexDirection: "row", alignItems: "center", gap: 14 },
  resumen: { flexDirection: "row", gap: 8, marginTop: 8 },
  resumenItem: { flex: 1, backgroundColor: colors.paper0, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  resumenValor: { fontFamily: "BarlowCondensed_700Bold", fontSize: 20, color: colors.ink900 },
  resumenEtiqueta: { fontSize: 11, color: colors.ink500 },
  velo: { flex: 1, backgroundColor: colors.velo, justifyContent: "flex-end" },
  hojaFotos: { maxHeight: "85%", backgroundColor: colors.paper100, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  hojaCabecera: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  hojaTitulo: { flex: 1, fontSize: 17, fontWeight: "700", color: colors.ink900 },
  vacio: { alignItems: "center", gap: 8, paddingTop: 60 },
  vacioTexto: { fontSize: 14, color: colors.ink500, textAlign: "center", paddingHorizontal: 20 },
  fab: {
    position: "absolute", right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.petrol500,
    alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
});
