import { contiene } from "../lib/texto";
import ScrollCampos from "../ui/ScrollCampos";
import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, ActivityIndicator, Animated, Easing } from "react-native";
import { api } from "../api";
import { Ionicons } from "../ui/IconoWeb";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";
import Auto3D from "./Auto3D";
import { ZONAS, zonasRefaccion } from "../lib/zonas";
import NuevaRefaccionModal from "./NuevaRefaccionModal";
import FiltroCategoria from "../ui/FiltroCategoria";

// Voz (requiere módulo nativo; en Expo Go no existe)
let RecVoz = null;
try { RecVoz = require("expo-speech-recognition").ExpoSpeechRecognitionModule; } catch (e) { RecVoz = null; }
const NUM_VOZ = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const STOP_VOZ = new Set(["de", "del", "la", "el", "los", "las", "para", "al", "agrega", "agregar", "pon", "poner", "ponle", "quiero", "necesito", "mas"]);
const normVoz = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const singVoz = (w) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const VACIO = { descripcion: "", id_tipo_servicio: "", cantidad: "1", costo_mano_obra: "", costo_refaccion: "", costo_extra: "" };

/*
 * Hoja "Agregar" reutilizable (órdenes y cotizaciones):
 *  - Del catálogo: buscar, filtrar por categoría, tocar para marcar y elegir cantidad.
 *  - Concepto libre: mano de obra o cualquier cargo fuera del catálogo.
 * onAgregarCatalogo([{ refaccion, cantidad, precio }])  onAgregarLibre(concepto)
 */
export default function HojaAgregarConceptos({ visible, titulo = "Agregar", refacciones = [], tipos = [], precioDe, stockDe, onAgregarCatalogo, onAgregarLibre, onCerrar, onCrearRefaccion = null, categoriasCatalogo = null, onAplicarPaquete = null }) {
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
  const [paquetes, setPaquetes] = useState([]);
  const [cargandoPaq, setCargandoPaq] = useState(false);
  const [aplicandoPaq, setAplicandoPaq] = useState(null);
  const [escuchando, setEscuchando] = useState(false);
  const [textoVoz, setTextoVoz] = useState("");
  const [avisoVoz, setAvisoVoz] = useState(null);
  const procVozRef = useRef(null);
  const pulsoVoz = useRef(new Animated.Value(0)).current;

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

  function procesarVoz(texto) {
    const esNumV = (w) => /^\d+$/.test(w) || !!NUM_VOZ[w];
    const segmentos = [];
    normVoz(texto).split(/ y | e |,| con | luego | tambien | mas | ademas | otro | otra /).map((x) => x.trim()).filter(Boolean).forEach((seg) => {
      // un número después de palabras empieza otro renglón: "aceite dos bujías" → aceite | dos bujías
      let cur = [];
      seg.split(" ").forEach((w) => {
        if (esNumV(w) && cur.some((x) => !esNumV(x))) { segmentos.push(cur.join(" ")); cur = []; }
        cur.push(w);
      });
      if (cur.length) segmentos.push(cur.join(" "));
    });
    const ok = []; const fallo = []; const nuevos = {};
    segmentos.forEach((seg) => {
      let cant = 1; const toks = [];
      seg.split(" ").forEach((w) => {
        if (/^\d+$/.test(w)) cant = Math.max(1, Number(w));
        else if (NUM_VOZ[w] && toks.length === 0) cant = NUM_VOZ[w];
        else if (!STOP_VOZ.has(w)) toks.push(singVoz(w));
      });
      if (!toks.length) return;
      let mejor = null; let mejorPts = 0;
      refacciones.forEach((r) => {
        const nom = normVoz(r.nombre_refaccion).split(" ").filter((w) => !STOP_VOZ.has(w)).map(singVoz);
        const cat = normVoz(r.categoria).split(" ").map(singVoz);
        let pts = 0;
        toks.forEach((tk) => {
          if (nom.some((x) => x.startsWith(tk) || (x.length > 3 && tk.startsWith(x)))) pts += 1;
          else if (cat.some((x) => x.length > 3 && (x.startsWith(tk) || tk.startsWith(x)))) pts += 0.4;
        });
        const score = pts / toks.length - 0.03 * Math.max(0, nom.length - pts);
        if (score > mejorPts) { mejorPts = score; mejor = r; }
      });
      if (mejor && mejorPts >= 0.6) {
        const kk = String(mejor.id_refaccion);
        if (nuevos[kk] || seleccion[kk]) return;
        nuevos[kk] = { cantidad: cant }; ok.push(`${cant} × ${mejor.nombre_refaccion}`);
      }
      else fallo.push(seg);
    });
    if (Object.keys(nuevos).length) setSeleccion((prev) => ({ ...prev, ...nuevos }));
    setAvisoVoz({ ok, fallo, texto });
  }
  procVozRef.current = procesarVoz;

  useEffect(() => {
    if (!RecVoz || !visible) return undefined;
    const subs = [
      RecVoz.addListener("result", (e) => {
        const tx = e?.results?.[0]?.transcript || "";
        setTextoVoz(tx);
        if (e?.isFinal && tx) procVozRef.current && procVozRef.current(tx);
      }),
      RecVoz.addListener("end", () => setEscuchando(false)),
      RecVoz.addListener("error", () => setEscuchando(false)),
    ];
    return () => { subs.forEach((x) => x && x.remove && x.remove()); try { RecVoz.abort(); } catch (e) {} };
  }, [visible]);

  useEffect(() => {
    if (!escuchando) { pulsoVoz.setValue(0); return undefined; }
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulsoVoz, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulsoVoz, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [escuchando, pulsoVoz]);

  async function alternarVoz() {
    if (!RecVoz) { alerta("Voz no disponible", "Esta función necesita la app instalada con el módulo de voz (no funciona en Expo Go)."); return; }
    if (escuchando) { try { RecVoz.stop(); } catch (e) {} return; }
    try {
      const perm = await RecVoz.requestPermissionsAsync();
      if (!perm.granted) { alerta("Permiso requerido", "Activa micrófono y reconocimiento de voz para usar esta función."); return; }
      setTextoVoz(""); setAvisoVoz(null); setEscuchando(true);
      RecVoz.start({ lang: "es-MX", interimResults: true, continuous: false });
    } catch (err) { setEscuchando(false); alerta("Voz", err.message || "No se pudo iniciar el micrófono."); }
  }

  useEffect(() => {
    if (!visible || modo !== "paquetes" || !onAplicarPaquete) return;
    setCargandoPaq(true);
    api.get("/paquetes-servicio/").then((r) => setPaquetes(r || [])).catch(() => setPaquetes([])).finally(() => setCargandoPaq(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, modo]);

  const totalPaquete = (paq) => (paq.conceptos || []).reduce((tt, cc) => {
    const cant = cc.cantidad || 1;
    const ref = cc.id_refaccion ? refacciones.find((r) => r.id_refaccion === cc.id_refaccion) : null;
    const pr = ref ? precio(ref) : (Number(cc.costo_refaccion) || 0);
    return tt + pr * cant + (Number(cc.costo_mano_obra) || 0) * cant;
  }, 0);

  function aplicarPaquete(paq) {
    alerta(`Agregar «${paq.nombre}»`, `Se agregarán ${paq.conceptos.length} concepto(s) por aprox. ${fmt(totalPaquete(paq))}. Podrás editar o quitar cada uno después.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Agregar todo", onPress: async () => {
        setAplicandoPaq(paq.id_paquete);
        try { await onAplicarPaquete(paq); } catch (err) { alerta("Error", err.message); } finally { setAplicandoPaq(null); }
      } },
    ]);
  }

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
            {[["catalogo", "Catálogo", "cube-outline"], ...(onAplicarPaquete ? [["paquetes", "Paquetes", "layers-outline"]] : []), ["libre", "Libre", "create-outline"]].map(([v, t, i]) => (
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={[styles.buscador, { flex: 1 }]}>
                <Ionicons name="search-outline" size={18} color={colors.ink500} />
                <TextInput style={styles.buscadorInput} placeholder="Buscar por nombre, categoría o código…" placeholderTextColor={colors.ink500} value={busqueda} onChangeText={setBusqueda} autoCorrect={false} />
                {!!busqueda && <TouchableOpacity onPress={() => setBusqueda("")} hitSlop={8}><Ionicons name="close-circle-outline" size={18} color={colors.ink500} /></TouchableOpacity>}
              </View>
              <TouchableOpacity onPress={alternarVoz} activeOpacity={0.8} style={styles.btnVoz}>
                {escuchando && <Animated.View pointerEvents="none" style={[styles.pulsoVoz, { opacity: pulsoVoz.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulsoVoz.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }]} />}
                <Ionicons name={escuchando ? "stop" : "mic"} size={22} color="#fff" />
              </TouchableOpacity>
              </View>
              {(escuchando || avisoVoz) && (
                <View style={styles.vozPanel}>
                  {escuchando ? (
                    <Text style={styles.vozTexto}>{textoVoz ? `“${textoVoz}”` : "Escuchando… di por ejemplo: «aceite de motor, dos amortiguadores delanteros y aditivos»"}</Text>
                  ) : (
                    <>
                      {avisoVoz.ok.length > 0 && <Text style={styles.vozTexto}>Seleccionado: {avisoVoz.ok.join(" · ")}</Text>}
                      {avisoVoz.fallo.length > 0 && <Text style={[styles.vozTexto, { color: colors.warn600 }]}>No encontré: {avisoVoz.fallo.join(" · ")}</Text>}
                      {avisoVoz.ok.length === 0 && avisoVoz.fallo.length === 0 && <Text style={styles.vozTexto}>No te entendí, intenta de nuevo.</Text>}
                    </>
                  )}
                  {!escuchando && <TouchableOpacity onPress={() => setAvisoVoz(null)} hitSlop={8} style={{ position: "absolute", top: 6, right: 8 }}><Ionicons name="close-outline" size={18} color={colors.ink500} /></TouchableOpacity>}
                </View>
              )}
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
              <FiltroCategoria
                categorias={categorias.map((c) => ({ nombre: c, cuenta: conteoCat[c] || 0 }))}
                valor={categoria}
                onChange={setCategoria}
              />
              <View style={styles.resultadoBarra}>
                <Text style={styles.meta}>{filtradas.length} {filtradas.length === 1 ? "refacción" : "refacciones"}</Text>
                {hayFiltros && <TouchableOpacity onPress={limpiarFiltros} hitSlop={8}><Text style={styles.limpiar}>Limpiar filtros</Text></TouchableOpacity>}
              </View>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 8 }} keyboardShouldPersistTaps="handled">
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
              ) : (
                <View style={styles.rejilla}>
                  {filtradas.map((r) => {
                    const k = String(r.id_refaccion);
                    const marcada = !!seleccion[k];
                    const pr = precio(r);
                    const stk = stockR(r);
                    const sinStk = stk != null && Number(stk) <= 0;
                    return (
                      <TouchableOpacity key={k} activeOpacity={0.85}
                        style={[styles.tile, sinStk && !marcada && { opacity: 0.6 }, marcada && { borderColor: colors.petrol500, backgroundColor: `${colors.petrol500}1F`, shadowColor: colors.petrol500, shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4 }]}
                        onPress={() => setSeleccion((p) => { const cc = { ...p }; if (cc[k]) delete cc[k]; else cc[k] = { cantidad: 1 }; return cc; })}>
                        <Text style={styles.tileNombre} numberOfLines={2}>{r.nombre_refaccion}</Text>
                        <Text style={styles.tileCat} numberOfLines={1}>{[r.categoria || "Sin categoría", stk != null ? (sinStk ? "Sin stock" : `Stock ${stk}`) : null].filter(Boolean).join(" · ")}</Text>
                        <Text style={[styles.tilePrecio, marcada && { color: colors.petrol500 }, !pr && { fontSize: 14, color: colors.ink500, fontWeight: "600" }]} numberOfLines={1} adjustsFontSizeToFit>{pr ? fmt(pr) : "Sin precio"}</Text>
                        {marcada && (
                          <View style={styles.tileContador}>
                            <TouchableOpacity onPress={() => setSeleccion((p) => ({ ...p, [k]: { cantidad: Math.max(1, p[k].cantidad - 1) } }))} hitSlop={8}><Ionicons name="remove-outline" size={20} color="#fff" /></TouchableOpacity>
                            <Text style={styles.tileContadorTexto}>{seleccion[k].cantidad}</Text>
                            <TouchableOpacity onPress={() => setSeleccion((p) => ({ ...p, [k]: { cantidad: p[k].cantidad + 1 } }))} hitSlop={8}><Ionicons name="add-outline" size={20} color="#fff" /></TouchableOpacity>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </>
        ) : modo === "paquetes" ? (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 10 }}>
            <Text style={styles.meta}>Toca un paquete para agregar todos sus conceptos de una vez.</Text>
            {cargandoPaq ? <ActivityIndicator color={colors.petrol500} style={{ marginTop: 20 }} /> : paquetes.length === 0 ? (
              <Text style={styles.vacio}>Todavía no tienes paquetes. Guárdalos desde una orden de servicio.</Text>
            ) : paquetes.map((paq) => (
              <TouchableOpacity key={paq.id_paquete} style={styles.paqueteFila} onPress={() => aplicarPaquete(paq)} disabled={aplicandoPaq !== null} activeOpacity={0.8}>
                <View style={styles.paqueteIcono}>
                  {aplicandoPaq === paq.id_paquete ? <ActivityIndicator color="#fff" /> : <Ionicons name="layers" size={24} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre} numberOfLines={1}>{paq.nombre}</Text>
                  <Text style={styles.meta} numberOfLines={2}>{paq.conceptos.length} concepto(s) · {paq.conceptos.map((cc) => cc.descripcion || "Refacción").slice(0, 3).join(", ")}{paq.conceptos.length > 3 ? "…" : ""}</Text>
                </View>
                <Text style={styles.paqueteTotal}>{fmt(totalPaquete(paq))}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <ScrollCampos contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
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
          <TouchableOpacity style={[styles.btnSecundario, { flex: 1, borderColor: colors.petrol500 }]} onPress={onCerrar}><Text style={[styles.btnSecundarioTexto, { color: colors.petrol500 }]}>{modo === "paquetes" ? "Cerrar" : "Cancelar"}</Text></TouchableOpacity>
          {modo !== "paquetes" && <TouchableOpacity style={[styles.btnPrimario, (modo === "catalogo" && !n) && { opacity: 0.45 }]} onPress={agregar} disabled={guardando || (modo === "catalogo" && !n)}>
            {guardando ? <ActivityIndicator color={colors.paper100} /> : (
              <Text style={styles.btnPrimarioTexto}>{modo === "catalogo" ? (n ? `Agregar ${n}` : "Toca para elegir") : "Agregar"}</Text>
            )}
          </TouchableOpacity>}
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
  btnVoz: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.petrol500, alignItems: "center", justifyContent: "center" },
  pulsoVoz: { position: "absolute", width: 46, height: 46, borderRadius: 23, backgroundColor: colors.petrol500 },
  vozPanel: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.petrol500, borderRadius: 10, paddingVertical: 8, paddingLeft: 12, paddingRight: 28, gap: 3 },
  vozTexto: { fontSize: 13, color: colors.ink900 },
  rejilla: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { width: "48%", flexGrow: 1, backgroundColor: colors.paper100, borderWidth: 2, borderColor: colors.ink300, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 10, gap: 2 },
  tileNombre: { fontSize: 14, fontWeight: "700", color: colors.ink900, lineHeight: 18 },
  tileCat: { fontSize: 11.5, color: colors.ink500 },
  tilePrecio: { marginTop: 6, fontSize: 20, fontWeight: "800", color: colors.ink900, letterSpacing: -0.3 },
  tileContador: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6, backgroundColor: colors.petrol500 },
  tileContadorTexto: { fontSize: 15, fontWeight: "800", color: "#fff" },
  paqueteFila: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 14, padding: 12 },
  paqueteIcono: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.petrol500, alignItems: "center", justifyContent: "center" },
  paqueteTotal: { fontSize: 15, fontWeight: "800", color: colors.ink900 },
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
