import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, RefreshControl, LayoutAnimation, Platform, UIManager } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "../ui/IconoWeb";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api, getToken, API_URL } from "../api";
import ScrollCampos from "../ui/ScrollCampos";
import { colors, spacing } from "../theme";
import { useAuth } from "../context/AuthContext";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";
import { useActualizacionGlobal } from "../useActualizacionGlobal";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (s) => { const m = String(s || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]} ${MESES[Number(m[2]) - 1]} ${m[1]}` : String(s || ""); };
const DIAS_PAGO = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const iniciales = (e) => `${(e?.nombre || "?")[0]}${(e?.paterno || "")[0] || ""}`.toUpperCase();
const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PeriodoNominaDetalleScreen({ route, navigation }) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const puedeEditar = hasPermission("nomina.editar");
  const [periodo, setPeriodo] = useState(null);
  const [refrescando, setRefrescando] = useState(false);
  const [editando, setEditando] = useState(null); // recibo en edición
  const [f, setF] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [abiertos, setAbiertos] = useState({}); // recibos con el desglose desplegado
  const [compartiendo, setCompartiendo] = useState(null);

  async function cargar() {
    const data = await api.get(`/nomina/periodos/${id}`);
    setPeriodo(data);
    navigation.setOptions({ title: `${data.fecha_inicio} — ${data.fecha_fin}` });
  }

  useFocusEffect(
    useCallback(() => {
      cargar().catch((err) => alerta("Error", err.message));
    }, [id])
  );
  useActualizacionGlobal("nomina", () => cargar().catch(() => {}));

  async function refrescar() {
    setRefrescando(true);
    await cargar().catch(() => {});
    setRefrescando(false);
  }

  function abrirEditar(r) {
    setEditando(r);
    const t = (v) => String(v || 0);
    setF({
      sueldo_base: t(r.sueldo_base), faltas: t(r.faltas), horas_extra: t(r.horas_extra), comisiones: t(r.comisiones),
      destajo: t(r.destajo), destajo_nota: r.destajo_nota || "",
      bonos: t(r.bonos), bonos_nota: r.bonos_nota || "",
      prestamo: t(r.prestamo), prestamo_nota: r.prestamo_nota || "",
      deducciones: t(r.deducciones), deducciones_nota: r.deducciones_nota || "",
    });
  }

  async function guardarAjuste() {
    setGuardando(true);
    try {
      const n = (v) => Number(String(v).replace(",", ".")) || 0;
      await api.put(`/nomina/recibos/${editando.id_recibo}`, {
        sueldo_base: n(f.sueldo_base), faltas: n(f.faltas), horas_extra: n(f.horas_extra), comisiones: n(f.comisiones),
        destajo: n(f.destajo), destajo_nota: f.destajo_nota || null,
        bonos: n(f.bonos), bonos_nota: f.bonos_nota || null,
        prestamo: n(f.prestamo), prestamo_nota: f.prestamo_nota || null,
        deducciones: n(f.deducciones), deducciones_nota: f.deducciones_nota || null,
      });
      setEditando(null);
      await cargar();
    } catch (err) {
      alerta("No se pudo guardar", err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function recalcular() {
    try { setPeriodo(await api.post(`/nomina/periodos/${id}/recalcular`, {})); } catch (err) { alerta("No se pudo recalcular", err.message); }
  }

  async function pagarTodo() {
    try { setPeriodo(await api.post(`/nomina/periodos/${id}/pagar`, {})); } catch (err) { alerta("No se pudo pagar", err.message); }
  }

  async function compartirRecibo(r) {
    if (compartiendo) return;
    setCompartiendo(r.id_recibo);
    try {
      const token = await getToken();
      const nombre = `recibo-nomina-${r.id_recibo}.pdf`;
      const res = await FileSystem.downloadAsync(`${API_URL}/nomina/recibos/${r.id_recibo}/pdf`, `${FileSystem.cacheDirectory}${nombre}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status !== 200) throw new Error("No se pudo generar el recibo.");
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri, { mimeType: "application/pdf", dialogTitle: "Enviar recibo de nómina por WhatsApp", UTI: "com.adobe.pdf" });
    } catch (err) {
      alerta("Recibo", err.message);
    } finally {
      setCompartiendo(null);
    }
  }

  const alternar = (idR) => { LayoutAnimation.configureNext(LayoutAnimation.create(180, "easeInEaseOut", "opacity")); setAbiertos((p) => ({ ...p, [idR]: !p[idR] })); };

  async function marcarPagado(recibo) {
    try {
      await api.post(`/nomina/recibos/${recibo.id_recibo}/pagar`, {});
      await cargar();
    } catch (err) {
      alerta("No se pudo marcar como pagado", err.message);
    }
  }

  function reabrir(recibo) {
    alerta("Cambiar estatus del pago", "Este recibo está marcado como pagado. ¿Regresarlo a pendiente?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Regresar a pendiente", onPress: async () => {
        try { await api.post(`/nomina/recibos/${recibo.id_recibo}/reabrir`, {}); await cargar(); } catch (err) { alerta("No se pudo cambiar", err.message); }
      } },
    ]);
  }

  const nombreEmp = editando?.empleado ? `${editando.empleado.nombre} ${editando.empleado.paterno || ""}`.trim() : `Empleado #${editando?.id_empleado ?? ""}`;
  const nf = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
  const totalEstimado = (() => {
    if (!editando) return 0;
    const dias = editando.dias_periodo || { semanal: 7, quincenal: 15, mensual: 30 }[periodo?.periodicidad] || 7;
    const sueldo = nf(f.sueldo_base), diario = dias ? sueldo / dias : 0;
    const desc = Math.min(nf(f.faltas) * diario, sueldo);
    const perc = sueldo - desc + nf(f.horas_extra) * (diario / 8) * 2 + nf(f.comisiones) + nf(f.destajo) + nf(f.bonos);
    const imp = (editando.isr || 0) - (editando.subsidio || 0) + (editando.imss || 0);
    return Math.max(perc - imp - nf(f.prestamo) - nf(f.deducciones), 0);
  })();
  const Num = ({ etq, k, simple }) => (
    <View style={styles.ajCampo}>
      <Text style={styles.campoLabel}>{etq}</Text>
      <View style={styles.ajInputWrap}>
        {!simple ? <Text style={styles.ajPeso}>$</Text> : null}
        <TextInput
          style={styles.ajInput} keyboardType="decimal-pad" selectTextOnFocus placeholder="0" placeholderTextColor={colors.ink500}
          onFocus={() => { if (Number(f[k]) === 0) setF((x) => ({ ...x, [k]: "" })); }}
          value={f[k]} onChangeText={(v) => setF((x) => ({ ...x, [k]: v }))}
        />
      </View>
    </View>
  );
  const Txt = ({ etq, k }) => (
    <View style={styles.ajCampo}>
      <Text style={styles.campoLabel}>{etq}</Text>
      <View style={styles.ajInputWrap}>
        <TextInput style={styles.ajInput} value={f[k]} onChangeText={(v) => setF((x) => ({ ...x, [k]: v }))} />
      </View>
    </View>
  );

  if (!periodo) return <View style={styles.screen} />;

  const recibos = periodo.recibos || [];
  const total = recibos.reduce((a, r) => a + (r.total_pagar || 0), 0);
  const pagado = recibos.filter((r) => r.pagado).reduce((a, r) => a + (r.total_pagar || 0), 0);
  const pendiente = total - pagado;
  const retenciones = recibos.reduce((a, r) => a + ((r.isr || 0) - (r.subsidio || 0)) + (r.imss || 0), 0);
  const percepcionesTot = recibos.reduce((a, r) => a + (r.sueldo_base || 0) + (r.pago_horas_extra || 0) + (r.comisiones || 0) + (r.destajo || 0) + (r.bonos || 0), 0);
  const avance = total > 0 ? Math.min(1, pagado / total) : 0;
  const cerrado = periodo.status === "pagado";
  const palabra = { semanal: "Semana", quincenal: "Quincena", mensual: "Mes" }[periodo.periodicidad] || "Periodo";
  const diaPagoTxt = (() => { const m = String(periodo.fecha_fin || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return ""; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return `${DIAS_PAGO[(d.getUTCDay() + 6) % 7]} ${fechaCorta(periodo.fecha_fin).slice(0, 6)}`; })();

  const Linea = ({ etq, valor, tono, nota }) => (
    <View style={styles.dLinea}>
      <View style={{ flex: 1 }}>
        <Text style={styles.dEtq}>{etq}</Text>
        {nota ? <Text style={styles.dNota} numberOfLines={2}>{nota}</Text> : null}
      </View>
      <Text style={[styles.dVal, tono === "mas" && { color: colors.teal600 }, tono === "menos" && { color: colors.red600 }]}>{tono === "menos" ? "−" : ""}{fmt(valor)}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}>
      <View style={styles.resumen}>
        <View style={styles.resumenTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.resumenEtiqueta}>{palabra} de pago</Text>
            <Text style={styles.resumenFechas}>{fechaCorta(periodo.fecha_inicio).slice(0, 6)} al {fechaCorta(periodo.fecha_fin)}</Text>
            <Text style={styles.resumenSub}>Se paga el {diaPagoTxt} · {recibos.length} empleado{recibos.length === 1 ? "" : "s"}</Text>
          </View>
          <View style={[styles.estado, cerrado ? { backgroundColor: colors.teal100 } : { backgroundColor: colors.warn100 }]}>
            <Text style={[styles.estadoTexto, { color: cerrado ? colors.teal600 : colors.warn600 }]}>{cerrado ? "PAGADO" : "POR PAGAR"}</Text>
          </View>
        </View>
        <Text style={styles.netoEtq}>Total a pagar</Text>
        <Text style={styles.resumenValor}>{fmt(total)}</Text>
        <View style={styles.barra}><View style={[styles.barraRelleno, { width: `${Math.round(avance * 100)}%` }]} /></View>
        <View style={styles.kpis}>
          <View style={styles.kpi}><Text style={styles.kpiEtq}>Ya pagado</Text><Text style={[styles.kpiVal, { color: colors.teal600 }]}>{fmt(pagado)}</Text></View>
          <View style={styles.kpi}><Text style={styles.kpiEtq}>Falta pagar</Text><Text style={[styles.kpiVal, pendiente > 0 && { color: colors.warn600 }]}>{fmt(pendiente)}</Text></View>
        </View>
      </View>

      {puedeEditar && !cerrado && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          <TouchableOpacity onPress={recalcular} style={styles.accionSec} activeOpacity={0.8}>
            <Ionicons name="refresh-outline" size={17} color={colors.petrol500} /><Text style={styles.accionSecTexto}>Recalcular</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={pagarTodo} disabled={pendiente <= 0} style={[styles.accionPri, pendiente <= 0 && { opacity: 0.5 }]} activeOpacity={0.85}>
            <Ionicons name="checkmark-done-outline" size={18} color={colors.sobreAcento} /><Text style={styles.accionPriTexto}>Pagar todo · {fmt(pendiente)}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.seccion}>Pago por empleado</Text>
      {recibos.length === 0 ? (
        <Text style={styles.vacio}>No hay empleados con sueldo configurado.</Text>
      ) : recibos.map((r) => {
        const abierto = !!abiertos[r.id_recibo];
        const isrNeto = Math.max(0, (r.isr || 0) - (r.subsidio || 0));
        const percep = (r.sueldo_base || 0) + (r.pago_horas_extra || 0) + (r.comisiones || 0) + (r.destajo || 0) + (r.bonos || 0);
        const deduc = (r.descuento_faltas || 0) + isrNeto + (r.imss || 0) + (r.prestamo || 0) + (r.deducciones || 0);
        return (
          <View key={r.id_recibo} style={styles.card}>
            <TouchableOpacity style={styles.cardTop} onPress={() => alternar(r.id_recibo)} activeOpacity={0.8}>
              <View style={styles.avatar}><Text style={styles.avatarTexto}>{iniciales(r.empleado)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre} numberOfLines={1}>{r.empleado ? `${r.empleado.nombre} ${r.empleado.paterno || ""}`.trim() : `Empleado #${r.id_empleado}`}</Text>
                <Text style={styles.linea} numberOfLines={1}>{r.empleado?.puesto || "Personal"}</Text>
                <Text style={styles.lineaSueldo} numberOfLines={1}>Sueldo {fmt(r.sueldo_base)}{(percep - (r.sueldo_base || 0)) > 0 ? `  ·  + ${fmt(percep - (r.sueldo_base || 0))}` : ""}{deduc > 0 ? `  ·  − ${fmt(deduc)}` : ""}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.total}>{fmt(r.total_pagar)}</Text>
                <View style={[styles.chip, r.pagado ? { backgroundColor: colors.teal100 } : { backgroundColor: colors.warn100 }]}>
                  <Text style={[styles.chipTexto, { color: r.pagado ? colors.teal600 : colors.warn600 }]}>{r.pagado ? "Pagado" : "Pendiente"}</Text>
                </View>
              </View>
              <Ionicons name={abierto ? "chevron-up-outline" : "chevron-down-outline"} size={18} color={colors.ink500} />
            </TouchableOpacity>

            {abierto && (
              <View style={styles.desglose}>
                <Text style={styles.dTitulo}>Lo que gana</Text>
                <Linea etq={`Sueldo de la ${{ semanal: "semana", quincenal: "quincena", mensual: "mes" }[periodo.periodicidad] || "periodo"}`} valor={r.sueldo_base} />
                {r.pago_horas_extra > 0 && <Linea etq={`Horas extra (${r.horas_extra} h, dobles)`} valor={r.pago_horas_extra} tono="mas" />}
                {r.comisiones > 0 && <Linea etq="Comisiones por órdenes" valor={r.comisiones} tono="mas" />}
                {r.destajo > 0 && <Linea etq="Destajo / trabajos" valor={r.destajo} tono="mas" nota={r.destajo_nota} />}
                {r.bonos > 0 && <Linea etq="Bonos" valor={r.bonos} tono="mas" nota={r.bonos_nota} />}
                <View style={styles.dSubtotal}><Text style={styles.dSubEtq}>Total ganado</Text><Text style={styles.dSubVal}>{fmt(percep)}</Text></View>

                <Text style={[styles.dTitulo, { marginTop: 12 }]}>Descuentos</Text>
                {r.descuento_faltas > 0 && <Linea etq={`Faltas (${r.faltas} día${r.faltas === 1 ? "" : "s"})`} valor={r.descuento_faltas} tono="menos" />}
                {isrNeto > 0 && <Linea etq="ISR (neto de subsidio)" valor={isrNeto} tono="menos" />}
                {r.imss > 0 && <Linea etq="IMSS (cuota obrera)" valor={r.imss} tono="menos" />}
                {r.prestamo > 0 && <Linea etq="Préstamo / adelanto" valor={r.prestamo} tono="menos" nota={r.prestamo_nota} />}
                {r.deducciones > 0 && <Linea etq="Otras deducciones" valor={r.deducciones} tono="menos" nota={r.deducciones_nota} />}
                {deduc <= 0 && <Text style={styles.dNota}>Sin descuentos.</Text>}
                <View style={styles.dSubtotal}><Text style={styles.dSubEtq}>Total descuentos</Text><Text style={[styles.dSubVal, deduc > 0 && { color: colors.red600 }]}>{deduc > 0 ? "−" : ""}{fmt(deduc)}</Text></View>

                <View style={styles.dNeto}><Text style={styles.dNetoEtq}>Total a pagar</Text><Text style={styles.dNetoVal}>{fmt(r.total_pagar)}</Text></View>
                {r.pagado && r.fecha_pago ? <Text style={styles.dNota}>Pagado el {fechaCorta(r.fecha_pago)}</Text> : null}
              </View>
            )}

            <View style={styles.acciones}>
              <TouchableOpacity onPress={() => compartirRecibo(r)} disabled={compartiendo === r.id_recibo} style={styles.btnWhats} activeOpacity={0.85}>
                <Ionicons name="logo-whatsapp" size={17} color="#fff" /><Text style={styles.btnWhatsTexto}>{compartiendo === r.id_recibo ? "Generando…" : "Enviar recibo"}</Text>
              </TouchableOpacity>
              {r.pagado ? (
                <TouchableOpacity disabled={!puedeEditar} onPress={() => reabrir(r)} style={styles.btnSec} activeOpacity={0.8}>
                  <Ionicons name="checkmark-circle-outline" size={17} color={colors.teal600} /><Text style={[styles.btnSecTexto, { color: colors.teal600 }]}>Pagado</Text>
                </TouchableOpacity>
              ) : puedeEditar ? (
                <>
                  <TouchableOpacity onPress={() => abrirEditar(r)} style={styles.btnSec} activeOpacity={0.8}>
                    <Ionicons name="create-outline" size={17} color={colors.petrol500} /><Text style={styles.btnSecTexto}>Ajustar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => marcarPagado(r)} style={styles.btnPri} activeOpacity={0.85}>
                    <Ionicons name="checkmark-outline" size={18} color={colors.sobreAcento} /><Text style={styles.btnPriTexto}>Pagar</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </View>
        );
      })}

      <Modal visible={!!editando} transparent animationType="slide" onRequestClose={() => setEditando(null)}>
        <View style={styles.modalFondo}>
          <View style={styles.modalHoja}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Ajustar recibo</Text>
              <TouchableOpacity onPress={() => setEditando(null)} hitSlop={10}><Ionicons name="close-outline" size={22} color={colors.ink700} /></TouchableOpacity>
            </View>
            {editando ? (
              <View style={styles.ajEmp}>
                <View style={styles.avatar}><Text style={styles.avatarTexto}>{(nombreEmp || "?").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ajNombre} numberOfLines={1}>{nombreEmp}</Text>
                  <Text style={styles.ajSub}>Total estimado a pagar</Text>
                </View>
                <Text style={styles.ajTotal}>{fmt(totalEstimado)}</Text>
              </View>
            ) : null}
            <ScrollCampos style={{ maxHeight: 440 }}>
              <Text style={styles.ajSeccion}>Sueldo</Text>
              {Num({ etq: `Sueldo de la ${{ semanal: "semana", quincenal: "quincena", mensual: "mes" }[periodo.periodicidad] || "periodo"}`, k: "sueldo_base" })}
              <Text style={styles.ajAyuda}>Cambia el sueldo solo para este recibo. No modifica el sueldo del empleado.</Text>

              <Text style={styles.ajSeccion}>Asistencia</Text>
              <View style={styles.ajFila}>
                {Num({ etq: "Faltas (días)", k: "faltas", simple: true })}
                {Num({ etq: "Horas extra (dobles)", k: "horas_extra", simple: true })}
              </View>

              <Text style={styles.ajSeccion}>Ingresos extra</Text>
              <View style={styles.ajFila}>
                {Num({ etq: "Comisiones", k: "comisiones" })}
                {Num({ etq: "Bono", k: "bonos" })}
              </View>
              {Txt({ etq: "Nota del bono (opcional)", k: "bonos_nota" })}
              {Num({ etq: "Destajo / trabajos", k: "destajo" })}
              {Txt({ etq: "Detalle del destajo (opcional)", k: "destajo_nota" })}

              <Text style={styles.ajSeccion}>Descuentos</Text>
              <View style={styles.ajFila}>
                {Num({ etq: "Préstamo / adelanto", k: "prestamo" })}
                {Num({ etq: "Otras deducciones", k: "deducciones" })}
              </View>
              {Txt({ etq: "Nota del préstamo (opcional)", k: "prestamo_nota" })}
              {Txt({ etq: "Nota de la deducción (opcional)", k: "deducciones_nota" })}
            </ScrollCampos>
            <TouchableOpacity style={styles.botonGuardar} onPress={guardarAjuste} disabled={guardando}>
              <Text style={styles.botonGuardarTexto}>{guardando ? "Guardando…" : "Guardar"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  resumen: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderTopWidth: 3, borderTopColor: colors.petrol500, borderRadius: 16, padding: 16, marginBottom: 14 },
  resumenTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  resumenEtiqueta: { fontSize: 11.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, color: colors.ink500 },
  resumenFechas: { fontFamily: "BarlowCondensed_700Bold", fontSize: 22, color: colors.ink900, marginTop: 2 },
  resumenSub: { fontSize: 13, marginTop: 1, color: colors.ink500 },
  estado: { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
  estadoTexto: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6 },
  netoEtq: { fontSize: 12, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.6 },
  resumenValor: { fontFamily: "BarlowCondensed_700Bold", fontSize: 42, color: colors.ink900, lineHeight: 46 },
  barra: { height: 6, borderRadius: 3, backgroundColor: colors.ink300 + "66", overflow: "hidden", marginTop: 8 },
  barraRelleno: { height: 6, borderRadius: 3, backgroundColor: colors.teal600 },
  kpis: { flexDirection: "row", gap: 8, marginTop: 14 },
  kpi: { flex: 1, backgroundColor: colors.paper0, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 10 },
  kpiEtq: { fontSize: 10.5, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiVal: { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.ink900, marginTop: 2 },
  kpisFila2: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  kpiMini: { fontSize: 12, color: colors.ink500 },
  kpiMiniVal: { fontWeight: "800", color: colors.ink700 },
  seccion: { fontSize: 12, fontWeight: "800", color: colors.ink700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, marginLeft: 2 },
  accionSec: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.petrol500, backgroundColor: colors.paper100 },
  accionSecTexto: { fontWeight: "700", color: colors.petrol500, fontSize: 14 },
  accionPri: { flex: 2, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", height: 46, borderRadius: 12, backgroundColor: colors.petrol500 },
  accionPriTexto: { fontWeight: "700", color: colors.sobreAcento, fontSize: 14.5 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  avatarTexto: { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.petrol600 },
  chip: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2, marginTop: 3 },
  chipTexto: { fontSize: 10.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  desglose: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.ink300 },
  dTitulo: { fontSize: 11.5, fontWeight: "800", color: colors.petrol600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  dLinea: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  dEtq: { fontSize: 13.5, color: colors.ink700 },
  dNota: { fontSize: 11.5, color: colors.ink500, marginTop: 1 },
  dVal: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: colors.ink900 },
  dSubtotal: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.ink300, marginTop: 4, paddingTop: 6 },
  dSubEtq: { fontSize: 13, fontWeight: "700", color: colors.ink900 },
  dSubVal: { fontFamily: "Inter_700Bold", fontSize: 14, color: colors.ink900 },
  dNeto: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.petrol100, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 },
  dNetoEtq: { fontFamily: "Inter_700Bold", fontSize: 13.5, color: colors.petrol600, textTransform: "uppercase", letterSpacing: 0.4 },
  dNetoVal: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24, color: colors.petrol600 },
  acciones: { flexDirection: "row", gap: 8, marginTop: 12 },
  btnWhats: { flex: 1.4, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", height: 42, borderRadius: 11, backgroundColor: "#25D366" },
  btnWhatsTexto: { color: "#fff", fontWeight: "700", fontSize: 13.5 },
  btnSec: { flex: 1, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center", height: 42, borderRadius: 11, borderWidth: 1.5, borderColor: colors.petrol500, backgroundColor: colors.paper100 },
  btnSecTexto: { fontWeight: "700", color: colors.petrol500, fontSize: 13.5 },
  btnPri: { flex: 1, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center", height: 42, borderRadius: 11, backgroundColor: colors.petrol500 },
  btnPriTexto: { fontWeight: "700", color: colors.sobreAcento, fontSize: 13.5 },
  vacio: { color: colors.ink500, textAlign: "center", marginTop: 30 },
  card: { backgroundColor: colors.paper100, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.ink300 },
  nombre: { fontWeight: "700", fontSize: 15, color: colors.ink900, marginBottom: 2 },
  lineaSueldo: { fontSize: 12, color: colors.ink500, marginTop: 2 },
  linea: { fontSize: 13, color: colors.ink700 },
  total: { fontFamily: "BarlowCondensed_700Bold", fontSize: 22, color: colors.ink900 },
  badgePagado: { backgroundColor: colors.teal100, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgePagadoTexto: { color: colors.teal600, fontSize: 12, fontWeight: "700" },
  botonChico: { backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  botonChicoPrincipal: { backgroundColor: colors.petrol600, borderColor: colors.petrol600 },
  botonChicoTexto: { fontSize: 12.5, fontWeight: "700", color: colors.ink900 },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalHoja: { backgroundColor: colors.paper0, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitulo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 20, color: colors.ink900 },
  ajEmp: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper100, borderRadius: 14, padding: 12, marginBottom: 4 },
  ajNombre: { fontSize: 15, fontWeight: "700", color: colors.ink900 },
  ajSub: { fontSize: 11.5, color: colors.ink500, marginTop: 1 },
  ajTotal: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24, color: colors.teal600 },
  ajSeccion: { fontSize: 11.5, fontWeight: "800", color: colors.petrol600, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 16, marginBottom: 2 },
  ajAyuda: { fontSize: 11.5, color: colors.ink500, marginTop: 6 },
  ajFila: { flexDirection: "row", gap: 10 },
  ajCampo: { flex: 1 },
  ajInputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  ajPeso: { fontSize: 15, color: colors.ink500, marginRight: 4 },
  ajInput: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  campoLabel: { fontSize: 12.5, color: colors.ink700, marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: colors.ink900 },
  botonGuardar: { backgroundColor: colors.petrol600, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 18 },
  botonGuardarTexto: { color: colors.sobreAcento, fontWeight: "700", fontSize: 15 },
});
