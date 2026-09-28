// Lista con alta / edición / baja en hoja deslizable (paquetes, módulos,
// tipos de cobro…).
import { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "./estilos";
import HojaFormulario from "./HojaFormulario";
import { alerta } from "./Dialogo";
import { Badge, Fab, Vacio, confirmar, useCargar } from "./comunes";

export default function ListaEditable({
  endpoint, idCampo, etiqueta, icono, campos, grupos, titulo, subtitulo, badge, cargarExtra,
  valoresParaEditar, prepararGuardar, valoresNuevos, encabezado, textoVacio,
  permitirCrear = true, permitirEliminar = true, tituloEditar,
}) {
  const [editando, setEditando] = useState(null);
  const { datos, recargar, refrescando } = useCargar(async () => {
    const [lista, extra] = await Promise.all([api.get(endpoint), cargarExtra ? cargarExtra() : null]);
    return { lista, extra };
  });
  const lista = datos?.lista || [];
  const extra = datos?.extra;

  async function guardar(v) {
    const cuerpo = prepararGuardar ? prepararGuardar(v, editando, extra) : v;
    if (editando[idCampo]) await api.put(`${endpoint}/${editando[idCampo]}`, cuerpo);
    else await api.post(endpoint, cuerpo);
    setEditando(null);
    recargar();
  }

  const eliminar = (item) => confirmar(`Eliminar ${etiqueta}`, `¿Eliminar "${titulo(item)}"?`, "Eliminar", async () => {
    try { await api.del(`${endpoint}/${item[idCampo]}`); recargar(); } catch (err) { alerta("No se pudo eliminar", err.message); }
  });

  return (
    <View style={styles.screen}>
      <FlatList
        data={lista}
        keyExtractor={(x) => String(x[idCampo])}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => recargar(true)} />}
        ListHeaderComponent={encabezado || null}
        ListEmptyComponent={datos ? <Vacio texto={textoVacio || `Sin ${etiqueta}s todavía.`} icono={icono} /> : null}
        renderItem={({ item }) => {
          const b = badge?.(item);
          return (
            <TouchableOpacity style={styles.item} onPress={() => setEditando(item)} activeOpacity={0.8}>
              <View style={styles.icono}><Ionicons name={icono} size={19} color={colors.petrol600} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.titulo}>{titulo(item)}</Text>
                {subtitulo ? <Text style={styles.sub}>{subtitulo(item, extra)}</Text> : null}
                {b ? <View style={{ marginTop: 6 }}><Badge texto={b.texto} tono={b.tono} /></View> : null}
              </View>
              {permitirEliminar ? (
                <TouchableOpacity onPress={() => eliminar(item)} hitSlop={10}><Ionicons name="trash-outline" size={19} color={colors.red600} /></TouchableOpacity>
              ) : <Ionicons name="chevron-forward" size={18} color={colors.ink500} />}
            </TouchableOpacity>
          );
        }}
      />
      {permitirCrear ? <Fab etiqueta={`Nuevo ${etiqueta}`} onPress={() => setEditando(valoresNuevos ? { ...valoresNuevos } : {})} /> : null}
      <HojaFormulario
        visible={!!editando}
        titulo={editando?.[idCampo] ? (tituloEditar || `Editar ${etiqueta}`) : `Nuevo ${etiqueta}`}
        icono={icono}
        campos={typeof campos === "function" ? (v) => campos(v, extra, editando) : campos}
        grupos={grupos}
        valoresIniciales={editando ? (valoresParaEditar ? valoresParaEditar(editando) : editando) : {}}
        onGuardar={guardar}
        onCerrar={() => setEditando(null)}
      />
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paper100, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.ink300 },
  icono: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  titulo: { fontSize: 15, fontWeight: "700", color: colors.ink900 },
  sub: { fontSize: 12.5, color: colors.ink700, marginTop: 2 },
});
