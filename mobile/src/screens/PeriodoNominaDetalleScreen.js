import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api, getToken, API_URL } from "../api";
import ScrollCampos from "../ui/ScrollCampos";
import { colors, spacing } from "../theme";
import { useAuth } from "../context/AuthContext";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";
import { useActualizacionGlobal } from "../useActualizacionGlobal";

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
      faltas: t(r.faltas), horas_extra: t(r.horas_extra), comisiones: t(r.comisiones),
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
        faltas: n(f.faltas), horas_extra: n(f.horas_extra), comisiones: n(f.comisiones),
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
    try {
      const token = await getToken();
      const nombre = `recibo-nomina-${r.id_recibo}.pdf`;
      const res = await FileSystem.downloadAsync(`${API_URL}/nomina/recibos/${r.id_recibo}/pdf`, `${FileSystem.cacheDirectory}${nombre}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status !== 200) throw new Error("No se pudo generar el recibo.");
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri, { mimeType: "application/pdf" });
    } catch (err) {
      alerta("Recibo", err.message);
    }
  }

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

  if (!periodo) return <View style={styles.screen} />;

  const total = (periodo.recibos || []).reduce((a, r) => a + (r.total_pagar || 0), 0);
  const pendiente = (periodo.recibos || []).filter((r) => !r.pagado).reduce((a, r) => a + (r.total_pagar || 0), 0);
  const retenciones = (periodo.recibos || []).reduce((a, r) => a + ((r.isr || 0) - (r.subsidio || 0)) + (r.imss || 0), 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md }} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}>
      <View style={styles.resumen}>
        <Text style={styles.resumenEtiqueta}>Neto a pagar</Text>
        <Text style={styles.resumenValor}>{fmt(total)}</Text>
        <Text style={styles.resumenSub}>{(periodo.recibos || []).length} recibo(s) · Retenciones {fmt(retenciones)} · {periodo.status === "pagado" ? "pagado" : "abierto"}</Text>
      </View>
      {puedeEditar && periodo.status !== "pagado" && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <TouchableOpacity onPress={recalcular} style={[styles.botonChico, { flex: 1, alignItems: "center", paddingVertical: 10 }]}><Text style={styles.botonChicoTexto}>Recalcular</Text></TouchableOpacity>
          <TouchableOpacity onPress={pagarTodo} disabled={pendiente <= 0} style={[styles.botonChico, styles.botonChicoPrincipal, { flex: 2, alignItems: "center", paddingVertical: 10 }]}>
            <Text style={[styles.botonChicoTexto, { color: colors.paper0 }]}>Pagar todo ({fmt(pendiente)})</Text>
          </TouchableOpacity>
        </View>
      )}

      {(periodo.recibos || []).length === 0 ? (
        <Text style={styles.vacio}>No hay empleados con sueldo base configurado.</Text>
      ) : periodo.recibos.map((r) => (
        <View key={r.id_recibo} style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nombre}>{r.empleado ? `${r.empleado.nombre} ${r.empleado.paterno || ""}`.trim() : `Empleado #${r.id_empleado}`}</Text>
            <Text style={styles.linea}>Sueldo: {fmt(r.sueldo_base)}</Text>
            {r.descuento_faltas > 0 && <Text style={[styles.linea, { color: colors.red600 }]}>Faltas ({r.faltas}): -{fmt(r.descuento_faltas)}</Text>}
            {r.pago_horas_extra > 0 && <Text style={[styles.linea, { color: colors.teal600 }]}>Horas extra: +{fmt(r.pago_horas_extra)}</Text>}
            {r.comisiones > 0 && <Text style={[styles.linea, { color: colors.teal600 }]}>Comisiones: +{fmt(r.comisiones)}</Text>}
            {r.destajo > 0 && <Text style={[styles.linea, { color: colors.teal600 }]}>Destajo: +{fmt(r.destajo)}{r.destajo_nota ? ` (${r.destajo_nota})` : ""}</Text>}
            {r.bonos > 0 && <Text style={[styles.linea, { color: colors.teal600 }]}>Bono: +{fmt(r.bonos)}{r.bonos_nota ? ` (${r.bonos_nota})` : ""}</Text>}
            {(r.isr - r.subsidio) > 0 && <Text style={[styles.linea, { color: colors.red600 }]}>ISR: -{fmt(r.isr - r.subsidio)}</Text>}
            {r.imss > 0 && <Text style={[styles.linea, { color: colors.red600 }]}>IMSS: -{fmt(r.imss)}</Text>}
            {r.prestamo > 0 && <Text style={[styles.linea, { color: colors.red600 }]}>Préstamo: -{fmt(r.prestamo)}</Text>}
            {r.deducciones > 0 && <Text style={[styles.linea, { color: colors.red600 }]}>Otras deducciones: -{fmt(r.deducciones)}{r.deducciones_nota ? ` (${r.deducciones_nota})` : ""}</Text>}
            <Text style={styles.total}>{fmt(r.total_pagar)}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <TouchableOpacity onPress={() => compartirRecibo(r)} style={styles.botonChico}><Text style={styles.botonChicoTexto}>Recibo PDF</Text></TouchableOpacity>
            {r.pagado ? (
              <TouchableOpacity disabled={!puedeEditar} onPress={() => reabrir(r)} activeOpacity={0.7} style={[styles.badgePagado, { flexDirection: "row", alignItems: "center", gap: 4 }]}>
                <Ionicons name="checkmark-circle" size={15} color={colors.teal600} />
                <Text style={styles.badgePagadoTexto}>Pagado</Text>
                {puedeEditar && <Ionicons name="chevron-down" size={14} color={colors.teal600} />}
              </TouchableOpacity>
            ) : (
              puedeEditar && (
                <>
                  <TouchableOpacity onPress={() => abrirEditar(r)} style={styles.botonChico}>
                    <Text style={styles.botonChicoTexto}>Ajustar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => marcarPagado(r)} style={[styles.botonChico, styles.botonChicoPrincipal]}>
                    <Text style={[styles.botonChicoTexto, { color: colors.paper0 }]}>Marcar pagado</Text>
                  </TouchableOpacity>
                </>
              )
            )}
          </View>
        </View>
      ))}

      <Modal visible={!!editando} transparent animationType="slide" onRequestClose={() => setEditando(null)}>
        <View style={styles.modalFondo}>
          <View style={styles.modalHoja}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Ajustar recibo</Text>
              <TouchableOpacity onPress={() => setEditando(null)} hitSlop={10}><Ionicons name="close" size={22} color={colors.ink700} /></TouchableOpacity>
            </View>
            <ScrollCampos style={{ maxHeight: 460 }}>
            <Text style={styles.campoLabel}>Faltas (días)</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={f.faltas} onChangeText={(v) => setF((x) => ({ ...x, faltas: v }))} />
            <Text style={styles.campoLabel}>Horas extra (se pagan dobles)</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={f.horas_extra} onChangeText={(v) => setF((x) => ({ ...x, horas_extra: v }))} />
            <Text style={styles.campoLabel}>Comisiones por órdenes</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={f.comisiones} onChangeText={(v) => setF((x) => ({ ...x, comisiones: v }))} />
            <Text style={styles.campoLabel}>Destajo / trabajos</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={f.destajo} onChangeText={(v) => setF((x) => ({ ...x, destajo: v }))} />
            <Text style={styles.campoLabel}>Detalle del destajo (opcional)</Text>
            <TextInput style={styles.input} value={f.destajo_nota} onChangeText={(v) => setF((x) => ({ ...x, destajo_nota: v }))} />
            <Text style={styles.campoLabel}>Bono</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={f.bonos} onChangeText={(v) => setF((x) => ({ ...x, bonos: v }))} />
            <Text style={styles.campoLabel}>Nota del bono (opcional)</Text>
            <TextInput style={styles.input} value={f.bonos_nota} onChangeText={(v) => setF((x) => ({ ...x, bonos_nota: v }))} />
            <Text style={styles.campoLabel}>Descuento por préstamo / adelanto</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={f.prestamo} onChangeText={(v) => setF((x) => ({ ...x, prestamo: v }))} />
            <Text style={styles.campoLabel}>Nota del préstamo (opcional)</Text>
            <TextInput style={styles.input} value={f.prestamo_nota} onChangeText={(v) => setF((x) => ({ ...x, prestamo_nota: v }))} />
            <Text style={styles.campoLabel}>Otras deducciones</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={f.deducciones} onChangeText={(v) => setF((x) => ({ ...x, deducciones: v }))} />
            <Text style={styles.campoLabel}>Nota de la deducción (opcional)</Text>
            <TextInput style={styles.input} value={f.deducciones_nota} onChangeText={(v) => setF((x) => ({ ...x, deducciones_nota: v }))} />
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
  resumen: { backgroundColor: `${colors.petrol500}22`, borderWidth: 1, borderColor: `${colors.petrol500}66`, borderRadius: 16, padding: 18, marginBottom: 16 },
  resumenEtiqueta: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, color: colors.petrol500 },
  resumenValor: { fontFamily: "BarlowCondensed_700Bold", fontSize: 40, color: colors.ink900 },
  resumenSub: { fontSize: 14, marginTop: 2, color: colors.ink700 },
  vacio: { color: colors.ink500, textAlign: "center", marginTop: 30 },
  card: { flexDirection: "row", backgroundColor: colors.paper100, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.ink300 },
  nombre: { fontWeight: "700", fontSize: 15, color: colors.ink900, marginBottom: 2 },
  linea: { fontSize: 13, color: colors.ink700 },
  total: { fontFamily: "BarlowCondensed_700Bold", fontSize: 19, color: colors.ink900, marginTop: 4 },
  badgePagado: { backgroundColor: colors.teal100, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgePagadoTexto: { color: colors.teal600, fontSize: 12, fontWeight: "700" },
  botonChico: { backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  botonChicoPrincipal: { backgroundColor: colors.petrol600, borderColor: colors.petrol600 },
  botonChicoTexto: { fontSize: 12.5, fontWeight: "700", color: colors.ink900 },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalHoja: { backgroundColor: colors.paper0, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitulo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 20, color: colors.ink900 },
  campoLabel: { fontSize: 12.5, color: colors.ink700, marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: colors.ink900 },
  botonGuardar: { backgroundColor: colors.petrol600, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 18 },
  botonGuardarTexto: { color: colors.paper0, fontWeight: "700", fontSize: 15 },
});
