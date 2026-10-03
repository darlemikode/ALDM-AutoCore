import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { mostrarDialogo } from "../ui/Dialogo";

const ETAPAS = [
  ["recibido", "Recibido", "ink500"],
  ["diagnostico", "Diagnóstico", "blue600"],
  ["esperando_autorizacion", "Autorización", "warn600"],
  ["en_reparacion", "Reparación", "petrol500"],
  ["esperando_refacciones", "Refacciones", "red600"],
  ["control_calidad", "Calidad", "violet600"],
  ["listo_entrega", "Listo", "teal600"],
];
const ETIQUETA_ETAPA = Object.fromEntries(ETAPAS.map(([k, t]) => [k, t]));
const GRUPOS_ESTATUS = [
  { clave: "abierto", etiqueta: "Abiertas", color: "petrol500" },
  { clave: "cerrado", etiqueta: "Cerradas", color: "teal600" },
  { clave: "cancelado", etiqueta: "Canceladas", color: "ink500" },
];
const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCorto = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${Math.round(v)}`;
};
function alfa(hex, a) {
  const h = String(hex).replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const saludo = () => { const h = new Date().getHours(); return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"; };

// Tarjeta KPI con ícono en círculo de color; tocable como el Link de la web.
function Kpi({ icono, label, value, tono = "petrol500", alerta, onPress }) {
  const c = colors[alerta ? "red600" : tono];
  return (
    <TouchableOpacity style={styles.kpi} onPress={onPress} disabled={!onPress} activeOpacity={0.75}>
      <View style={styles.kpiTop}>
        <View style={[styles.kpiIcono, { backgroundColor: alfa(c, 0.16) }]}><Ionicons name={icono} size={18} color={c} /></View>
        {alerta ? <View style={[styles.punto, { backgroundColor: colors.red600 }]} /> : null}
      </View>
      <Text style={styles.kpiValor} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.kpiLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

function Accion({ icono, texto, onPress, principal }) {
  return (
    <TouchableOpacity style={styles.accion} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.accionIcono, principal ? { backgroundColor: colors.petrol500 } : { backgroundColor: alfa(colors.petrol500, 0.14) }]}>
        <Ionicons name={icono} size={22} color={principal ? colors.paper100 : colors.petrol600} />
      </View>
      <Text style={styles.accionTexto} numberOfLines={2}>{texto}</Text>
    </TouchableOpacity>
  );
}

export default function DashboardScreen({ navigation }) {
  const { user, logout, hasPermission } = useAuth();
  const [data, setData] = useState(null);
  const [proximos, setProximos] = useState([]);
  const [mensuales, setMensuales] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [refacciones, setRefacciones] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [grupo, setGrupo] = useState("abierto");
  const [metrica, setMetrica] = useState("cantidad");

  async function load() {
    const [resumen, prox, mens, serv, refs] = await Promise.all([
      api.get("/dashboard/resumen"),
      api.get("/dashboard/proximos-servicios?dias_umbral=150").catch(() => []),
      api.get("/dashboard/servicios-mensuales?meses=6").catch(() => []),
      api.get("/servicios/").catch(() => []),
      api.get("/refacciones/").catch(() => []),
    ]);
    setData(resumen);
    setProximos(prox || []);
    setMensuales(mens || []);
    setServicios(serv || []);
    setRefacciones(refs || []);
  }

  async function marcarContactado(item) {
    try {
      await api.post(`/dashboard/proximos-servicios/${item.id_vehiculo}/contactado`, { fecha_base: item.fecha_ultimo_servicio });
      setProximos((prev) => prev.filter((p) => p.id_vehiculo !== item.id_vehiculo));
    } catch {
      // no es crítico
    }
  }

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  useActualizacionGlobal("servicios", () => load().catch(() => {}));
  useActualizacionGlobal("refacciones", () => load().catch(() => {}));

  async function onRefresh() {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  }

  const nombre = (user?.nombre_completo || user?.username || "").split(" ")[0];
  const iniciales = (user?.nombre_completo || user?.username || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const ir = (tab, pantalla) => navigation.navigate(tab, pantalla ? { screen: pantalla, initial: false } : undefined);
  const irOrden = (id) => navigation.navigate("Servicio", { screen: "ServicioDetalle", params: { id }, initial: false });
  const confirmarSalida = () => mostrarDialogo({
    tono: "peligro", icono: "log-out-outline", titulo: "Cerrar sesión", mensaje: "¿Seguro que quieres salir de tu cuenta?",
    acciones: [{ texto: "Salir", tipo: "peligro", icono: "log-out-outline", onPress: logout }, { texto: "Cancelar", tipo: "secundario" }],
  });

  // Derivados para las gráficas
  const porStatus = Object.fromEntries(GRUPOS_ESTATUS.map((g) => [g.clave, servicios.filter((s) => s.status === g.clave)]));
  const totalOrdenes = servicios.length || 1;
  const abiertas = porStatus.abierto || [];
  const porEtapa = ETAPAS.map(([k, t, c]) => ({ k, t, c, n: abiertas.filter((s) => (s.etapa || "recibido") === k).length }));
  const listas = porEtapa.find((e) => e.k === "listo_entrega")?.n || 0;
  const maxMes = Math.max(1, ...mensuales.map((m) => Number(m[metrica]) || 0));
  const totalMes = mensuales.reduce((a, m) => a + (Number(m[metrica]) || 0), 0);
  const bajos = [...refacciones]
    .filter((r) => (r.cantidad_refaccion ?? 0) <= (r.umbral_naranja ?? 4))
    .sort((a, b) => (a.cantidad_refaccion ?? 0) - (b.cantidad_refaccion ?? 0))
    .slice(0, 5);
  const listaGrupo = porStatus[grupo] || [];
  const fecha = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: 52, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.petrol500} colors={[colors.petrol500]} />}
    >
      {/* Encabezado */}
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => navigation.getParent("RootDrawer")?.openDrawer()} hitSlop={10} accessibilityLabel="Abrir menú" style={styles.menuBoton}>
          <Ionicons name="menu" size={24} color={colors.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.saludo}>{saludo()}{nombre ? `, ${nombre}` : ""}</Text>
          <Text style={styles.fecha}>{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</Text>
        </View>
        <TouchableOpacity onPress={confirmarSalida} style={styles.avatar} hitSlop={8} accessibilityLabel="Cerrar sesión">
          <Text style={styles.avatarTexto}>{iniciales}</Text>
        </TouchableOpacity>
      </View>

      {!data ? (
        <Text style={styles.vacioTexto}>Cargando…</Text>
      ) : (
        <>
          {/* Botón principal: orden rápida */}
          {hasPermission("servicios.crear") && (
            <TouchableOpacity style={styles.heroOrden} onPress={() => ir("Servicio", "NuevaOrden")} activeOpacity={0.85} accessibilityLabel="Nueva orden de servicio">
              <View style={styles.heroOrdenIcono}><Ionicons name="add" size={38} color={colors.paper100} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroOrdenTitulo}>Nueva orden</Text>
                <Text style={styles.heroOrdenSub}>Toca aquí para abrir una orden rápida</Text>
              </View>
              <Ionicons name="arrow-forward" size={28} color={colors.paper100} />
            </TouchableOpacity>
          )}

          {/* Hero: lo que importa hoy */}
          <View style={[styles.hero, { backgroundColor: colors.sidebarBg }]}>
            <View style={[styles.circulo, { backgroundColor: alfa(colors.petrol500, 0.22), width: 180, height: 180, right: -50, top: -60 }]} />
            <View style={[styles.circulo, { backgroundColor: alfa(colors.petrol500, 0.12), width: 120, height: 120, right: 60, bottom: -70 }]} />
            {hasPermission("dashboard.ver_por_cobrar") ? (
              <>
                <Text style={[styles.heroEtiqueta, { color: colors.sidebarTextoTenue }]}>POR COBRAR</Text>
                <TouchableOpacity onPress={() => ir("Servicio", "HistorialServicios")} activeOpacity={0.8}>
                  <Text style={[styles.heroMonto, { color: data.saldo_pendiente_clientes > 0 ? colors.petrol300 : colors.sidebarTexto }]} numberOfLines={1} adjustsFontSizeToFit>
                    {fmt(data.saldo_pendiente_clientes)}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.heroEtiqueta, { color: colors.sidebarTextoTenue }]}>ÓRDENES ABIERTAS</Text>
                <TouchableOpacity onPress={() => ir("Servicio", "HistorialServicios")} activeOpacity={0.8}>
                  <Text style={[styles.heroMonto, { color: colors.sidebarTexto }]} numberOfLines={1} adjustsFontSizeToFit>
                    {data.servicios_abiertos}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            <View style={[styles.heroFila, { borderTopColor: alfa(colors.sidebarTexto, 0.12) }]}>
              {[
                ["construct", data.servicios_abiertos, "abiertas", () => ir("Servicio", "HistorialServicios")],
                ["checkmark-done", listas, "listas p/ entregar", () => ir("Servicio", "HistorialServicios")],
                ["calendar", data.servicios_este_mes, "este mes", () => ir("Servicio", "HistorialServicios")],
              ].map(([ic, n, t, fn]) => (
                <TouchableOpacity key={t} style={styles.heroDato} onPress={fn}>
                  <Ionicons name={ic} size={15} color={colors.petrol300} />
                  <Text style={[styles.heroNumero, { color: colors.sidebarTexto }]}>{n}</Text>
                  <Text style={[styles.heroTexto, { color: colors.sidebarTextoTenue }]} numberOfLines={1}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Accesos rápidos */}
          {(hasPermission("clientes.crear") || hasPermission("cotizaciones.ver") || hasPermission("refacciones.ver")) && (
            <View style={styles.acciones}>
              {hasPermission("clientes.crear") && <Accion icono="person-add-outline" texto="Registrar cliente" onPress={() => ir("Clientes", "ClienteForm")} />}
              {hasPermission("cotizaciones.ver") && <Accion icono="document-text-outline" texto="Cotizar" onPress={() => ir("Más", "Cotizaciones")} />}
              {hasPermission("refacciones.ver") && <Accion icono="cube-outline" texto="Inventario" onPress={() => ir("Refacciones")} />}
            </View>
          )}

          {/* KPIs */}
          <View style={styles.grid}>
            {hasPermission("clientes.ver") && (
              <Kpi icono="people" label="Clientes activos" value={data.total_clientes} onPress={() => ir("Clientes")} />
            )}
            {hasPermission("vehiculos.ver") && (
              <Kpi icono="car-sport" label="Vehículos registrados" value={data.total_vehiculos} tono="blue600" onPress={() => navigation.navigate("Vehículos")} />
            )}
            {hasPermission("refacciones.ver") && (
              <Kpi icono="alert-circle" label="Refacciones con poco stock" value={data.refacciones_bajo_stock} tono="teal600" alerta={data.refacciones_bajo_stock > 0} onPress={() => ir("Refacciones")} />
            )}
            {hasPermission("proveedores.ver") && (
              <Kpi icono="business" label="Deuda con proveedores" value={fmt(data.deuda_con_proveedores)} tono="teal600" alerta={data.deuda_con_proveedores > 0} onPress={() => ir("Más", "Proveedores")} />
            )}
            {data.solicitudes_recuperacion_pendientes > 0 && hasPermission("usuarios.ver") && (
              <Kpi icono="key" label="Solicitudes de acceso" value={data.solicitudes_recuperacion_pendientes} alerta onPress={() => ir("Más", "Usuarios")} />
            )}
          </View>

          {/* En el taller ahora: barra apilada por etapa */}
          {hasPermission("servicios.ver") && (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.h2}>En el taller ahora</Text>
              <Text style={styles.panelDato}>{abiertas.length} {abiertas.length === 1 ? "vehículo" : "vehículos"}</Text>
            </View>
            <View style={styles.apilada}>
              {abiertas.length ? porEtapa.filter((e) => e.n).map((e) => (
                <View key={e.k} style={{ flex: e.n, backgroundColor: colors[e.c] }} />
              )) : <View style={{ flex: 1, backgroundColor: colors.ink300 }} />}
            </View>
            <View style={styles.leyenda}>
              {porEtapa.map((e) => (
                <View key={e.k} style={[styles.leyendaItem, !e.n && { opacity: 0.45 }]}>
                  <View style={[styles.leyendaPunto, { backgroundColor: colors[e.c] }]} />
                  <Text style={styles.leyendaTexto}>{e.t}</Text>
                  <Text style={styles.leyendaNumero}>{e.n}</Text>
                </View>
              ))}
            </View>
          </View>
          )}

          {/* Órdenes por estado */}
          {hasPermission("servicios.ver") && (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.h2}>Órdenes por estado</Text>
              <TouchableOpacity onPress={() => ir("Servicio", "HistorialServicios")} hitSlop={8}>
                <Text style={styles.link}>Ver todas</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.proporcion}>
              {GRUPOS_ESTATUS.map((g) => (porStatus[g.clave]?.length ? <View key={g.clave} style={{ flex: porStatus[g.clave].length, backgroundColor: colors[g.color] }} /> : null))}
              {!servicios.length ? <View style={{ flex: 1, backgroundColor: colors.ink300 }} /> : null}
            </View>
            <View style={styles.segmentado}>
              {GRUPOS_ESTATUS.map((g) => {
                const activo = grupo === g.clave;
                const n = porStatus[g.clave]?.length || 0;
                return (
                  <TouchableOpacity key={g.clave} style={[styles.segmento, activo && { backgroundColor: alfa(colors[g.color], 0.18) }]} onPress={() => setGrupo(g.clave)}>
                    <Text style={[styles.segmentoNumero, { color: activo ? colors[g.color] : colors.ink900 }]}>{n}</Text>
                    <Text style={[styles.segmentoTexto, activo && { color: colors[g.color] }]}>{g.etiqueta} · {Math.round((n / totalOrdenes) * 100)}%</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {listaGrupo.length === 0 ? <Text style={styles.vacioTexto}>Sin órdenes en este estado.</Text> : listaGrupo.slice(0, 5).map((s, i) => {
              const etapa = ETAPAS.find(([k]) => k === (s.etapa || "recibido"));
              const col = grupo === "abierto" ? colors[etapa?.[2] || "petrol500"] : colors[GRUPOS_ESTATUS.find((g) => g.clave === grupo).color];
              return (
                <TouchableOpacity key={s.id_servicio} style={[styles.orden, i > 0 && styles.divisor]} onPress={() => irOrden(s.id_servicio)}>
                  <View style={[styles.ordenBarra, { backgroundColor: col }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ordenTitulo} numberOfLines={1}>#{s.id_servicio} · {s.nombre_servicio}</Text>
                    <Text style={styles.ordenSub} numberOfLines={1}>
                      {s.cliente?.nombre_cliente || "—"} · {s.vehiculo?.placas_vehiculo || "sin placas"} · {new Date(s.fecha_entrada_servicio).toLocaleDateString("es-MX")}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    {hasPermission("servicios.ver_precios") && s.costos?.total ? <Text style={styles.ordenMonto}>{fmt(s.costos.total)}</Text> : null}
                    {grupo === "abierto" ? <View style={[styles.chip, { backgroundColor: alfa(col, 0.16) }]}><Text style={[styles.chipTexto, { color: col }]}>{ETIQUETA_ETAPA[s.etapa] || "Recibido"}</Text></View> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
            {listaGrupo.length > 5 ? (
              <TouchableOpacity onPress={() => ir("Servicio", "HistorialServicios")} style={styles.masOrdenes}>
                <Text style={styles.link}>Ver {listaGrupo.length - 5} más</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          )}

          {/* Últimos 6 meses */}
          {hasPermission("servicios.ver") && mensuales.length > 0 && (
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View>
                  <Text style={styles.h2}>Últimos 6 meses</Text>
                  <Text style={styles.panelDato}>{metrica === "ingresos" ? `${fmt(totalMes)} facturado` : `${totalMes} órdenes`}</Text>
                </View>
                <View style={styles.toggle}>
                  {(hasPermission("servicios.ver_precios") ? [["cantidad", "Órdenes"], ["ingresos", "Ingresos"]] : [["cantidad", "Órdenes"]]).map(([k, t]) => (
                    <TouchableOpacity key={k} style={[styles.toggleOp, metrica === k && styles.toggleOpActiva]} onPress={() => setMetrica(k)}>
                      <Text style={[styles.toggleTexto, metrica === k && styles.toggleTextoActiva]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.grafica}>
                {mensuales.map((m, i) => {
                  const v = Number(m[metrica]) || 0;
                  const actual = i === mensuales.length - 1;
                  return (
                    <View key={m.mes} style={styles.columna}>
                      <Text style={[styles.columnaValor, actual && { color: colors.petrol600 }]} numberOfLines={1}>{metrica === "ingresos" ? fmtCorto(v) : v}</Text>
                      <View style={styles.columnaRiel}>
                        <View style={[styles.columnaBarra, { height: `${Math.max(4, (v / maxMes) * 100)}%`, backgroundColor: actual ? colors.petrol500 : alfa(colors.petrol500, 0.35) }]} />
                      </View>
                      <Text style={[styles.columnaMes, actual && { color: colors.ink900, fontWeight: "700" }]}>{m.mes.split(" ")[0]}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Refacciones por agotarse */}
          {hasPermission("refacciones.ver") && (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.h2}>Refacciones por agotarse</Text>
              <TouchableOpacity onPress={() => ir("Refacciones")} hitSlop={8}><Text style={styles.link}>Inventario</Text></TouchableOpacity>
            </View>
            {bajos.length === 0 ? (
              <View style={styles.todoBien}>
                <Ionicons name="checkmark-circle" size={20} color={colors.teal600} />
                <Text style={styles.todoBienTexto}>Todo el inventario está por encima de su mínimo.</Text>
              </View>
            ) : bajos.map((r) => {
              const cant = r.cantidad_refaccion ?? 0;
              const rojo = cant <= (r.umbral_rojo ?? 1);
              const col = rojo ? colors.red600 : colors.warn600;
              const tope = Math.max(r.umbral_naranja ?? 4, 1) * 2;
              return (
                <View key={r.id_refaccion} style={styles.stockFila}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stockNombre} numberOfLines={1}>{r.nombre_refaccion}</Text>
                    <View style={styles.stockRiel}><View style={[styles.stockBarra, { width: `${Math.max(4, Math.min(100, (cant / tope) * 100))}%`, backgroundColor: col }]} /></View>
                  </View>
                  <Text style={[styles.stockCant, { color: col }]}>{cant} pza</Text>
                </View>
              );
            })}
          </View>
          )}

          {/* Próximos a dar servicio */}
          {hasPermission("clientes.ver") && proximos.length > 0 && (
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.h2}>Próximos a dar servicio</Text>
                <Text style={styles.panelDato}>{proximos.length}</Text>
              </View>
              <Text style={styles.ayuda}>Vehículos que ya pasaron su intervalo de servicio.</Text>
              {proximos.map((p, i) => (
                <View key={p.id_vehiculo} style={[styles.orden, i > 0 && styles.divisor]}>
                  <View style={[styles.kpiIcono, { backgroundColor: alfa(colors.warn600, 0.16) }]}><Ionicons name="time-outline" size={17} color={colors.warn600} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ordenTitulo}>{p.nombre_cliente}</Text>
                    <Text style={styles.ordenSub}>{p.placas_vehiculo || p.numero_cuenta_vehiculo} · hace {Math.floor(p.dias_desde_ultimo_servicio / 30)} meses{p.telefono1 ? ` · ${p.telefono1}` : ""}</Text>
                  </View>
                  {hasPermission("clientes.editar") && (
                    <TouchableOpacity style={styles.botonChico} onPress={() => marcarContactado(p)}>
                      <Text style={styles.botonChicoTexto}>Ya lo contacté</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  topbar: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  menuBoton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper100 },
  saludo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 26, color: colors.ink900, lineHeight: 28 },
  fecha: { fontSize: 13, color: colors.ink500, marginTop: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  avatarTexto: { fontFamily: "Inter_700Bold", color: colors.petrol600, fontSize: 14 },
  vacioTexto: { color: colors.ink500, fontSize: 14, textAlign: "center", paddingVertical: 20 },
  hero: { borderRadius: 22, padding: 20, overflow: "hidden", marginBottom: 16 },
  circulo: { position: "absolute", borderRadius: 999 },
  heroEtiqueta: { fontSize: 11.5, fontWeight: "700", letterSpacing: 1.4 },
  heroMonto: { fontFamily: "BarlowCondensed_700Bold", fontSize: 46, lineHeight: 50, marginTop: 2 },
  heroFila: { flexDirection: "row", marginTop: 16, paddingTop: 14, borderTopWidth: 1 },
  heroDato: { flex: 1, gap: 2 },
  heroNumero: { fontFamily: "BarlowCondensed_700Bold", fontSize: 26, lineHeight: 28 },
  heroTexto: { fontSize: 11.5 },
  heroOrden: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.petrol600, borderRadius: 22, paddingVertical: 18, paddingHorizontal: 18, marginBottom: 16, shadowColor: colors.petrol600, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  heroOrdenIcono: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  heroOrdenTitulo: { fontSize: 24, fontWeight: "800", color: colors.paper100 },
  heroOrdenSub: { fontSize: 14, color: colors.paper100, opacity: 0.92, marginTop: 2 },
  acciones: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  accion: { width: "23%", alignItems: "center", gap: 7 },
  accionIcono: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  accionTexto: { fontSize: 14, fontWeight: "600", color: colors.ink700, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, marginBottom: 16 },
  kpi: { width: "48.3%", backgroundColor: colors.paper100, borderRadius: 16, padding: 14, gap: 4 },
  kpiTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  kpiIcono: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  punto: { width: 9, height: 9, borderRadius: 5 },
  kpiValor: { fontFamily: "BarlowCondensed_700Bold", fontSize: 30, color: colors.ink900, lineHeight: 32 },
  kpiLabel: { fontSize: 12.5, fontWeight: "500", color: colors.ink500 },
  panel: { backgroundColor: colors.paper100, borderRadius: 18, padding: 16, marginBottom: 16 },
  panelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  h2: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 21, color: colors.ink900 },
  panelDato: { fontSize: 12.5, fontWeight: "600", color: colors.ink500 },
  link: { fontSize: 13, fontWeight: "600", color: colors.petrol600 },
  ayuda: { fontSize: 12.5, color: colors.ink500, marginTop: -6, marginBottom: 4 },
  apilada: { flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", gap: 2 },
  leyenda: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, rowGap: 8 },
  leyendaItem: { width: "50%", flexDirection: "row", alignItems: "center", gap: 7, paddingRight: 10 },
  leyendaPunto: { width: 10, height: 10, borderRadius: 3 },
  leyendaTexto: { flex: 1, fontSize: 15, color: colors.ink700 },
  leyendaNumero: { fontSize: 16.5, fontWeight: "700", color: colors.ink900 },
  proporcion: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2, marginBottom: 10 },
  segmentado: { flexDirection: "row", gap: 6, marginBottom: 6 },
  segmento: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 12 },
  segmentoNumero: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24, lineHeight: 26 },
  segmentoTexto: { fontSize: 13.5, fontWeight: "600", color: colors.ink500 },
  orden: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  divisor: { borderTopWidth: 1, borderTopColor: colors.linea },
  ordenBarra: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  ordenTitulo: { fontSize: 14.5, fontWeight: "600", color: colors.ink900 },
  ordenSub: { fontSize: 12.5, color: colors.ink500, marginTop: 2 },
  ordenMonto: { fontSize: 13.5, fontWeight: "700", color: colors.ink900 },
  chip: { borderRadius: 100, paddingVertical: 3, paddingHorizontal: 9 },
  chipTexto: { fontSize: 11, fontWeight: "700" },
  masOrdenes: { alignItems: "center", paddingTop: 8 },
  toggle: { flexDirection: "row", backgroundColor: colors.paper0, borderRadius: 10, padding: 3 },
  toggleOp: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  toggleOpActiva: { backgroundColor: colors.petrol500 },
  toggleTexto: { fontSize: 12, fontWeight: "600", color: colors.ink700 },
  toggleTextoActiva: { color: colors.paper100 },
  grafica: { flexDirection: "row", height: 170, gap: 8, marginTop: 4 },
  columna: { flex: 1, alignItems: "center" },
  columnaValor: { fontSize: 14.5, fontWeight: "700", color: colors.ink700, marginBottom: 4 },
  columnaRiel: { flex: 1, width: "100%", justifyContent: "flex-end", borderRadius: 8, backgroundColor: colors.paper0, overflow: "hidden" },
  columnaBarra: { width: "100%", borderRadius: 8 },
  columnaMes: { fontSize: 14, color: colors.ink500, marginTop: 6 },
  todoBien: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  todoBienTexto: { flex: 1, fontSize: 13.5, color: colors.ink700 },
  stockFila: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  stockNombre: { fontSize: 16, fontWeight: "600", color: colors.ink900, marginBottom: 6 },
  stockRiel: { height: 6, borderRadius: 3, backgroundColor: colors.paper0, overflow: "hidden" },
  stockBarra: { height: "100%", borderRadius: 3 },
  stockCant: { fontSize: 16.5, fontWeight: "700", minWidth: 50, textAlign: "right" },
  botonChico: { backgroundColor: colors.paper0, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
  botonChicoTexto: { fontSize: 12, fontWeight: "600", color: colors.ink900 },
});
