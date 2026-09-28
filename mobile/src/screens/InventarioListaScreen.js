import { useCallback, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, Modal, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import HojaFormulario from "../ui/HojaFormulario";
import { alerta } from "../ui/Dialogo";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const GRUPOS = { general: "Datos generales", precios: "Stock, precios y ubicación", alertas: "Alertas de stock" };

/*
 * Inventario por vehículo — espejo de web-admin/src/pages/Inventario.jsx:
 * cada registro es una refacción con su stock, precios, ubicación y las
 * marcas/modelos de vehículo con las que es compatible. Al agregarla a una
 * orden, se descuenta del registro compatible con el vehículo de esa orden.
 */
export default function InventarioListaScreen() {
  const { hasPermission } = useAuth();
  const [filas, setFilas] = useState([]);
  const [refacciones, setRefacciones] = useState([]);
  const [marcasRef, setMarcasRef] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [marcasVeh, setMarcasVeh] = useState([]);
  const [modelosVeh, setModelosVeh] = useState([]);
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState(null);
  const [compat, setCompat] = useState(null); // fila a la que se le editan compatibilidades
  const [compatMarca, setCompatMarca] = useState("");
  const [buscarMarca, setBuscarMarca] = useState("");

  const load = () => api.get("/inventario-refacciones/").then(setFilas).catch((err) => alerta("Error", err.message));

  useFocusEffect(
    useCallback(() => {
      load();
      api.get("/refacciones/").then(setRefacciones).catch(() => {});
      api.get("/refacciones-marcas/").then(setMarcasRef).catch(() => {});
      api.get("/proveedores/").then(setProveedores).catch(() => {});
      api.get("/vehiculos-marcas/").then(setMarcasVeh).catch(() => {});
      api.get("/vehiculos-modelos/").then(setModelosVeh).catch(() => {});
    }, [])
  );

  const campos = [
    { name: "id_refaccion", label: "Refacción", type: "select", required: true, grupo: "general", options: refacciones.map((r) => ({ value: r.id_refaccion, label: r.nombre_refaccion })) },
    { name: "id_marca_refaccion", label: "Marca de la refacción", type: "select", grupo: "general", options: marcasRef.map((m) => ({ value: m.id_marca_refaccion, label: m.nombre_marca || m.nombre_marca_refaccion })) },
    { name: "id_proveedor", label: "Proveedor", type: "select", grupo: "general", options: proveedores.map((p) => ({ value: p.id_proveedor, label: p.nombre_proveedor })) },
    { name: "numero_parte", label: "Número de parte", grupo: "general", autoCapitalize: "characters" },
    { name: "cantidad", label: "Stock (cantidad)", type: "number", required: true, grupo: "precios", mitad: true },
    { name: "ubicacion_fisica", label: "Ubicación física", grupo: "precios", mitad: true, placeholder: "Ej. Estante A2" },
    { name: "preciopropio", label: "Costo de compra", type: "number", grupo: "precios", mitad: true },
    { name: "preciocliente", label: "Precio de venta", type: "number", grupo: "precios", mitad: true },
    { name: "umbral_naranja", label: "Alerta amarilla desde", type: "number", grupo: "alertas", mitad: true },
    { name: "umbral_rojo", label: "Alerta crítica desde", type: "number", grupo: "alertas", mitad: true },
  ];

  async function guardar(v) {
    const datos = {
      ...v,
      id_refaccion: Number(v.id_refaccion),
      id_marca_refaccion: v.id_marca_refaccion ? Number(v.id_marca_refaccion) : null,
      id_proveedor: v.id_proveedor ? Number(v.id_proveedor) : null,
      cantidad: Number(v.cantidad) || 0,
      umbral_naranja: v.umbral_naranja != null ? Number(v.umbral_naranja) : 4,
      umbral_rojo: v.umbral_rojo != null ? Number(v.umbral_rojo) : 1,
    };
    delete datos.refaccion; delete datos.marca_refaccion; delete datos.proveedor; delete datos.compatibilidades;
    const eraNuevo = !editando?.id_inventario_refaccion;
    const guardado = eraNuevo
      ? await api.post("/inventario-refacciones/", datos)
      : await api.put(`/inventario-refacciones/${editando.id_inventario_refaccion}`, datos);
    setEditando(null);
    await load();
    // Igual que la web: sin compatibilidades no se descuenta de ninguna orden — se piden de una vez
    if (eraNuevo && guardado) setCompat(guardado);
  }

  async function agregarCompat(idModelo) {
    try {
      await api.post("/inventario-refacciones-compatibilidades/", {
        id_inventario_refaccion: compat.id_inventario_refaccion,
        id_marca_vehiculo: Number(compatMarca),
        id_modelo_vehiculo: idModelo ? Number(idModelo) : null,
      });
      setCompat(await api.get(`/inventario-refacciones/${compat.id_inventario_refaccion}`));
      load();
    } catch (err) { alerta("Error", err.message); }
  }
  async function quitarCompat(idCompat) {
    try {
      await api.del(`/inventario-refacciones-compatibilidades/${idCompat}`);
      setCompat(await api.get(`/inventario-refacciones/${compat.id_inventario_refaccion}`));
      load();
    } catch (err) { alerta("Error", err.message); }
  }
  function eliminar(f) {
    alerta("Eliminar del inventario", `¿Eliminar "${f.refaccion?.nombre_refaccion || "registro"}" del inventario?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => { try { await api.del(`/inventario-refacciones/${f.id_inventario_refaccion}`); load(); } catch (e) { alerta("Error", e.message); } } },
    ]);
  }

  const nombreMarca = (id) => marcasVeh.find((m) => m.id_marca_vehiculo === id)?.nombre_marca || "Marca";
  const nombreModelo = (id) => modelosVeh.find((m) => m.id_modelo_vehiculo === id)?.nombre_modelo;
  const visibles = filas.filter((f) => !q || `${f.refaccion?.nombre_refaccion || ""} ${f.numero_parte || ""} ${f.ubicacion_fisica || ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <View style={styles.screen}>
      <View style={styles.cabecera}>
        <View style={styles.buscador}>
          <Ionicons name="search" size={18} color={colors.ink500} />
          <TextInput style={styles.buscadorInput} placeholder="Buscar refacción, número de parte o ubicación…" placeholderTextColor={colors.ink500} value={q} onChangeText={setQ} />
        </View>
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(f) => String(f.id_inventario_refaccion)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        renderItem={({ item: f }) => {
          const rojo = f.cantidad <= (f.umbral_rojo ?? 1);
          const naranja = !rojo && f.cantidad <= (f.umbral_naranja ?? 4);
          return (
            <View style={styles.tarjeta}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>{f.refaccion?.nombre_refaccion || "Refacción"}</Text>
                  <Text style={styles.meta}>{[f.marca_refaccion?.nombre_marca, f.numero_parte, f.proveedor?.nombre_proveedor].filter(Boolean).join(" · ") || "Sin marca ni número de parte"}</Text>
                  <Text style={styles.meta}>{f.ubicacion_fisica ? `Ubicación: ${f.ubicacion_fisica}` : "Sin ubicación"} · venta {fmt(f.preciocliente)}</Text>
                </View>
                <View style={[styles.stock, rojo && styles.stockRojo, naranja && styles.stockNaranja]}>
                  <Text style={[styles.stockTexto, rojo && styles.stockRojoTexto, naranja && styles.stockNaranjaTexto]}>{f.cantidad} pza</Text>
                </View>
              </View>
              <View style={styles.chips}>
                {(f.compatibilidades || []).length === 0 ? (
                  <Text style={styles.advertencia}>Sin compatibilidades: no se descontará en órdenes</Text>
                ) : f.compatibilidades.map((c) => (
                  <View key={c.id_compatibilidad} style={styles.chipCompat}>
                    <Ionicons name="car-outline" size={12} color={colors.petrol600} />
                    <Text style={styles.chipCompatTexto}>{nombreMarca(c.id_marca_vehiculo)} {nombreModelo(c.id_modelo_vehiculo) || "(todos)"}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.acciones}>
                {hasPermission("refacciones.editar") && (
                  <>
                    <TouchableOpacity style={styles.accion} onPress={() => { setCompat(f); setCompatMarca(""); setBuscarMarca(""); }}>
                      <Ionicons name="car-sport-outline" size={16} color={colors.petrol600} /><Text style={styles.accionTexto}>Compatibilidades</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.accion} onPress={() => setEditando(f)}>
                      <Ionicons name="create-outline" size={16} color={colors.petrol600} /><Text style={styles.accionTexto}>Editar</Text>
                    </TouchableOpacity>
                  </>
                )}
                {hasPermission("refacciones.eliminar") && (
                  <TouchableOpacity style={styles.accion} onPress={() => eliminar(f)}>
                    <Ionicons name="trash-outline" size={16} color={colors.red600} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Ionicons name="file-tray-stacked-outline" size={36} color={colors.ink500} />
            <Text style={styles.vacioTexto}>{q ? "Sin resultados." : "Aún no hay inventario. Toca + para registrar el stock de una refacción."}</Text>
          </View>
        }
      />

      {hasPermission("refacciones.crear") && (
        <TouchableOpacity style={styles.fab} onPress={() => setEditando({})} accessibilityLabel="Nuevo registro de inventario">
          <Ionicons name="add" size={28} color={colors.paper100} />
        </TouchableOpacity>
      )}

      <HojaFormulario
        visible={!!editando}
        titulo={editando?.id_inventario_refaccion ? "Editar inventario" : "Nuevo en inventario"}
        icono="file-tray-stacked-outline"
        campos={campos}
        grupos={GRUPOS}
        valoresIniciales={editando?.id_inventario_refaccion ? editando : { cantidad: "0", umbral_naranja: "4", umbral_rojo: "1" }}
        onGuardar={guardar}
        onCerrar={() => setEditando(null)}
      />

      {/* Compatibilidades: marca -> modelo (o todos los modelos) */}
      <Modal visible={!!compat} animationType="slide" onRequestClose={() => setCompat(null)}>
        <View style={styles.modalPantalla}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitulo}>Compatibilidades</Text>
              <Text style={styles.meta}>{compat?.refaccion?.nombre_refaccion}</Text>
            </View>
            <TouchableOpacity onPress={() => setCompat(null)} hitSlop={10}><Ionicons name="close" size={24} color={colors.ink900} /></TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: 10 }}>
            <View style={styles.chips}>
              {(compat?.compatibilidades || []).map((c) => (
                <TouchableOpacity key={c.id_compatibilidad} style={styles.chipCompat} onPress={() => quitarCompat(c.id_compatibilidad)}>
                  <Text style={styles.chipCompatTexto}>{nombreMarca(c.id_marca_vehiculo)} {nombreModelo(c.id_modelo_vehiculo) || "(todos)"}</Text>
                  <Ionicons name="close" size={13} color={colors.red600} />
                </TouchableOpacity>
              ))}
              {(compat?.compatibilidades || []).length === 0 && <Text style={styles.meta}>Todavía no tiene. Elige marca y luego el modelo.</Text>}
            </View>
            <Text style={styles.paso}>{compatMarca ? `Modelos de ${nombreMarca(Number(compatMarca))}` : "1 · Elige la marca"}</Text>
            {!compatMarca && (
              <View style={styles.buscador}>
                <Ionicons name="search" size={18} color={colors.ink500} />
                <TextInput style={styles.buscadorInput} placeholder="Buscar marca…" placeholderTextColor={colors.ink500} value={buscarMarca} onChangeText={setBuscarMarca} />
              </View>
            )}
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 6 }} keyboardShouldPersistTaps="handled">
            {!compatMarca ? marcasVeh.filter((m) => !buscarMarca || m.nombre_marca.toLowerCase().includes(buscarMarca.toLowerCase())).map((m) => (
              <TouchableOpacity key={m.id_marca_vehiculo} style={styles.opcion} onPress={() => setCompatMarca(String(m.id_marca_vehiculo))}>
                <Text style={styles.opcionTexto}>{m.nombre_marca}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.ink500} />
              </TouchableOpacity>
            )) : (
              <>
                <TouchableOpacity style={styles.opcion} onPress={() => setCompatMarca("")}>
                  <Ionicons name="arrow-back" size={18} color={colors.petrol600} /><Text style={[styles.opcionTexto, { color: colors.petrol600 }]}>Otra marca</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.opcion, styles.opcionDestacada]} onPress={() => agregarCompat(null)}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.petrol600} /><Text style={styles.opcionTexto}>Todos los modelos de la marca</Text>
                </TouchableOpacity>
                {modelosVeh.filter((m) => String(m.id_marca_vehiculo) === compatMarca).map((m) => (
                  <TouchableOpacity key={m.id_modelo_vehiculo} style={styles.opcion} onPress={() => agregarCompat(m.id_modelo_vehiculo)}>
                    <Ionicons name="add" size={18} color={colors.petrol600} /><Text style={styles.opcionTexto}>{m.nombre_modelo}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  cabecera: { paddingHorizontal: spacing.lg, paddingVertical: 12, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper0, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  buscadorInput: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  tarjeta: { backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginBottom: 10 },
  nombre: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  stock: { alignSelf: "flex-start", borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: colors.teal100 },
  stockTexto: { fontSize: 12, fontWeight: "700", color: colors.teal600 },
  stockNaranja: { backgroundColor: colors.warn100 }, stockNaranjaTexto: { color: colors.warn600 },
  stockRojo: { backgroundColor: colors.red100 }, stockRojoTexto: { color: colors.red600 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chipCompat: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.petrol100, borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10 },
  chipCompatTexto: { fontSize: 12, fontWeight: "600", color: colors.petrol600 },
  advertencia: { fontSize: 12, fontWeight: "600", color: colors.warn600 },
  acciones: { flexDirection: "row", gap: 16, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.ink300 },
  accion: { flexDirection: "row", alignItems: "center", gap: 5 },
  accionTexto: { fontSize: 13, fontWeight: "600", color: colors.petrol600 },
  vacio: { alignItems: "center", gap: 8, paddingTop: 60 },
  vacioTexto: { fontSize: 14, color: colors.ink500, textAlign: "center", paddingHorizontal: 20 },
  fab: {
    position: "absolute", right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.petrol500,
    alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  modalPantalla: { flex: 1, backgroundColor: colors.paper0, paddingTop: 36 },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  modalTitulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 22, color: colors.ink900 },
  paso: { fontSize: 12, fontWeight: "700", color: colors.petrol600, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
  opcion: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper100, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  opcionDestacada: { borderWidth: 1.5, borderColor: colors.petrol500 },
  opcionTexto: { flex: 1, fontSize: 15, color: colors.ink900 },
});
