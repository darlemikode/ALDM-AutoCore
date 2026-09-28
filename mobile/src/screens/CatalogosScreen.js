import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import HojaFormulario from "../ui/HojaFormulario";
import { alerta } from "../ui/Dialogo";

/*
 * Catálogos — misma configuración que web-admin/src/pages/Catalogos.jsx
 * (endpoint, llave, campos y catálogos de los que depende cada uno).
 * Los catálogos "hijos" (modelos, ciudades) se filtran por su padre.
 */
const CATALOGOS = {
  marcasVehiculo: {
    etiqueta: "Marcas", icono: "car-outline", endpoint: "/vehiculos-marcas/", id: "id_marca_vehiculo", nombre: "nombre_marca", nota: "comentarios",
    campos: () => [{ name: "nombre_marca", label: "Nombre", required: true }, { name: "comentarios", label: "Comentarios", type: "textarea" }],
  },
  modelosVehiculo: {
    etiqueta: "Modelos", icono: "car-sport-outline", endpoint: "/vehiculos-modelos/", id: "id_modelo_vehiculo", nombre: "nombre_modelo", nota: "comentario",
    padre: { clave: "marcasVehiculo", campo: "id_marca_vehiculo", etiqueta: "Marca" },
    campos: (d) => [
      { name: "nombre_modelo", label: "Nombre", required: true },
      { name: "id_marca_vehiculo", label: "Marca", type: "select", required: true, options: d.marcasVehiculo.map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca })) },
      { name: "comentario", label: "Comentario", type: "textarea" },
    ],
  },
  colores: {
    etiqueta: "Colores", icono: "color-palette-outline", endpoint: "/colores-vehiculos/", id: "id_color", nombre: "nombre_color",
    campos: () => [{ name: "nombre_color", label: "Nombre", required: true }],
  },
  tipos: {
    etiqueta: "Tipos de servicio", icono: "construct-outline", endpoint: "/tipos-servicio/", id: "id_tipo_servicio", nombre: "nombre_tipo",
    campos: () => [{ name: "nombre_tipo", label: "Nombre", required: true }],
  },
  marcasRefaccion: {
    etiqueta: "Marcas de refacción", icono: "pricetags-outline", endpoint: "/refacciones-marcas/", id: "id_marca_refaccion", nombre: "nombre_marca", nota: "comentarios",
    campos: () => [{ name: "nombre_marca", label: "Nombre", required: true }, { name: "comentarios", label: "Comentarios", type: "textarea" }],
  },
  categoriasRefaccion: {
    etiqueta: "Categorías", icono: "albums-outline", endpoint: "/refacciones-categorias/", id: "id_categoria_refaccion", nombre: "nombre_categoria",
    campos: () => [{ name: "nombre_categoria", label: "Nombre", required: true }],
  },

  marcasHerramienta: {
    etiqueta: "Marcas de herramienta", icono: "hammer-outline", endpoint: "/herramientas-marcas/", id: "id_herramienta_marca", nombre: "nombre_marca", nota: "comentario",
    campos: () => [{ name: "nombre_marca", label: "Nombre", required: true }, { name: "comentario", label: "Comentario", type: "textarea" }],
  },
  paises: {
    etiqueta: "Países", icono: "globe-outline", endpoint: "/paises/", id: "id_pais", nombre: "nombre_pais",
    campos: () => [{ name: "nombre_pais", label: "Nombre", required: true }],
  },
  estados: {
    etiqueta: "Estados", icono: "map-outline", endpoint: "/estados/", id: "id_estado", nombre: "nombre_estado",
    padre: { clave: "paises", campo: "id_pais", etiqueta: "País" },
    campos: (d) => [
      { name: "nombre_estado", label: "Nombre", required: true },
      { name: "id_pais", label: "País", type: "select", required: true, options: d.paises.map((p) => ({ value: p.id_pais, label: p.nombre_pais })) },
    ],
  },
  ciudades: {
    etiqueta: "Ciudades", icono: "business-outline", endpoint: "/ciudades/", id: "id_ciudad", nombre: "nombre_ciudad",
    padre: { clave: "estados", campo: "id_estado", etiqueta: "Estado" },
    campos: (d) => [
      { name: "nombre_ciudad", label: "Nombre", required: true },
      { name: "id_estado", label: "Estado", type: "select", required: true, options: d.estados.map((e) => ({ value: e.id_estado, label: e.nombre_estado })) },
    ],
  },
};
// Como en la web: las subcategorías ya no son un catálogo aparte; en su lugar
// se entra directo al catálogo de refacciones (acceso "irRefacciones").
const ACCESO_REFACCIONES = "irRefacciones";
const ORDEN_TABS = ["marcasVehiculo", "modelosVehiculo", "colores", "tipos", "categoriasRefaccion", ACCESO_REFACCIONES, "marcasRefaccion", "marcasHerramienta", "paises", "estados", "ciudades"];
const ORDEN = ORDEN_TABS.filter((k) => k !== ACCESO_REFACCIONES);

export default function CatalogosScreen({ navigation }) {
  const { hasPermission } = useAuth();
  const [clave, setClave] = useState("marcasVehiculo");
  const [datos, setDatos] = useState(Object.fromEntries(ORDEN.map((k) => [k, []])));
  const [q, setQ] = useState("");
  const [filtroPadre, setFiltroPadre] = useState("");
  const [editando, setEditando] = useState(null);
  const cfg = CATALOGOS[clave];

  async function cargar(k) {
    try {
      const lista = await api.get(CATALOGOS[k].endpoint);
      setDatos((d) => ({ ...d, [k]: Array.isArray(lista) ? lista : [] }));
    } catch {
      setDatos((d) => ({ ...d, [k]: [] }));
    }
  }

  useFocusEffect(useCallback(() => { ORDEN.forEach(cargar); }, []));
  useEffect(() => { setQ(""); setFiltroPadre(""); }, [clave]);

  async function guardar(v) {
    const cuerpo = { ...v };
    if (cfg.padre) cuerpo[cfg.padre.campo] = Number(cuerpo[cfg.padre.campo]);
    delete cuerpo.idFila;
    if (editando?.[cfg.id]) await api.put(`${cfg.endpoint}${editando[cfg.id]}`, cuerpo);
    else await api.post(cfg.endpoint, cuerpo);
    setEditando(null);
    await cargar(clave);
  }

  function eliminar(item) {
    alerta("Eliminar", `¿Eliminar "${item[cfg.nombre]}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        try { await api.del(`${cfg.endpoint}${item[cfg.id]}`); cargar(clave); } catch (err) { alerta("No se pudo eliminar", err.message); }
      } },
    ]);
  }

  const padreCfg = cfg.padre ? CATALOGOS[cfg.padre.clave] : null;
  const opcionesPadre = padreCfg ? datos[cfg.padre.clave] : [];
  let lista = datos[clave] || [];
  if (cfg.padre && filtroPadre) lista = lista.filter((x) => String(x[cfg.padre.campo]) === String(filtroPadre));
  if (q.trim()) lista = lista.filter((x) => String(x[cfg.nombre] || "").toLowerCase().includes(q.toLowerCase()));
  lista = [...lista].sort((a, b) => String(a[cfg.nombre]).localeCompare(String(b[cfg.nombre])));
  const nombrePadre = (x) => padreCfg && opcionesPadre.find((p) => String(p[padreCfg.id]) === String(x[cfg.padre.campo]))?.[padreCfg.nombre];
  const puedeCrear = hasPermission("catalogos.crear");
  const puedeEditar = hasPermission("catalogos.editar");
  const puedeEliminar = hasPermission("catalogos.eliminar");

  return (
    <View style={styles.screen}>
      <View style={styles.cabecera}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {ORDEN_TABS.map((k) => k === ACCESO_REFACCIONES ? (
            <TouchableOpacity key={k} style={[styles.tab, styles.tabAcceso]} onPress={() => navigation.navigate("Taller", { screen: "Refacciones", params: { screen: "RefaccionesLista" } })}>
              <Ionicons name="cube-outline" size={15} color={colors.petrol600} />
              <Text style={[styles.tabTexto, { color: colors.petrol600 }]}>Catálogo de refacciones</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.petrol600} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity key={k} style={[styles.tab, clave === k && styles.tabActiva]} onPress={() => setClave(k)}>
              <Ionicons name={CATALOGOS[k].icono} size={15} color={clave === k ? colors.paper100 : colors.ink700} />
              <Text style={[styles.tabTexto, clave === k && styles.tabTextoActiva]}>{CATALOGOS[k].etiqueta}</Text>
              <Text style={[styles.tabConteo, clave === k && styles.tabTextoActiva]}>{datos[k]?.length || 0}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.buscador}>
          <Ionicons name="search" size={18} color={colors.ink500} />
          <TextInput style={styles.buscadorInput} placeholder={`Buscar en ${cfg.etiqueta.toLowerCase()}…`} placeholderTextColor={colors.ink500} value={q} onChangeText={setQ} />
        </View>
        {cfg.padre && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
            {[{ id: "", nombre: `Todas (${cfg.padre.etiqueta.toLowerCase()})` }, ...opcionesPadre.map((p) => ({ id: p[padreCfg.id], nombre: p[padreCfg.nombre] }))].map((p) => (
              <TouchableOpacity key={String(p.id)} style={[styles.filtro, String(filtroPadre) === String(p.id) && styles.filtroActivo]} onPress={() => setFiltroPadre(p.id)}>
                <Text style={[styles.filtroTexto, String(filtroPadre) === String(p.id) && styles.filtroTextoActivo]}>{p.nombre}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <FlatList
        data={lista}
        keyExtractor={(x) => String(x[cfg.id])}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        initialNumToRender={30}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.fila} onPress={() => puedeEditar && setEditando(item)} disabled={!puedeEditar} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>{item[cfg.nombre]}</Text>
              {nombrePadre(item) || (cfg.nota && item[cfg.nota]) ? (
                <Text style={styles.meta} numberOfLines={1}>{[nombrePadre(item), cfg.nota && item[cfg.nota]].filter(Boolean).join(" · ")}</Text>
              ) : null}
            </View>
            {puedeEliminar && (
              <TouchableOpacity onPress={() => eliminar(item)} hitSlop={8}><Ionicons name="trash-outline" size={19} color={colors.red600} /></TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.vacio}>{q ? "Sin resultados." : "Catálogo vacío."}</Text>}
      />

      {puedeCrear && (
        <TouchableOpacity style={styles.fab} onPress={() => setEditando(cfg.padre && filtroPadre ? { [cfg.padre.campo]: filtroPadre } : {})} accessibilityLabel="Agregar">
          <Ionicons name="add" size={28} color={colors.paper100} />
        </TouchableOpacity>
      )}

      <HojaFormulario
        visible={!!editando}
        titulo={`${editando?.[cfg.id] ? "Editar" : "Agregar"} · ${cfg.etiqueta}`}
        icono={cfg.icono}
        campos={cfg.campos(datos)}
        valoresIniciales={editando || {}}
        onGuardar={guardar}
        onCerrar={() => setEditando(null)}
      />
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cabecera: { paddingHorizontal: spacing.lg, paddingVertical: 12, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300, gap: 10 },
  tab: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 100, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: colors.paper0 },
  tabAcceso: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.petrol500, backgroundColor: "transparent" },
  tabActiva: { backgroundColor: colors.petrol500 },
  tabTexto: { fontSize: 13, fontWeight: "600", color: colors.ink700 },
  tabTextoActiva: { color: colors.paper100 },
  tabConteo: { fontSize: 11, fontWeight: "700", color: colors.ink500 },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper0, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  buscadorInput: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  filtro: { borderWidth: 1, borderColor: colors.ink300, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 11, backgroundColor: colors.paper100 },
  filtroActivo: { borderColor: colors.petrol500, backgroundColor: colors.petrol100 },
  filtroTexto: { fontSize: 12.5, fontWeight: "600", color: colors.ink700 },
  filtroTextoActivo: { color: colors.petrol600 },
  fila: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper100, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8 },
  nombre: { fontSize: 15, fontWeight: "500", color: colors.ink900 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  vacio: { textAlign: "center", color: colors.ink500, fontSize: 14, paddingTop: 40 },
  fab: {
    position: "absolute", right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.petrol500,
    alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
});
