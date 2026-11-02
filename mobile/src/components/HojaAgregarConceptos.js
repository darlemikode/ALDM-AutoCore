import { contiene } from "../lib/texto";
import ScrollCampos from "../ui/ScrollCampos";
import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from "react-native";
import { Ionicons } from "../ui/IconoWeb";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";
import Auto3D from "./Auto3D";
import { ZONAS, zonasRefaccion } from "../lib/zonas";
import NuevaRefaccionModal from "./NuevaRefaccionModal";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const VACIO = { descripcion: "", id_tipo_servicio: "", cantidad: "1", costo_mano_obra: "", costo_refaccion: "", costo_extra: "" };

/*
 * Hoja "Agregar" reutilizable (órdenes y cotizaciones):
 *  - Del catálogo: buscar, filtrar por categoría, tocar para marcar y elegir cantidad.
 *  - Concepto libre: mano de obra o cualquier cargo fuera del catálogo.
 * onAgregarCatalogo([{ refaccion, cantidad, precio }])  onAgregarLibre(concepto)
 */
export default function HojaAgregarConceptos({ visible, titulo = "Agregar", refacciones = [], tipos = [], precioDe, stockDe, onAgregarCatalogo, onAgregarLibre, onCerrar, onCrearRefaccion = null, categoriasCatalogo = null }) {
  const [modo, setModo] = useState("catalogo");
  const [seleccion, setSeleccion] = useState({});
  const [categoria, setCategoria] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [libre, setLibre] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [verAuto, setVerAuto] = useState(false); // elegir la zona tocando el auto
  const [zona, setZona] = useState(null); // clave de ZONAS | "otras" | null
  const [soloConStock, setSoloConStock] = useState(false);
  const [soloMarcadas, setSoloMarcadas] = useState(false);
  const [creando, setCreando] = useState(false); // alta rápida de una refacción que no existe

  useEffect(() => {
    if (visible) { setSeleccion({}); setCategoria(""); setBusqueda(""); setVerAuto(false); setZona(null); setSoloConStock(false); setSoloMarcadas(false); setLibre(VACIO); setModo(refacciones.length ? "catalogo" : "libre"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const precio = (r) => (precioDe ? precioDe(r) : (r.preciocliente_refaccion || r.preciopropio_refaccion)) || 0;
  const categorias = [...new Set(refacciones.map((r) => r.categoria).filter(Boolean))].sort();
  const categoriasAlta = categoriasCatalogo || categorias;
  const stockR = (r) => (stockDe ? stockDe(r) : r.cantidad_refaccion);
  // Busca en nombre, categoría y cualquier código / marca / parte que traiga la refacción;
  // cada palabra debe aparecer (en cualquier orden): "balata del" encuentra "Balata delantera".
  const textoDe = (r) => [r.nombre_refaccion, r.categoria, r.codigo_refaccion, r.codigo, r.sku, r.marca, r.numero_parte, r.descripcion_refaccion].filter(Boolean).join(" ");
  const palabras = busqueda.trim().split(/\s+/).filter(Boolean);
  const porBusqueda = refacciones.filter((r) => palabras.every((p) => contiene(textoDe(r), p)));
  const pasaExtras = (r) => (!soloConStock || (Number(stockR(r)) || 0) > 0) && (!soloMarcadas || !!seleccion[String(r.id_refaccion)]);
  const filtradas = porBusqueda
    .filter((r) => (!categoria || r.categoria === categoria) && pasaExtras(r)
      && (!zona || (zona === "otras" ? zonasRefaccion(r).length === 0 : zonasRefaccion(r).includes(zona))))
    .sort((x, y) => {
      const mx = seleccion[String(x.id_refaccion)] ? 0 : 1, my = seleccion[String(y.id_refaccion)] ? 0 : 1;
      return mx - my || String(x.nombre_refaccion || "").localeCompare(String(y.nombre_refaccion || ""), "es");
    });
  // Cuántas hay por categoría con la búsqueda actual
  const conteoCat = {};
  porBusqueda.filter(pasaExtras).forEach((r) => { if (r.categoria) conteoCat[r.categoria] = (conteoCat[r.categoria] || 0) + 1; });
  const hayFiltros = !!(busqueda || categoria || zona || soloConStock || soloMarcadas);
  function limpiarFiltros() { setBusqueda(""); setCategoria(""); setZona(null); setSoloConStock(false); setSoloMarcadas(false); }
  // Cuántas refacciones hay (y cuántas marcadas) por zona del auto
  const conteoZona = {}, marcadasZona = {};
  let sinZona = 0;
  if (verAuto) {
    porBusqueda.forEach((r) => {
      const zs = zonasRefaccion(r);
      if (!zs.length) sinZona += 1;
      zs.forEach((z) => { conteoZona[z] = (conteoZona[z] || 0) + 1; if (seleccion[String(r.id_refaccion)]) marcadasZona[z] = (marcadasZona[z] || 0) + 1; });
    });
  }
  const n = Object.keys(seleccion).length;
  const set = (k) => (v) => setLibre((p) => ({ ...p, [k]: v }));
  const importeLibre = (Number(libre.costo_mano_obra) || 0) + (Number(libre.costo_refaccion) || 0) + (Number(libre.costo_extra) || 0);

  async function agregar() {
    setGuardando(true);
    try {
      if (modo === "catalogo") {
        if (!n) return;
        await onAgregarCatalogo(Object.entries(seleccion).map(([id, v]) => {
          const r = refacciones.find((x) => String(x.id_refaccion) === id);
          return { refaccion: r, cantidad: v.cantidad, precio: precio(r) };
        }));
      } else {
        if (!libre.descripcion.trim()) { alerta("Falta la descripción", "Escribe qué se hizo o qué se cobra."); return; }
        if (importeLibre <= 0) { alerta("Falta el costo", "Captura al menos un importe."); return; }
        await onAgregarLibre({
          descripcion: libre.descripcion.trim(),
          id_tipo_servicio: libre.id_tipo_servicio ? Number(libre.id_tipo_servicio) : null,
          id_refaccion: null,
          cantidad: Math.max(1, Number(libre.cantidad) || 1),
          costo_mano_obra: Number(libre.costo_mano_obra) || 0,
          costo_refaccion: Number(libre.costo_refaccion) || 0,
          costo_extra: Number(libre.costo_extra) || 0,
        });
      }
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar}>
      <View style={styles.pantalla}>
        <View style={styles.header}>
          <Text style={styles.titulo}>{titulo}</Text>
          <TouchableOpacity onPress={onCerrar} hitSlop={10}><Ionicons name="close-outline" size={24} color={colors.ink900} /></TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <View style={styles.segmentado}>
            {[["catalogo", "Del catálogo", "cube-outline"], ["libre", "Concepto libre", "create-outline"]].map(([v, t, i]) => (
              <TouchableOpacity key={v} style={[styles.segmento, modo === v && styles.segmentoActivo]} onPress={() => setModo(v)}>
                <Ionicons name={i} size={15} color={modo === v ? colors.paper100 : colors.ink700} />
                <Text style={[styles.segmentoTexto, modo === v && styles.segmentoTextoActivo]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {modo === "catalogo" ? (
          <>
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: 10, gap: 8 }}>
              <View style={styles.buscador}>
                <Ionicons name="search-outline" size={18} color={colors.ink500} />
                <TextInput style={styles.buscadorInput} placeholder="Buscar por nombre, categoría o código…" placeholderTextColor={colors.ink500} value={busqueda} onChangeText={setBusqueda} autoCorrect={false} />
                {!!busqueda && <TouchableOpacity onPress={() => setBusqueda("")} hitSlop={8}><Ionicons name="close-circle-outline" size={18} color={colors.ink500} /></TouchableOpacity>}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <TouchableOpacity style={[styles.chip, verAuto && styles.chipActivo]} onPress={() => { setVerAuto(!verAuto); setZona(null); }}>
                  <Text style={[styles.chipTexto, verAuto && styles.chipTextoActivo]}><Ionicons name="car-sport-outline" size={13} /> {verAuto ? "Ocultar auto" : "Elegir en el auto"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.chip, soloConStock && styles.chipActivo]} onPress={() => setSoloConStock(!soloConStock)}>
                  <Text style={[styles.chipTexto, soloConStock && styles.chipTextoActivo]}>Con stock</Text>
                </TouchableOpacity>
                {n > 0 && (
                  <TouchableOpacity style={[styles.chip, soloMarcadas && styles.chipActivo]} onPress={() => setSoloMarcadas(!soloMarcadas)}>
                    <Text style={[styles.chipTexto, soloMarcadas && styles.chipTextoActivo]}>Marcadas ({n})</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {["", ...categorias].map((c) => (
                  <TouchableOpacity key={c || "todas"} style={[styles.chip, categoria === c && styles.chipActivo]} onPress={() => setCategoria(c)}>
                    <Text style={[styles.chipTexto, categoria === c && styles.chipTextoActivo]}>{c || "Todas"}{c && conteoCat[c] != null ? ` (${conteoCat[c]})` : ""}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.resultadoBarra}>
                <Text style={styles.meta}>{filtradas.length} {filtradas.length === 1 ? "refacción" : "refacciones"}</Text>
                {hayFiltros && <TouchableOpacity onPress={limpiarFiltros} hitSlop={8}><Text style={styles.limpiar}>Limpiar filtros</Text></TouchableOpacity>}
              </View>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 8 }}>
              {verAuto && (
                <View style={{ marginBottom: 6 }}>
                  <Auto3D compacto altura={230} fps={18} estadoZona={(z) => (marcadasZona[z] ? "refsel" : conteoZona[z] ? "ref" : "ninguno")}
                    etiqueta={(z) => (conteoZona[z] ? (conteoZona[z] > 99 ? "99+" : String(conteoZona[z])) : "")}
                    elegida={zona && zona !== "otras" ? zona : null} onSelect={(z) => setZona(zona === z ? null : z)}
                    ayuda="Gira el auto y toca una zona para ver sus refacciones" />
                  <View style={styles.zonaBarra}>
                    <Text style={styles.zonaNombre} numberOfLines={2}>{zona === "otras" ? "Sin zona" : zona ? ZONAS[zona] : "Todo el vehículo"}</Text>
                    {sinZona > 0 && (
                      <TouchableOpacity style={[styles.chip, zona === "otras" && styles.chipActivo]} onPress={() => setZona(zona === "otras" ? null : "otras")}>
                        <Text style={[styles.chipTexto, zona === "otras" && styles.chipTextoActivo]}>Sin zona ({sinZona})</Text>
                      </TouchableOpacity>
                    )}
                    {zona && (
                      <TouchableOpacity style={styles.chip} onPress={() => setZona(null)}><Text style={styles.chipTexto}>Ver todas</Text></TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
              {filtradas.length === 0 ? (
                <View style={{ gap: 10 }}>
                  <Text style={styles.vacio}>{refacciones.length ? "Nada coincide con los filtros." : "Todavía no hay refacciones en el catálogo."}</Text>
                  {onCrearRefaccion && (
                    <TouchableOpacity style={styles.btnSecundario} onPress={() => setCreando(true)}>
                      <Text style={styles.btnSecundarioTexto}>＋ Agregar al catálogo{busqueda.trim() ? ` «${busqueda.trim()}»` : ""}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.btnSecundario} onPress={() => { setLibre((p) => ({ ...p, descripcion: busqueda })); setModo("libre"); }}>
                    <Text style={styles.btnSecundarioTexto}>Agregarlo como concepto libre</Text>
                  </TouchableOpacity>
                </View>
              ) : filtradas.map((r) => {
                const k = String(r.id_refaccion);
                const marcada = !!seleccion[k];
                const stock = stockR(r);
                const sinStock = stock != null && Number(stock) <= 0;
                return (
                  <TouchableOpacity key={k} style={[styles.tarjeta, marcada && styles.tarjetaActiva, sinStock && !marcada && { opacity: 0.6 }]} activeOpacity={0.8}
                    onPress={() => setSeleccion((p) => { const c = { ...p }; if (c[k]) delete c[k]; else c[k] = { cantidad: 1 }; return c; })}>
                    <Ionicons name={marcada ? "checkbox" : "square-outline"} size={22} color={marcada ? colors.petrol500 : colors.ink500} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nombre}>{r.nombre_refaccion}</Text>
                      <Text style={styles.meta}>{[r.categoria, stock != null ? (sinStock ? "Sin stock" : `Stock ${stock}`) : null, precio(r) ? fmt(precio(r)) : "sin precio"].filter(Boolean).join(" · ")}</Text>
                    </View>
                    {marcada && (
                      <View style={styles.contador}>
                        <TouchableOpacity onPress={() => setSeleccion((p) => ({ ...p, [k]: { cantidad: Math.max(1, p[k].cantidad - 1) } }))} hitSlop={6}><Ionicons name="remove-circle-outline" size={24} color={colors.petrol600} /></TouchableOpacity>
                        <Text style={styles.contadorTexto}>{seleccion[k].cantidad}</Text>
                        <TouchableOpacity onPress={() => setSeleccion((p) => ({ ...p, [k]: { cantidad: p[k].cantidad + 1 } }))} hitSlop={6}><Ionicons name="add-circle-outline" size={24} color={colors.petrol600} /></TouchableOpacity>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        ) : (
          <ScrollCampos contentContainerStyle={{ padding: spacing.lg, gap: 12 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.meta}>Para mano de obra, diagnósticos o cualquier cargo que no esté en el catálogo.</Text>
            <View>
              <Text style={styles.label}>Descripción *</Text>
              <TextInput style={styles.input} value={libre.descripcion} onChangeText={set("descripcion")} placeholder="Ej. Mano de obra de afinación" placeholderTextColor={colors.ink500} />
            </View>
            {tipos.length > 0 && (
              <View>
                <Text style={styles.label}>Tipo de servicio</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {tipos.map((t) => {
                    const activo = String(libre.id_tipo_servicio) === String(t.id_tipo_servicio);
                    return (
                      <TouchableOpacity key={t.id_tipo_servicio} style={[styles.chip, activo && styles.chipActivo]} onPress={() => set("id_tipo_servicio")(activo ? "" : t.id_tipo_servicio)}>
                        <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{t.nombre_tipo}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[["costo_mano_obra", "Mano de obra $"], ["costo_refaccion", "Refacción $"]].map(([k, t]) => (
                <View key={k} style={{ flex: 1 }}>
                  <Text style={styles.label}>{t}</Text>
                  <TextInput style={styles.input} value={libre[k]} onChangeText={set(k)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.ink500} />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Extra $</Text>
                <TextInput style={styles.input} value={libre.costo_extra} onChangeText={set("costo_extra")} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.ink500} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Cantidad</Text>
                <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={libre.cantidad} onChangeText={set("cantidad")} keyboardType="number-pad" />
              </View>
            </View>
            <Text style={styles.importe}>Importe: {fmt(importeLibre)}</Text>
          </ScrollCampos>
        )}

        <View style={styles.pie}>
          <TouchableOpacity style={[styles.btnSecundario, { flex: 1 }]} onPress={onCerrar}><Text style={styles.btnSecundarioTexto}>Cancelar</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimario, (modo === "catalogo" && !n) && { opacity: 0.45 }]} onPress={agregar} disabled={guardando || (modo === "catalogo" && !n)}>
            {guardando ? <ActivityIndicator color={colors.paper100} /> : (
              <Text style={styles.btnPrimarioTexto}>{modo === "catalogo" ? (n ? `Agregar ${n}` : "Toca para elegir") : "Agregar"}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
      {onCrearRefaccion && (
        <NuevaRefaccionModal visible={creando} nombreInicial={busqueda.trim()} categorias={categoriasAlta} onCerrar={() => setCreando(false)}
          onCrear={async (datos) => {
            const r = await onCrearRefaccion(datos);
            if (r?.id_refaccion != null) {
              setBusqueda(""); setCategoria(""); setZona(null);
              setSeleccion((p) => ({ ...p, [String(r.id_refaccion)]: { cantidad: 1 } }));
            }
          }} />
      )}
    </Modal>
  );
}

const styles = crearEstilos({
  zonaBarra: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 },
  zonaNombre: { flex: 1, minWidth: 140, fontSize: 13, fontWeight: "800", color: colors.petrol600 },
  pantalla: { flex: 1, backgroundColor: colors.paper0, paddingTop: 36 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  titulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 22, color: colors.ink900 },
  segmentado: { flexDirection: "row", backgroundColor: colors.paper100, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: colors.ink300 },
  segmento: { flex: 1, flexDirection: "row", gap: 5, paddingVertical: 9, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  segmentoActivo: { backgroundColor: colors.petrol500 },
  segmentoTexto: { fontSize: 13.5, fontWeight: "600", color: colors.ink700 },
  segmentoTextoActivo: { color: colors.sobreAcento },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper100, borderWidth: 1.5, borderColor: colors.petrol300, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  buscadorInput: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  chip: { borderWidth: 1, borderColor: colors.ink300, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.paper100 },
  chipActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  chipTexto: { fontSize: 13, fontWeight: "600", color: colors.ink700 },
  chipTextoActivo: { color: colors.sobreAcento },
  tarjeta: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper100, borderWidth: 1.5, borderColor: colors.ink300, borderRadius: 10, padding: 12 },
  tarjetaActiva: { borderColor: colors.petrol500, backgroundColor: colors.petrol100 },
  nombre: { fontSize: 14.5, fontWeight: "600", color: colors.ink900 },
  meta: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  contador: { flexDirection: "row", alignItems: "center", gap: 6 },
  contadorTexto: { fontSize: 16, fontWeight: "700", color: colors.ink900, minWidth: 20, textAlign: "center" },
  resultadoBarra: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  limpiar: { fontSize: 13, fontWeight: "700", color: colors.petrol600 },
  vacio: { fontSize: 14, color: colors.ink500 },
  label: { fontSize: 12, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: colors.ink900 },
  importe: { fontSize: 15, fontWeight: "700", color: colors.teal600 },
  pie: { flexDirection: "row", gap: 10, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.ink300, backgroundColor: colors.paper100 },
  btnPrimario: { flex: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: colors.petrol500, borderRadius: 10, height: 48 },
  btnPrimarioTexto: { fontSize: 15, fontWeight: "600", color: colors.sobreAcento },
  btnSecundario: { alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, height: 48, paddingHorizontal: 14 },
  btnSecundarioTexto: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
});
