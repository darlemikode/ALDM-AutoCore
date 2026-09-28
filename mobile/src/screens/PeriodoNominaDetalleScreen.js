import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
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
  const [bonos, setBonos] = useState("0");
  const [bonosNota, setBonosNota] = useState("");
  const [deducciones, setDeducciones] = useState("0");
  const [deduccionesNota, setDeduccionesNota] = useState("");
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

  function abrirEditar(recibo) {
    setEditando(recibo);
    setBonos(String(recibo.bonos || 0));
    setBonosNota(recibo.bonos_nota || "");
    setDeducciones(String(recibo.deducciones || 0));
    setDeduccionesNota(recibo.deducciones_nota || "");
  }

  async function guardarAjuste() {
    setGuardando(true);
    try {
      await api.put(`/nomina/recibos/${editando.id_recibo}`, {
        bonos: Number(bonos) || 0,
        bonos_nota: bonosNota || null,
        deducciones: Number(deducciones) || 0,
        deducciones_nota: deduccionesNota || null,
      });
      setEditando(null);
      await cargar();
    } catch (err) {
      alerta("No se pudo guardar", err.message);
    } finally {
      setGuardando(false);
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

  if (!periodo) return <View style={styles.screen} />;

  const total = (periodo.recibos || []).reduce((a, r) => a + (r.total_pagar || 0), 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md }} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}>
      <View style={styles.resumen}>
        <Text style={[styles.resumenEtiqueta, { color: colors.sidebarTextoTenue }]}>Total del periodo</Text>
        <Text style={[styles.resumenValor, { color: colors.sidebarTexto }]}>{fmt(total)}</Text>
        <Text style={[styles.resumenSub, { color: colors.sidebarTextoTenue }]}>{(periodo.recibos || []).length} recibo(s) · {periodo.status === "pagado" ? "pagado" : "abierto"}</Text>
      </View>

      {(periodo.recibos || []).length === 0 ? (
        <Text style={styles.vacio}>No hay empleados con sueldo base configurado.</Text>
      ) : periodo.recibos.map((r) => (
        <View key={r.id_recibo} style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nombre}>{r.empleado ? `${r.empleado.nombre} ${r.empleado.paterno || ""}`.trim() : `Empleado #${r.id_empleado}`}</Text>
            <Text style={styles.linea}>Sueldo base: {fmt(r.sueldo_base)}</Text>
            {r.bonos > 0 && <Text style={[styles.linea, { color: colors.teal600 }]}>Bono: +{fmt(r.bonos)}{r.bonos_nota ? ` (${r.bonos_nota})` : ""}</Text>}
            {r.deducciones > 0 && <Text style={[styles.linea, { color: colors.red600 }]}>Deducción: -{fmt(r.deducciones)}{r.deducciones_nota ? ` (${r.deducciones_nota})` : ""}</Text>}
            <Text style={styles.total}>{fmt(r.total_pagar)}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            {r.pagado ? (
              <View style={styles.badgePagado}><Text style={styles.badgePagadoTexto}>Pagado</Text></View>
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
            <Text style={styles.campoLabel}>Bono</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={bonos} onChangeText={setBonos} />
            <Text style={styles.campoLabel}>Nota del bono (opcional)</Text>
            <TextInput style={styles.input} value={bonosNota} onChangeText={setBonosNota} placeholder="Ej. horas extra" />
            <Text style={styles.campoLabel}>Deducción</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={deducciones} onChangeText={setDeducciones} />
            <Text style={styles.campoLabel}>Nota de la deducción (opcional)</Text>
            <TextInput style={styles.input} value={deduccionesNota} onChangeText={setDeduccionesNota} placeholder="Ej. falta, préstamo" />
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
  resumen: { backgroundColor: colors.sidebarBg, borderRadius: 16, padding: 18, marginBottom: 16 },
  resumenEtiqueta: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  resumenValor: { fontFamily: "BarlowCondensed_700Bold", fontSize: 34 },
  resumenSub: { fontSize: 12.5, marginTop: 2 },
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
