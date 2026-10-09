import { useCallback, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import HojaFormulario from "../ui/HojaFormulario";
import { alerta, mostrarDialogo } from "../ui/Dialogo";
import { norm } from "../lib/texto";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Mismos grupos y campos que web-admin/src/pages/Refacciones.jsx
const GRUPOS = { general: "Datos generales", proveedor: "Proveedor", precios: "Stock y precios" };

export default function RefaccionesScreen({ navigation }) {
  const { hasPermission } = useAuth();
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [refacciones, setRefacciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [editando, setEditando] = useState(null); // {} = nueva, objeto = editar

  async function load(query = q) {
    const data = await api.get(`/refacciones/${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    setRefacciones(data);
  }

  useFocusEffect(
    useCallback(() => {
      load();
      api.get("/refacciones-categorias/").then(setCategorias).catch(() => setCategorias([]));
      api.get("/proveedores/").then(setProveedores).catch(() => setProveedores([]));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );
  useActualizacionGlobal("refacciones", () => load());

  const campos = [
    { name: "nombre_refaccion", label: "Nombre", required: true, grupo: "general", placeholder: "Ej. Balatas delanteras" },
    { name: "numero_refaccion", label: "Número de parte", grupo: "general", placeholder: "Ej. BD-4471", autoCapitalize: "characters" },
    { name: "__id_categoria", label: "Categoría", type: "select", required: true, grupo: "general", options: categorias.map((c) => ({ value: c.id_categoria_refaccion, label: c.nombre_categoria })) },
    { name: "id_proveedor", label: "Proveedor", type: "select", grupo: "proveedor", placeholder: "Sin proveedor", options: proveedores.map((p) => ({ value: p.id_proveedor, label: p.nombre_proveedor })) },
    { name: "cantidad_refaccion", label: "Cantidad en stock", type: "number", grupo: "precios", mitad: true },
    { name: "preciopropio_refaccion", label: "Precio de costo", type: "number", grupo: "precios", mitad: true },
    { name: "preciocliente_refaccion", label: "Precio al cliente", type: "number", grupo: "precios", hint: "Es el que se precarga al agregarla a una orden." },
  ];

  // Pregunta antes de guardar; resuelve true/false
  const confirmar = (titulo, mensaje, textoSi) => new Promise((resolver) => mostrarDialogo({
    tono: "alerta", icono: "copy-outline", titulo, mensaje,
    acciones: [{ texto: textoSi, tipo: "primario", onPress: () => resolver(true) }, { texto: "Cancelar", tipo: "secundario", onPress: () => resolver(false) }],
  }));

  async function guardar(valores) {
    const { __id_categoria, ...datos } = valores;
    datos.categoria = __id_categoria ? categorias.find((c) => String(c.id_categoria_refaccion) === String(__id_categoria))?.nombre_categoria || null : null;
    if (!(datos.nombre_refaccion || "").trim() || !datos.categoria) throw new Error("Captura el nombre y elige la categoría.");
    // Evitar duplicados: mismo nombre (sin importar acentos/mayúsculas)
    const mismos = refacciones.filter((r) => r.id_refaccion !== editando?.id_refaccion && norm(r.nombre_refaccion) === norm(datos.nombre_refaccion));
    if (mismos.some((r) => norm(r.categoria) === norm(datos.categoria))) throw new Error(`"${datos.nombre_refaccion}" ya existe en ${datos.categoria}.`);
    if (mismos.length) {
      const otras = [...new Set(mismos.map((r) => r.categoria || "Sin categoría"))].join(", ");
      const seguir = await confirmar("Ya existe en otra categoría", `"${datos.nombre_refaccion}" ya está registrada en ${otras}. ¿La agregas también en ${datos.categoria}?`, "Sí, agregar");
      if (!seguir) throw new Error(`No se guardó: ya existe en ${otras}.`);
    }
    datos.id_proveedor = datos.id_proveedor ? Number(datos.id_proveedor) : null;
    if (editando?.id_refaccion) await api.put(`/refacciones/${editando.id_refaccion}`, datos);
    else await api.post("/refacciones/", datos);
    setEditando(null);
    load();
  }

  // Antes de eliminar se revisa el inventario: si tiene piezas, no se borra y se ofrece editar o ver el inventario
  async function eliminar(r) {
    let inventario = [];
    try { inventario = await api.get(`/inventario-refacciones/?id_refaccion=${r.id_refaccion}`); } catch { inventario = []; }
    const piezas = (inventario || []).length ? inventario.reduce((t, i) => t + (Number(i.cantidad) || 0), 0) : (Number(r.cantidad_refaccion) || 0);
    if ((inventario || []).length > 0 || piezas > 0) {
      const acciones = [];
      if (hasPermission("refacciones.editar")) acciones.push({ texto: "Editar refacción", tipo: "primario", icono: "create-outline", onPress: () => setEditando(r) });
      // "Ver inventario" solo si el paquete contratado incluye Inventario
      if (hasPermission("inventario.ver")) acciones.push({ texto: "Ver inventario", tipo: acciones.length ? "secundario" : "primario", icono: "cube-outline", onPress: () => navigation.navigate("InventarioDetalle", { id: r.id_refaccion }) });
      acciones.push({ texto: "Cancelar", tipo: "secundario" });
      mostrarDialogo({
        tono: "alerta", icono: "cube", titulo: "No se puede eliminar",
        mensaje: `"${r.nombre_refaccion}" tiene ${piezas} pieza(s) en inventario${inventario.length ? ` (${inventario.length} registro(s))` : ""}. Ajusta el inventario o edita la refacción.`,
        acciones,
      });
      return;
    }
    alerta("Eliminar refacción", `¿Eliminar "${r.nombre_refaccion}"? No se puede deshacer.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        try { await api.del(`/refacciones/${r.id_refaccion}`); load(); } catch (err) { alerta("Error", err.message); }
      } },
    ]);
  }

  const valoresIniciales = editando?.id_refaccion
    ? { ...editando, __id_categoria: categorias.find((c) => c.nombre_categoria === editando.categoria)?.id_categoria_refaccion || "" }
    : { cantidad_refaccion: "0" };
  const visibles = refacciones.filter((r) => !categoria || r.categoria === categoria);

  return (
    <View style={styles.screen}>
      <View style={styles.cabecera}>
        <View style={styles.buscador}>
          <Ionicons name="search" size={18} color={colors.ink500} />
          <TextInput style={styles.buscadorInput} placeholder="Buscar refacción o número de parte…" placeholderTextColor={colors.ink500}
            value={q} onChangeText={(t) => { setQ(t); load(t); }} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 10 }}>
          {["", ...categorias.map((c) => c.nombre_categoria)].map((c) => (
            <TouchableOpacity key={c || "todas"} style={[styles.chip, categoria === c && styles.chipActivo]} onPress={() => setCategoria(c)}>
              <Text style={[styles.chipTexto, categoria === c && styles.chipTextoActivo]}>{c || "Todas"}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(item) => String(item.id_refaccion)}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: 10 }}
        renderItem={({ item }) => {
          const rojo = item.cantidad_refaccion <= (item.umbral_rojo ?? 1);
          const naranja = !rojo && item.cantidad_refaccion <= (item.umbral_naranja ?? 4);
          const proveedor = proveedores.find((p) => p.id_proveedor === item.id_proveedor);
          return (
            <TouchableOpacity style={styles.tarjeta} onPress={() => navigation.navigate("InventarioDetalle", { id: item.id_refaccion })} activeOpacity={0.75}>
              <View style={styles.tarjetaTop}>
                <Text style={styles.nombre} numberOfLines={2}>{item.nombre_refaccion}</Text>
                <View style={[styles.stock, rojo && styles.stockRojo, naranja && styles.stockNaranja]}>
                  <Text style={[styles.stockTexto, rojo && styles.stockRojoTexto, naranja && styles.stockNaranjaTexto]}>{item.cantidad_refaccion ?? 0} pza</Text>
                </View>
              </View>
              <Text style={styles.meta} numberOfLines={2}>
                {[item.numero_refaccion, item.categoria, proveedor?.nombre_proveedor].filter(Boolean).join(" · ") || "Sin datos adicionales"}
              </Text>
              <View style={styles.preciosFila}>
                {item.preciocliente_refaccion ? <Text style={styles.precio}>{fmt(item.preciocliente_refaccion)}</Text> : <Text style={styles.sinPrecio}>Sin precio</Text>}
                {item.preciopropio_refaccion ? <Text style={styles.costo} numberOfLines={1}>costo {fmt(item.preciopropio_refaccion)}</Text> : null}
              </View>
              <View style={styles.tarjetaAcciones}>
                {hasPermission("refacciones.editar") && (
                  <TouchableOpacity style={styles.accionBtn} onPress={() => setEditando(item)} hitSlop={6} accessibilityLabel="Editar">
                    <Ionicons name="create-outline" size={20} color={colors.ink700} /><Text style={styles.accionTexto}>Editar</Text>
                  </TouchableOpacity>
                )}
                {hasPermission("refacciones.eliminar") && (
                  <TouchableOpacity style={[styles.accionBtn, styles.accionBorrar]} onPress={() => eliminar(item)} hitSlop={6} accessibilityLabel="Eliminar">
                    <Ionicons name="trash-outline" size={20} color={colors.red600} /><Text style={[styles.accionTexto, { color: colors.red600 }]}>Borrar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Ionicons name="cube-outline" size={36} color={colors.ink500} />
            <Text style={styles.vacioTexto}>{q || categoria ? "Sin resultados." : "Aún no hay refacciones. Toca + para registrar la primera."}</Text>
          </View>
        }
      />

      {hasPermission("refacciones.crear") && (
        <TouchableOpacity style={styles.fab} onPress={() => setEditando({})} accessibilityLabel="Nueva refacción">
          <Ionicons name="add" size={28} color={colors.paper100} />
        </TouchableOpacity>
      )}

      <HojaFormulario
        visible={!!editando}
        titulo={editando?.id_refaccion ? "Editar refacción" : "Nueva refacción"}
        icono="cube-outline"
        campos={campos}
        grupos={GRUPOS}
        valoresIniciales={valoresIniciales}
        onGuardar={guardar}
        onCerrar={() => setEditando(null)}
      />
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cabecera: { paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 10, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper0, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  buscadorInput: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  chip: { borderWidth: 1, borderColor: colors.ink300, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.paper100 },
  chipActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  chipTexto: { fontSize: 13, fontWeight: "600", color: colors.ink700 },
  chipTextoActivo: { color: colors.paper100 },
  tarjeta: { flex: 1, minWidth: 0, backgroundColor: colors.paper100, borderRadius: 12, padding: 12 },
  tarjetaTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 6 },
  nombre: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.ink900 },
  meta: { fontSize: 11.5, color: colors.ink500, marginTop: 4 },
  preciosFila: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 8, marginTop: 8 },
  precio: { fontFamily: "BarlowCondensed_700Bold", fontSize: 18, color: colors.ink900 },
  costo: { fontSize: 11.5, color: colors.ink500 },
  sinPrecio: { fontSize: 11.5, color: colors.warn600, fontWeight: "600" },
  tarjetaAcciones: { flexDirection: "row", gap: 8, marginTop: 10, borderTopWidth: 1, borderTopColor: colors.ink300, paddingTop: 10 },
  accionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.ink300 },
  accionBorrar: { borderColor: colors.red600, backgroundColor: colors.red100 },
  accionTexto: { fontSize: 13, fontWeight: "700", color: colors.ink700 },
  stock: { borderRadius: 100, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: colors.teal100 },
  stockTexto: { fontSize: 12, fontWeight: "700", color: colors.teal600 },
  stockNaranja: { backgroundColor: colors.warn100 }, stockNaranjaTexto: { color: colors.warn600 },
  stockRojo: { backgroundColor: colors.red100 }, stockRojoTexto: { color: colors.red600 },
  vacio: { alignItems: "center", gap: 8, paddingTop: 60 },
  vacioTexto: { fontSize: 14, color: colors.ink500, textAlign: "center" },
  fab: {
    position: "absolute", right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.petrol500,
    alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
});
