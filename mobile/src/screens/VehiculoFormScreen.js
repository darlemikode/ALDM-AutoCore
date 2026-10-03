import { useCallback, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Picker } from "../ui/Picker";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { colors, spacing } from "../theme";
import ClienteFormScreen from "./ClienteFormScreen";
import { crearEstilos } from "../ui/estilos";
import FormScroll from "../ui/FormScroll";
import { mostrarDialogo, alerta } from "../ui/Dialogo";
import { abrirOrdenDeVehiculo } from "../navigation/irAOrden";

/**
 * Captura de vehículo. Dos formas de usarse:
 *  - navigation + route.params.clienteFijo: pantalla completa dentro de un
 *    stack (ej. después de crear un cliente nuevo, o desde "Vehículos").
 *  - onGuardado(prop): modo embebido (ej. alta rápida desde otra pantalla).
 * Mientras no haya un cliente elegido, todo lo demás queda deshabilitado.
 */
export default function VehiculoFormScreen({ navigation, route, onGuardado }) {
  const clienteFijo = route?.params?.clienteFijo || null;
  const vehiculoExistente = route?.params?.vehiculoExistente || null;
  const editando = !!vehiculoExistente;

  const [clientes, setClientes] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [colores, setColores] = useState([]);

  const [clienteId, setClienteId] = useState(clienteFijo ? clienteFijo.id_cliente : (vehiculoExistente?.id_cliente || ""));
  const [placas, setPlacas] = useState(vehiculoExistente?.placas_vehiculo || "");
  const [marcaId, setMarcaId] = useState(vehiculoExistente?.id_marca_vehiculo || "");
  const [modeloId, setModeloId] = useState(vehiculoExistente?.id_modelo_vehiculo || "");
  const [colorId, setColorId] = useState(vehiculoExistente?.id_color || "");
  const [vin, setVin] = useState(vehiculoExistente?.numserie_vehiculo || "");
  const [anio, setAnio] = useState(vehiculoExistente?.id_year_vehiculo != null ? String(vehiculoExistente.id_year_vehiculo) : "");
  const [cilindraje, setCilindraje] = useState(vehiculoExistente?.cilindraje_vehiculo != null ? String(vehiculoExistente.cilindraje_vehiculo) : "");
  const [km, setKm] = useState(vehiculoExistente?.km_vehiculo != null ? String(vehiculoExistente.km_vehiculo) : "");
  const [comentarios, setComentarios] = useState(vehiculoExistente?.comentarios || "");
  const [estado, setEstado] = useState(vehiculoExistente?.estado_vehiculo || "activo");

  const [mostrarAgregarCliente, setMostrarAgregarCliente] = useState(false);
  const [errores, setErrores] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      navigation?.setOptions?.({ title: editando ? "Editar vehículo" : "Nuevo vehículo" });
      if (!clienteFijo) api.get("/clientes/?solo_activos=true").then(setClientes);
      api.get("/vehiculos-marcas/").then(setMarcas);
      api.get("/vehiculos-modelos/").then(setModelos);
      api.get("/colores-vehiculos/").then(setColores);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const modelosDeLaMarca = marcaId ? modelos.filter((m) => m.id_marca_vehiculo === marcaId) : [];
  const bloqueado = !editando && !clienteFijo && !clienteId;

  // Obligatorios en orden; al llenar uno se quita su error y se marca el siguiente pendiente
  function pendientes(m, mo, k) {
    return [!m && "marca", !mo && "modelo", !String(k).trim() && "km"].filter(Boolean);
  }
  function marcarSiguiente(m, mo, k) {
    setErrores(pendientes(m, mo, k).slice(0, 1));
  }

  function alElegirMarca(id) {
    setMarcaId(id);
    const modeloAplica = editando && id === vehiculoExistente?.id_marca_vehiculo ? modeloId : "";
    if (!editando || id !== vehiculoExistente?.id_marca_vehiculo) setModeloId(""); // el modelo elegido antes ya no aplica
    if (id) marcarSiguiente(id, modeloAplica, km);
  }
  function alElegirModelo(id) {
    setModeloId(id);
    if (id) marcarSiguiente(marcaId, id, km);
  }
  function alEscribirKm(v) {
    setKm(v);
    if (v.trim()) setErrores((e) => e.filter((x) => x !== "km"));
  }

  async function clienteCreado(nuevo) {
    setMostrarAgregarCliente(false);
    setClienteId(nuevo.id_cliente);
    if (!clienteFijo) {
      const c = await api.get("/clientes/?solo_activos=true");
      setClientes(c);
    }
  }

  function marcarError(campo, mensaje) {
    setErrores(pendientes(marcaId, modeloId, km));
    alerta("Falta información", mensaje);
  }

  async function guardar() {
    if (!marcaId) return marcarError("marca", "Selecciona (o agrega) la marca del vehículo.");
    if (!modeloId) return marcarError("modelo", "Selecciona (o agrega) el modelo del vehículo.");
    if (!km.trim()) return marcarError("km", "Escribe el kilometraje del vehículo.");
    setErrores([]);

    setGuardando(true);
    try {
      const datos = {
        id_cliente: Number(clienteFijo ? clienteFijo.id_cliente : (editando ? vehiculoExistente.id_cliente : clienteId)),
        placas_vehiculo: placas.trim() || null,
        id_marca_vehiculo: marcaId,
        id_modelo_vehiculo: modeloId,
        id_color: colorId || null,
        numserie_vehiculo: vin.trim() || null,
        id_year_vehiculo: String(anio).trim() || null,
        cilindraje_vehiculo: String(cilindraje).trim() || null,
        km_vehiculo: String(km).trim(),
        comentarios: comentarios.trim() || null,
        estado_vehiculo: estado,
      };
      const nuevo = editando
        ? await api.put(`/vehiculos/${vehiculoExistente.id_vehiculo}`, datos)
        : await api.post("/vehiculos/", datos);

      if (onGuardado) {
        onGuardado(nuevo);
        return;
      }

      if (editando) { navigation.goBack(); return; }
      const dueno = clienteFijo || clientes.find((c) => c.id_cliente === Number(clienteId));
      mostrarDialogo({
        tono: "exito", icono: "car-sport", etiqueta: nuevo.numero_cuenta || "Vehículo registrado",
        titulo: "¡Vehículo agregado!",
        mensaje: `${[nuevo.placas_vehiculo, dueno?.nombre_cliente].filter(Boolean).join(" · ") || "El vehículo"} ya quedó registrado. ¿Abrimos de una vez su orden de servicio?`,
        acciones: [
          { texto: "Sí, crear orden", tipo: "primario", icono: "construct", onPress: () => { navigation.goBack(); abrirOrdenDeVehiculo(navigation, dueno, nuevo); } },
          { texto: "Ahora no", tipo: "secundario", onPress: () => navigation.goBack() },
        ],
      });
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (mostrarAgregarCliente) {
    return <ClienteFormScreen onGuardado={clienteCreado} />;
  }

  const conError = (campo) => errores.includes(campo) && styles.inputError;

  return (
    <FormScroll style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      {bloqueado && (
        <Text style={styles.hint}>Primero elige (o da de alta) al cliente dueño; el resto del formulario se activa después.</Text>
      )}

      {(clienteFijo || editando) ? (
        <Campo label="Cliente">
          <TextInput placeholderTextColor={colors.ink500}
            style={styles.input}
            value={clienteFijo ? `${clienteFijo.nombre_cliente} (${clienteFijo.numero_cuenta})` : (vehiculoExistente?.cliente ? `${vehiculoExistente.cliente.nombre_cliente} (${vehiculoExistente.cliente.numero_cuenta})` : "Cliente actual")}
            editable={false}
          />
        </Campo>
      ) : (
        <Campo label="Cliente">
          <View style={styles.filaCliente}>
            <View style={[styles.pickerWrap, { flex: 1 }]}>
              <Picker titulo="Cliente" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} selectedValue={clienteId} onValueChange={setClienteId}>
                <Picker.Item label="-- Selecciona --" value="" />
                {clientes.map((c) => (
                  <Picker.Item key={c.id_cliente} label={`${c.nombre_cliente} (${c.numero_cuenta})`} value={c.id_cliente} />
                ))}
              </Picker>
            </View>
            <TouchableOpacity style={styles.botonMas} onPress={() => setMostrarAgregarCliente(true)}>
              <Text style={styles.botonMasTexto}>+</Text>
            </TouchableOpacity>
          </View>
        </Campo>
      )}

      <Campo label="Placas">
        <TextInput placeholderTextColor={colors.ink500} style={[styles.input, conError("placas")]} value={placas} onChangeText={setPlacas} editable={!bloqueado} placeholder="ABC-123" autoCapitalize="characters" />
      </Campo>

      <Campo label="Marca" obligatorio error={errores.includes("marca")}>
        <View style={[styles.pickerWrap, conError("marca")]}>
          <Picker titulo="Marca" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} enabled={!bloqueado} selectedValue={marcaId} onValueChange={alElegirMarca}>
            <Picker.Item label="-- Selecciona --" value="" />
            {marcas.map((m) => (
              <Picker.Item key={m.id_marca_vehiculo} label={m.nombre_marca} value={m.id_marca_vehiculo} />
            ))}
          </Picker>
        </View>
      </Campo>

      <Campo label="Modelo" obligatorio error={errores.includes("modelo")}>
        <View style={[styles.pickerWrap, conError("modelo")]}>
          <Picker titulo="Modelo" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} enabled={!bloqueado && !!marcaId} selectedValue={modeloId} onValueChange={alElegirModelo}>
            <Picker.Item label={marcaId ? "-- Selecciona --" : "Elige una marca primero"} value="" />
            {modelosDeLaMarca.map((m) => (
              <Picker.Item key={m.id_modelo_vehiculo} label={m.nombre_modelo} value={m.id_modelo_vehiculo} />
            ))}
          </Picker>
        </View>
      </Campo>

      <Campo label="Color">
        <View style={styles.pickerWrap}>
          <Picker titulo="Color" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} enabled={!bloqueado} selectedValue={colorId} onValueChange={setColorId}>
            <Picker.Item label="-- Selecciona --" value="" />
            {colores.map((c) => (
              <Picker.Item key={c.id_color} label={c.nombre_color} value={c.id_color} />
            ))}
          </Picker>
        </View>
      </Campo>

      <Campo label="Número de serie (VIN)">
        <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={vin} onChangeText={setVin} editable={!bloqueado} placeholder="3N1CN7AP..." autoCapitalize="characters" />
      </Campo>

      <Campo label="Año">
        <TextInput placeholderTextColor={colors.ink500} style={[styles.input, conError("anio")]} value={anio} onChangeText={setAnio} editable={!bloqueado} keyboardType="numeric" placeholder="2022" />
      </Campo>

      <Campo label="Cilindraje">
        <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={cilindraje} onChangeText={setCilindraje} editable={!bloqueado} placeholder="2.0L / 4 cil." />
      </Campo>

      <Campo label="Kilometraje" obligatorio error={errores.includes("km")}>
        <TextInput placeholderTextColor={colors.ink500} style={[styles.input, conError("km")]} value={km} onChangeText={alEscribirKm} editable={!bloqueado} keyboardType="numeric" placeholder="45,000" />
      </Campo>

      {editando && (
        <Campo label="Estado del vehículo">
          <View style={styles.pickerWrap}>
            <Picker titulo="Estado del vehículo" ordenar={false} style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} selectedValue={estado} onValueChange={setEstado}>
              <Picker.Item label="Activo (sigue siendo del cliente)" value="activo" />
              <Picker.Item label="Vendido / ya no es del cliente" value="vendido" />
            </Picker>
          </View>
        </Campo>
      )}

      <Campo label="Comentarios">
        <TextInput style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]} value={comentarios} onChangeText={setComentarios} editable={!bloqueado} multiline placeholder="Detalles del vehículo (golpes, accesorios…)" placeholderTextColor={colors.ink500} />
      </Campo>

      <TouchableOpacity style={[styles.button, bloqueado && styles.buttonDisabled]} onPress={guardar} disabled={bloqueado || guardando}>
        <Text style={styles.buttonText}>{guardando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar vehículo"}</Text>
      </TouchableOpacity>
    </FormScroll>
  );
}

function Campo({ label, obligatorio, error, children }) {
  return (
    <View style={styles.campo}>
      <Text style={[styles.label, error && styles.labelError]}>{label}{obligatorio ? <Text style={{ color: colors.red600 }}> *</Text> : null}</Text>
      {children}
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  campo: { marginBottom: spacing.md },
  label: { fontSize: 12, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 7 },
  labelError: { color: colors.red600 },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 10, fontSize: 14, color: colors.ink900 },
  inputError: { borderColor: colors.red600, borderWidth: 2, backgroundColor: colors.red100 },
  pickerWrap: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, overflow: "hidden" },
  filaCliente: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  botonMas: { backgroundColor: colors.petrol500, width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  botonMasTexto: { color: "#fff", fontSize: 22, fontWeight: "700" },
  hint: { fontSize: 12, color: colors.ink500, backgroundColor: colors.paper100, borderRadius: 8, padding: 10, marginBottom: spacing.md },
  button: { backgroundColor: colors.petrol500, borderRadius: 8, padding: 14, alignItems: "center", marginTop: spacing.md },
  buttonDisabled: { backgroundColor: colors.ink300 },
  buttonText: { color: colors.paper100, fontWeight: "800", fontSize: 14, textTransform: "uppercase" },
});
