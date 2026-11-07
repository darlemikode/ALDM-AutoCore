import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Linking } from "react-native";
import { Ionicons } from "../ui/IconoWeb";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta } from "../ui/Dialogo";
import { Picker } from "../ui/Picker";

/*
 * Servicio a domicilio de una orden: dirección, ubicación (enlace de Maps), mecánico,
 * código de 6 dígitos para el cliente y enlace para el mecánico. Sin el código no se abre la orden.
 */
const VACIO = { calle: "", numero: "", colonia: "", cp: "", ciudad: "", estado: "", referencias: "", maps_url: "", id_empleado_mecanico: "" };
const wa = (tel, texto) => {
  const d = String(tel || "").replace(/\D/g, "").slice(-10);
  return `https://wa.me/${d.length === 10 ? `52${d}` : ""}?text=${encodeURIComponent(texto)}`;
};
const fecha = (iso) => (iso ? new Date(`${iso}${iso.endsWith("Z") ? "" : "Z"}`).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function DomicilioModal({ visible, idServicio, nombreServicio, nombreTaller, empleados = [], onCerrar, onCambio }) {
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [editando, setEditando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [codigo, setCodigo] = useState("");

  function aplicar(r) {
    setInfo(r);
    setEditando(!r?.existe);
    if (r?.existe) {
      setForm({
        calle: r.calle || "", numero: r.numero || "", colonia: r.colonia || "", cp: r.cp || "", ciudad: r.ciudad || "", estado: r.estado || "",
        referencias: r.referencias || "", maps_url: "", id_empleado_mecanico: r.id_empleado_mecanico || "",
      });
    }
  }
  useEffect(() => {
    if (!visible) return;
    setCargando(true); setCodigo("");
    api.get(`/servicio-domicilio/${idServicio}`).then(aplicar).catch((e) => alerta("Error", e.message || "No se pudo consultar el servicio a domicilio.")).finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, idServicio]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function accion(fn, okMsg) {
    setOcupado(true);
    try {
      const r = await fn();
      if (r) aplicar(r);
      if (okMsg) alerta("Listo", okMsg);
      onCambio?.();
      return true;
    } catch (e) {
      alerta("Error", e.message || "No se pudo completar la acción.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const guardar = () => accion(() => api.put(`/servicio-domicilio/${idServicio}`, {
    calle: form.calle || null, numero: form.numero || null, colonia: form.colonia || null, cp: form.cp || null,
    ciudad: form.ciudad || null, estado: form.estado || null, referencias: form.referencias || null,
    maps_url: form.maps_url || null, lat: null, lng: null,
    id_empleado_mecanico: form.id_empleado_mecanico ? Number(form.id_empleado_mecanico) : null,
  }), "Servicio a domicilio guardado.");

  const confirmar = (titulo, mensaje, texto, fn) => alerta(titulo, mensaje, [{ text: texto, onPress: fn }, { text: "Cancelar", style: "cancel" }]);
  const nuevoCodigo = () => confirmar("¿Código nuevo?", "El código actual dejará de servir. Dáselo de nuevo al cliente.", "Generar", () => accion(() => api.post(`/servicio-domicilio/${idServicio}/regenerar-codigo`), "Código nuevo generado."));
  const nuevoEnlace = () => confirmar("¿Enlace nuevo?", "El enlace actual dejará de funcionar. Envíale el nuevo al mecánico.", "Generar", () => accion(() => api.post(`/servicio-domicilio/${idServicio}/regenerar-enlace`), "Enlace nuevo generado."));
  const quitar = () => confirmar("¿Quitar servicio a domicilio?", "La orden volverá a ser un servicio normal, sin código ni enlace.", "Quitar", () => accion(() => api.del(`/servicio-domicilio/${idServicio}`).then(() => ({ existe: false })), "Servicio a domicilio quitado."));
  async function iniciar() {
    if (!/^\d{6}$/.test(codigo)) { alerta("Falta el código", "El código tiene 6 dígitos."); return; }
    if (await accion(() => api.post(`/servicio-domicilio/${idServicio}/iniciar`, { codigo }), "Servicio iniciado.")) setCodigo("");
  }
  const abrir = (url) => Linking.openURL(url).catch(() => alerta("Error", "No se pudo abrir el enlace."));

  const firma = nombreTaller ? `\n— ${nombreTaller}` : "";
  const textoCliente = info?.codigo ? `Hola ${info.cliente || ""}, tu servicio a domicilio quedó agendado. Cuando llegue el mecánico dale este código para que pueda iniciar: ${info.codigo}. Sin el código no podrá comenzar.${firma}` : "";
  const textoMecanico = info?.enlace ? `Servicio a domicilio: ${nombreServicio || "Servicio"}${info.direccion ? `\nDirección: ${info.direccion}` : ""}\nAbre aquí la ubicación y los datos: ${info.enlace}\nPide al cliente el código de 6 dígitos para iniciar.${firma}` : "";

  const campo = (etq, k, extra = {}) => (
    <View style={extra.estilo}>
      <Text style={styles.label}>{etq}</Text>
      <TextInput style={styles.input} value={form[k]} onChangeText={set(k)} placeholderTextColor={colors.ink500} autoCapitalize={extra.sinMayus ? "none" : "sentences"} {...extra.props} />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <KeyboardAvoidingView style={styles.fondo} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.hoja}>
          <View style={styles.header}>
            <Text style={styles.titulo}>Servicio a domicilio</Text>
            <TouchableOpacity onPress={onCerrar} hitSlop={10}><Ionicons name="close" size={24} color={colors.ink900} /></TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
            {cargando && <ActivityIndicator color={colors.petrol500} />}
            {!cargando && !editando && !!info?.existe && (
              <>
                <View style={styles.caja}>
                  <Text style={styles.cajaTitulo}>{info.direccion || "Ubicación por mapa"}</Text>
                  {!!info.referencias && <Text style={styles.meta}>{info.referencias}</Text>}
                  <Text style={styles.meta}>Mecánico: {info.mecanico || "sin asignar"} · Cliente: {info.cliente || "—"}</Text>
                  {!!info.maps_url && <TouchableOpacity onPress={() => abrir(info.maps_url)}><Text style={styles.enlaceTxt}>Abrir en el mapa</Text></TouchableOpacity>}
                </View>

                {info.iniciado_at ? (
                  <View style={styles.okCaja}><Text style={styles.okTxt}>✔ Iniciado el {fecha(info.iniciado_at)}{info.iniciado_por ? ` por ${info.iniciado_por}` : ""}.</Text></View>
                ) : (
                  <>
                    <View style={styles.codigoCaja}>
                      <Text style={styles.meta}>Código del cliente</Text>
                      <Text style={styles.codigoNum}>{info.codigo || "——"}</Text>
                      {info.codigo_bloqueado && <Text style={styles.alertaTxt}>Bloqueado por intentos fallidos. Genera un código nuevo.</Text>}
                      {!info.codigo_bloqueado && info.intentos_restantes < 5 && <Text style={styles.meta}>Intentos restantes: {info.intentos_restantes}</Text>}
                    </View>
                    <View style={styles.fila}>
                      <TouchableOpacity style={[styles.btnWa, { flex: 1 }]} onPress={() => abrir(wa(info.cliente_telefono, textoCliente))}><Ionicons name="logo-whatsapp" size={18} color="#fff" /><Text style={styles.btnWaTxt}>Código al cliente</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.btnSec} onPress={nuevoCodigo} disabled={ocupado}><Text style={styles.btnSecTxt}>Código nuevo</Text></TouchableOpacity>
                    </View>
                  </>
                )}

                {info.enlace ? (
                  <View style={styles.fila}>
                    <TouchableOpacity style={[styles.btnWa, { flex: 1 }]} onPress={() => abrir(wa(info.mecanico_telefono, textoMecanico))}><Ionicons name="logo-whatsapp" size={18} color="#fff" /><Text style={styles.btnWaTxt}>Enlace al mecánico</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.btnSec} onPress={nuevoEnlace} disabled={ocupado}><Text style={styles.btnSecTxt}>Enlace nuevo</Text></TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.btnPrim} onPress={nuevoEnlace} disabled={ocupado}><Text style={styles.btnPrimTxt}>Generar enlace</Text></TouchableOpacity>
                )}

                {!info.iniciado_at && (
                  <View style={styles.caja}>
                    <Text style={styles.label}>Iniciar aquí con el código que dicta el cliente</Text>
                    <TextInput style={[styles.input, styles.codigoInput]} value={codigo} onChangeText={(v) => setCodigo(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" placeholder="000000" placeholderTextColor={colors.ink500} editable={!info.codigo_bloqueado} maxLength={6} />
                    <TouchableOpacity style={[styles.btnPrim, (info.codigo_bloqueado || codigo.length !== 6) && { opacity: 0.5 }]} onPress={iniciar} disabled={ocupado || info.codigo_bloqueado || codigo.length !== 6}>
                      {ocupado ? <ActivityIndicator color={colors.sobreAcento} /> : <Text style={styles.btnPrimTxt}>Iniciar servicio</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {!cargando && editando && (
              <>
                <Text style={styles.meta}>El servicio no se podrá abrir hasta que el cliente dé el código que se generará al guardar.</Text>
                <View style={styles.fila}>{campo("Calle", "calle", { estilo: { flex: 2 } })}{campo("Número", "numero", { estilo: { flex: 1 } })}</View>
                <View style={styles.fila}>{campo("Colonia", "colonia", { estilo: { flex: 2 } })}{campo("C.P.", "cp", { estilo: { flex: 1 }, props: { keyboardType: "number-pad", maxLength: 10 } })}</View>
                <View style={styles.fila}>{campo("Ciudad", "ciudad", { estilo: { flex: 1 } })}{campo("Estado", "estado", { estilo: { flex: 1 } })}</View>
                {campo("Referencias", "referencias", { props: { multiline: true, maxLength: 400 } })}
                {campo("Enlace de Google Maps / Waze", "maps_url", { sinMayus: true, props: { placeholder: "https://maps.app.goo.gl/…", autoCorrect: false, keyboardType: "url" } })}
                <View>
                  <Text style={styles.label}>Mecánico que irá</Text>
                  <View style={styles.pickerCaja}>
                    <Picker selectedValue={form.id_empleado_mecanico} onValueChange={set("id_empleado_mecanico")} titulo="Mecánico">
                      <Picker.Item label="Sin asignar" value="" />
                      {empleados.map((e) => <Picker.Item key={e.id_empleado} label={`${e.nombre} ${e.paterno || ""}`.trim()} value={e.id_empleado} />)}
                    </Picker>
                  </View>
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.pie}>
            {!!info?.existe && !editando && <TouchableOpacity style={styles.btnSec} onPress={() => setEditando(true)} disabled={ocupado}><Text style={styles.btnSecTxt}>Editar</Text></TouchableOpacity>}
            {!!info?.existe && <TouchableOpacity style={styles.btnSec} onPress={quitar} disabled={ocupado}><Text style={[styles.btnSecTxt, { color: colors.red600 }]}>Quitar</Text></TouchableOpacity>}
            {editando && (
              <TouchableOpacity style={[styles.btnPrim, { flex: 1 }]} onPress={guardar} disabled={ocupado}>
                {ocupado ? <ActivityIndicator color={colors.sobreAcento} /> : <Text style={styles.btnPrimTxt}>Guardar</Text>}
              </TouchableOpacity>
            )}
            {!editando && <TouchableOpacity style={[styles.btnSec, { marginLeft: "auto" }]} onPress={onCerrar}><Text style={styles.btnSecTxt}>Cerrar</Text></TouchableOpacity>}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = crearEstilos({
  fondo: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  hoja: { backgroundColor: colors.paper0, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "92%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  titulo: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 22, color: colors.ink900 },
  meta: { fontSize: 13, color: colors.ink500 },
  label: { fontSize: 12, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: colors.ink900 },
  codigoInput: { textAlign: "center", fontSize: 26, letterSpacing: 8, marginBottom: 10 },
  pickerCaja: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10 },
  caja: { backgroundColor: colors.paper100, borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: colors.ink300 },
  cajaTitulo: { fontSize: 15, fontWeight: "700", color: colors.ink900 },
  enlaceTxt: { color: colors.petrol500, fontWeight: "700", marginTop: 4 },
  codigoCaja: { alignItems: "center", borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.petrol500, padding: 12, gap: 2 },
  codigoNum: { fontSize: 38, fontWeight: "800", letterSpacing: 10, color: colors.ink900 },
  alertaTxt: { color: colors.red600, fontWeight: "700", textAlign: "center" },
  okCaja: { backgroundColor: colors.teal100, borderRadius: 10, padding: 12 },
  okTxt: { color: colors.teal600, fontWeight: "700" },
  fila: { flexDirection: "row", gap: 10 },
  btnWa: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#25D366", borderRadius: 10, height: 48 },
  btnWaTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  pie: { flexDirection: "row", gap: 10, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.ink300, backgroundColor: colors.paper100 },
  btnPrim: { alignItems: "center", justifyContent: "center", backgroundColor: colors.petrol500, borderRadius: 10, height: 48, paddingHorizontal: 16 },
  btnPrimTxt: { fontSize: 15, fontWeight: "600", color: colors.sobreAcento },
  btnSec: { alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, height: 48, paddingHorizontal: 14 },
  btnSecTxt: { fontSize: 14, fontWeight: "600", color: colors.ink900 },
});
