import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, ActivityIndicator, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api, archivoParaForm } from "../api";
import { colors, spacing } from "../theme";
import ClienteFormScreen from "./ClienteFormScreen";
import { isVerificacion2PasosActiva } from "../configuracionApp";
import { crearEstilos } from "../ui/estilos";
import FormScroll from "../ui/FormScroll";
import { mostrarDialogo, alerta } from "../ui/Dialogo";

/*
 * Nueva orden en pasos (pensado para el celular): una pregunta a la vez,
 * con la barra de progreso arriba y Atrás/Siguiente siempre abajo.
 *   1. Cliente y vehículo   2. Trabajo   3. Responsable y anticipo   4. Confirmar
 * Hace lo mismo que el formulario de la web (incluye garantías).
 */

const PASOS = ["Cliente", "Trabajo", "Asignar", "Confirmar"];
const TIPOS_PAGO = [
  { valor: "efectivo", texto: "Efectivo", icono: "cash-outline" },
  { valor: "tarjeta", texto: "Tarjeta", icono: "card-outline" },
  { valor: "mixto", texto: "Mixto", icono: "swap-horizontal-outline" },
];
const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nombreCliente = (c) => (c ? `${c.nombre_cliente || ""} ${c.paterno_cliente || ""}`.trim() : "—");
const nombreVehiculo = (v) => (v ? [v.marca?.nombre_marca, v.modelo?.nombre_modelo].filter(Boolean).join(" ") || "Vehículo" : "—");

export default function NuevaOrdenScreen({ navigation, route }) {
  const [paso, setPaso] = useState(0);
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [vehiculos, setVehiculos] = useState([]);
  const [cargandoVehiculos, setCargandoVehiculos] = useState(false);
  const [tipos, setTipos] = useState([]);
  const [empleados, setEmpleados] = useState([]);

  const [cliente, setCliente] = useState(null);
  const [vehiculo, setVehiculo] = useState(null);
  const [fijos, setFijos] = useState(false);
  const [garantiaOriginal, setGarantiaOriginal] = useState(null);
  const [motivoGarantia, setMotivoGarantia] = useState("");

  const [descripcion, setDescripcion] = useState("");
  const [tiposIds, setTiposIds] = useState([]);
  const [diagnostico, setDiagnostico] = useState("");
  const [operaciones, setOperaciones] = useState("");
  const [empleadoId, setEmpleadoId] = useState("");
  const [kmLlegada, setKmLlegada] = useState("");
  const [kmProximo, setKmProximo] = useState("");
  const [kmProximoManual, setKmProximoManual] = useState(false);
  const [fotos, setFotos] = useState([]); // assets de ImagePicker, se suben al crear
  const [anticipoTipo, setAnticipoTipo] = useState("efectivo");
  const [anticipoMonto, setAnticipoMonto] = useState("");
  const [anticipoEfectivo, setAnticipoEfectivo] = useState("");
  const [anticipoTarjeta, setAnticipoTarjeta] = useState("");

  const [verificacion2Pasos, setVerificacion2Pasos] = useState(false);
  const [autorizado, setAutorizado] = useState(false);
  const [modalConfirmacion, setModalConfirmacion] = useState(null);
  const [codigoIngresado, setCodigoIngresado] = useState("");
  const [errorCodigo, setErrorCodigo] = useState("");
  const [mostrarAgregarCliente, setMostrarAgregarCliente] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargarClientes = () => api.get("/clientes/?solo_activos=true").then(setClientes).catch(() => setClientes([]));

  useFocusEffect(
    useCallback(() => {
      cargarClientes();
      api.get("/tipos-servicio/").then(setTipos).catch(() => setTipos([]));
      api.get("/empleados/").then((d) => setEmpleados(d.filter((e) => e.activo !== false))).catch(() => setEmpleados([]));
      isVerificacion2PasosActiva().then(setVerificacion2Pasos);
      // Al volver de dar de alta un vehículo, se recargan los del cliente elegido
      if (cliente) elegirCliente(cliente, true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  function reiniciar() {
    setPaso(0); setCliente(null); setVehiculo(null); setVehiculos([]); setFijos(false); setBusqueda("");
    setGarantiaOriginal(null); setMotivoGarantia("");
    setDescripcion(""); setTiposIds([]); setDiagnostico(""); setOperaciones("");
    setEmpleadoId(""); setKmLlegada(""); setKmProximo(""); setKmProximoManual(false); setFotos([]);
    setAnticipoTipo("efectivo"); setAnticipoMonto(""); setAnticipoEfectivo(""); setAnticipoTarjeta("");
    setAutorizado(false); setError("");
  }

  // Llegada con cliente/vehículo ya resueltos (tras dar de alta) o desde "Reclamar garantía"
  useEffect(() => {
    const p = route?.params || {};
    if (p.clientePrefijado && p.vehiculoPrefijado) {
      reiniciar();
      setCliente(p.clientePrefijado); setVehiculo(p.vehiculoPrefijado); setVehiculos([p.vehiculoPrefijado]);
      setFijos(true); setPaso(1);
      navigation.setParams({ clientePrefijado: undefined, vehiculoPrefijado: undefined });
    } else if (p.garantiaOriginal) {
      const g = p.garantiaOriginal;
      reiniciar();
      setGarantiaOriginal(g);
      setCliente(g.cliente || { id_cliente: g.id_cliente });
      setVehiculo(g.vehiculo || { id_vehiculo: g.id_vehiculo });
      setFijos(true);
      setDescripcion(`Garantía de la orden #${g.id_servicio} — ${g.nombre_servicio || ""}`.trim());
      setPaso(1);
      navigation.setParams({ garantiaOriginal: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.clientePrefijado, route?.params?.vehiculoPrefijado, route?.params?.garantiaOriginal, route?.params?.recargar]);

  // Tocar el botón "Servicio" siempre arranca en blanco
  useEffect(() => {
    if (route?.params?.resetear) {
      reiniciar();
      navigation.setParams({ resetear: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.resetear]);

  async function elegirCliente(c, conservarVehiculo = false) {
    setCliente(c);
    if (!conservarVehiculo) setVehiculo(null);
    setCargandoVehiculos(true);
    try {
      const lista = await api.get(`/vehiculos/?id_cliente=${c.id_cliente}`);
      setVehiculos(lista);
      if (lista.length === 1 && !conservarVehiculo) elegirVehiculo(lista[0]); // si solo tiene uno, ya queda elegido
    } catch {
      setVehiculos([]);
    } finally {
      setCargandoVehiculos(false);
    }
  }

  // Igual que la web: al elegir el vehículo se precarga su último kilometraje
  async function elegirVehiculo(v) {
    setVehiculo(v);
    if (v?.km_vehiculo && !kmLlegada) setKmLlegada(String(v.km_vehiculo));
    if (!v || garantiaOriginal) return;
    // No duplicar: si el vehículo ya está en el taller, se ofrece ir a su orden
    try {
      const abiertas = await api.get("/servicios/?status=abierto");
      const abierta = (abiertas || []).find((s) => Number(s.id_vehiculo) === Number(v.id_vehiculo) && s.status === "abierto");
      if (abierta) {
        mostrarDialogo({
          tono: "alerta", icono: "construct", etiqueta: `Orden #${abierta.id_servicio} abierta`,
          titulo: "Este vehículo ya está en el taller",
          mensaje: `Tiene la orden "${abierta.nombre_servicio}" sin cerrar. ¿Vamos a esa orden o abres una nueva de todos modos?`,
          acciones: [
            { texto: "Ir a la orden abierta", tipo: "primario", icono: "arrow-forward", onPress: () => navigation.navigate("ServicioDetalle", { id: abierta.id_servicio }) },
            { texto: "Crear otra orden", tipo: "secundario" },
          ],
        });
      }
    } catch {
      // sin conexión a la lista: se deja continuar
    }
  }

  // Sugerencia del próximo servicio (web): +10,000 km afinación, +5,000 km cambio de aceite.
  // Solo sugiere; si la persona escribió el valor a mano, no se pisa.
  useEffect(() => {
    if (kmProximoManual) return;
    const km = Number(kmLlegada);
    const nombres = tipos.filter((t) => tiposIds.includes(t.id_tipo_servicio)).map((t) => t.nombre_tipo.toLowerCase());
    let incremento = 0;
    if (nombres.some((n) => n.includes("afinación") || n.includes("afinacion"))) incremento = 10000;
    else if (nombres.some((n) => n.includes("aceite"))) incremento = 5000;
    setKmProximo(km && incremento ? String(km + incremento) : "");
  }, [kmLlegada, tiposIds, tipos, kmProximoManual]);

  async function agregarFotos(origen) {
    const permiso = origen === "camara" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) { alerta("Falta permiso", "Activa el permiso para poder adjuntar fotos."); return; }
    const r = origen === "camara"
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsMultipleSelection: true, selectionLimit: 8 });
    if (!r.canceled) setFotos((prev) => [...prev, ...r.assets].slice(0, 8));
  }

  async function clienteCreado(nuevo) {
    setMostrarAgregarCliente(false);
    await cargarClientes();
    await elegirCliente(nuevo);
  }

  const alternarTipo = (idTipo) => setTiposIds((prev) => (prev.includes(idTipo) ? prev.filter((t) => t !== idTipo) : [...prev, idTipo]));

  const montoAnticipo = anticipoTipo === "mixto" ? (Number(anticipoEfectivo) || 0) + (Number(anticipoTarjeta) || 0) : Number(anticipoMonto) || 0;

  function validarPaso(n) {
    if (n === 0) {
      if (!cliente) return "Elige el cliente (o da de alta uno nuevo).";
      if (!vehiculo) return "Elige el vehículo que dejó el cliente.";
    }
    if (n === 1) {
      if (!descripcion.trim()) return "Escribe qué trae el vehículo o qué servicio se va a hacer.";
      if (tiposIds.length === 0) return "Marca al menos un tipo de mantenimiento.";
      if (garantiaOriginal && !motivoGarantia.trim()) return "Escribe qué volvió a fallar (motivo de la garantía).";
    }
    if (n === 3 && verificacion2Pasos && !autorizado) return "Falta marcar la autorización del cliente.";
    return "";
  }

  function siguiente() {
    const e = validarPaso(paso);
    if (e) { setError(e); return; }
    setError("");
    if (paso < PASOS.length - 1) setPaso(paso + 1);
    else pedirConfirmacion();
  }
  function atras() {
    setError("");
    if (paso > (fijos ? 1 : 0)) setPaso(paso - 1);
  }

  function pedirConfirmacion() {
    if (!verificacion2Pasos) { crear(null); return; }
    const codigo = String(Math.floor(1000 + Math.random() * 9000));
    setModalConfirmacion({ codigo }); setCodigoIngresado(""); setErrorCodigo("");
  }

  async function confirmarYCrear() {
    if (codigoIngresado !== modalConfirmacion.codigo) {
      setErrorCodigo("El código no coincide. Verifica con el cliente e intenta de nuevo.");
      return;
    }
    await crear(modalConfirmacion.codigo);
  }

  async function crear(codigoConfirmacion) {
    setGuardando(true);
    try {
      const nueva = await api.post("/servicios/", {
        id_cliente: Number(cliente.id_cliente),
        id_vehiculo: Number(vehiculo.id_vehiculo),
        nombre_servicio: descripcion.trim(),
        iva_porcentaje: 0, // sin IVA automático: se aplica desde la orden si el cliente lo pide
        diagnostico: diagnostico.trim() || null,
        tipos_mantenimiento_ids: tiposIds,
        operaciones: operaciones.trim() || null,
        id_empleado_responsable: empleadoId ? Number(empleadoId) : null,
        km_llegada: kmLlegada ? Number(kmLlegada) : null,
        km_proximo_servicio: kmProximo ? Number(kmProximo) : null,
        autorizado_cliente: !!verificacion2Pasos,
        codigo_confirmacion: codigoConfirmacion,
        es_garantia: !!garantiaOriginal,
        id_servicio_original: garantiaOriginal?.id_servicio || null,
        motivo_garantia: garantiaOriginal ? motivoGarantia.trim() : null,
      });

      // Anticipo: primer pago de la orden, con su forma de pago real
      if (montoAnticipo > 0) {
        try {
          await api.post(`/servicios/${nueva.id_servicio}/abonos`, {
            monto_abono: montoAnticipo,
            tipo_pago: anticipoTipo,
            desglose_mixto_efectivo: anticipoTipo === "mixto" ? Number(anticipoEfectivo) || 0 : null,
            desglose_mixto_tarjeta: anticipoTipo === "mixto" ? Number(anticipoTarjeta) || 0 : null,
            comentario: "Anticipo al recibir el vehículo",
          });
        } catch (err) {
          alerta("La orden se creó, pero el anticipo no se pudo registrar", err.message);
        }
      }
      // Fotos de la orden (como en la web: se suben ya con la orden creada)
      let fotosFallidas = 0;
      for (const f of fotos) {
        try {
          const fd = new FormData();
          fd.append("archivo", await archivoParaForm(f.uri), f.fileName || `orden_${Date.now()}.jpg`);
          fd.append("entidad_tipo", "servicio");
          fd.append("entidad_id", String(nueva.id_servicio));
          await api.postForm("/fotos/", fd);
        } catch {
          fotosFallidas++;
        }
      }
      if (fotosFallidas) alerta("Orden creada", `${fotosFallidas} foto(s) no se pudieron subir; puedes agregarlas desde la orden.`);
      setModalConfirmacion(null);
      reiniciar();
      // replace: al regresar desde la orden se vuelve al historial, no a este formulario
      navigation.replace("ServicioDetalle", { id: nueva.id_servicio });
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (mostrarAgregarCliente) {
    return (
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={styles.volverAlta} onPress={() => setMostrarAgregarCliente(false)}>
          <Ionicons name="arrow-back" size={18} color={colors.petrol600} />
          <Text style={styles.volverAltaTexto}>Volver a la orden</Text>
        </TouchableOpacity>
        <ClienteFormScreen onGuardado={clienteCreado} />
      </View>
    );
  }

  const clientesFiltrados = clientes.filter((c) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return [c.nombre_cliente, c.paterno_cliente, c.materno_cliente, c.telefono1, c.numero_cuenta].some((x) => String(x || "").toLowerCase().includes(q));
  });
  const responsable = empleados.find((e) => String(e.id_empleado) === String(empleadoId));

  return (
    <View style={styles.screen}>
      {/* Progreso */}
      <View style={styles.progreso}>
        {PASOS.map((nombre, i) => {
          const hecho = i < paso;
          const actual = i === paso;
          return (
            <View key={nombre} style={styles.pasoItem}>
              <View style={[styles.pasoCirculo, hecho && styles.pasoHecho, actual && styles.pasoActual]}>
                {hecho ? <Ionicons name="checkmark" size={14} color={colors.paper100} /> : <Text style={[styles.pasoNumero, actual && { color: colors.paper100 }]}>{i + 1}</Text>}
              </View>
              <Text style={[styles.pasoNombre, (actual || hecho) && styles.pasoNombreActivo]}>{nombre}</Text>
            </View>
          );
        })}
      </View>

      <FormScroll contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {garantiaOriginal && (
          <View style={styles.aviso}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.warn600} />
            <Text style={styles.avisoTexto}>Reclamación de garantía de la orden #{garantiaOriginal.id_servicio}</Text>
          </View>
        )}

        {/* PASO 1: cliente y vehículo */}
        {paso === 0 && (
          <>
            <Text style={styles.pregunta}>¿De quién es el vehículo?</Text>
            {!cliente ? (
              <>
                <View style={styles.buscador}>
                  <Ionicons name="search" size={18} color={colors.ink500} />
                  <TextInput style={styles.buscadorInput} placeholder="Nombre, teléfono o cuenta" placeholderTextColor={colors.ink500} value={busqueda} onChangeText={setBusqueda} />
                </View>
                <TouchableOpacity style={styles.opcionNueva} onPress={() => setMostrarAgregarCliente(true)}>
                  <Ionicons name="person-add-outline" size={20} color={colors.petrol600} />
                  <Text style={styles.opcionNuevaTexto}>Cliente nuevo</Text>
                </TouchableOpacity>
                {clientesFiltrados.length === 0 ? (
                  <Text style={styles.vacio}>{clientes.length === 0 ? "Todavía no hay clientes. Da de alta el primero." : "Nadie coincide con la búsqueda."}</Text>
                ) : clientesFiltrados.slice(0, 60).map((c) => (
                  <TouchableOpacity key={c.id_cliente} style={styles.opcion} onPress={() => elegirCliente(c)}>
                    <View style={styles.avatar}><Text style={styles.avatarTexto}>{(c.nombre_cliente || "?")[0].toUpperCase()}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.opcionTitulo}>{nombreCliente(c)}</Text>
                      <Text style={styles.opcionSub}>{[c.numero_cuenta, c.telefono1].filter(Boolean).join(" · ") || "Sin datos de contacto"}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.ink500} />
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                <View style={[styles.opcion, styles.opcionElegida]}>
                  <View style={styles.avatar}><Text style={styles.avatarTexto}>{(cliente.nombre_cliente || "?")[0].toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.opcionTitulo}>{nombreCliente(cliente)}</Text>
                    <Text style={styles.opcionSub}>{[cliente.numero_cuenta, cliente.telefono1].filter(Boolean).join(" · ")}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setCliente(null); setVehiculo(null); setVehiculos([]); }}>
                    <Text style={styles.cambiar}>Cambiar</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.pregunta, { marginTop: 18 }]}>¿Qué vehículo dejó?</Text>
                {cargandoVehiculos ? <ActivityIndicator color={colors.petrol500} /> : vehiculos.length === 0 ? (
                  <Text style={styles.vacio}>Este cliente no tiene vehículos registrados.</Text>
                ) : vehiculos.map((v) => {
                  const elegido = vehiculo?.id_vehiculo === v.id_vehiculo;
                  return (
                    <TouchableOpacity key={v.id_vehiculo} style={[styles.opcion, elegido && styles.opcionElegida]} onPress={() => elegirVehiculo(v)}>
                      <Ionicons name={elegido ? "radio-button-on" : "radio-button-off"} size={22} color={elegido ? colors.petrol500 : colors.ink500} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.opcionTitulo}>{nombreVehiculo(v)}</Text>
                        <Text style={styles.opcionSub}>{[v.placas_vehiculo ? `Placas ${v.placas_vehiculo}` : "Sin placas", v.color?.nombre_color, v.numero_cuenta].filter(Boolean).join(" · ")}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={styles.opcionNueva}
                  onPress={() => navigation.navigate("Clientes", { screen: "VehiculoForm", params: { clienteFijo: cliente }, initial: false })}
                >
                  <Ionicons name="car-outline" size={20} color={colors.petrol600} />
                  <Text style={styles.opcionNuevaTexto}>Registrar otro vehículo</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {/* PASO 2: trabajo */}
        {paso === 1 && (
          <>
            <View style={styles.resumenMini}>
              <Ionicons name="car-outline" size={18} color={colors.petrol600} />
              <Text style={styles.resumenMiniTexto} numberOfLines={1}>{nombreCliente(cliente)} · {nombreVehiculo(vehiculo)} {vehiculo?.placas_vehiculo ? `(${vehiculo.placas_vehiculo})` : ""}</Text>
            </View>
            <Text style={styles.pregunta}>¿Qué se le va a hacer?</Text>
            <Text style={styles.label}>Descripción *</Text>
            <TextInput style={[styles.input, styles.textarea]} value={descripcion} onChangeText={setDescripcion} multiline placeholder="Ej. Ruido en la suspensión delantera" placeholderTextColor={colors.ink500} />

            {garantiaOriginal && (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>¿Qué volvió a fallar? *</Text>
                <TextInput style={[styles.input, styles.textarea]} value={motivoGarantia} onChangeText={setMotivoGarantia} multiline placeholder="Motivo de la garantía" placeholderTextColor={colors.ink500} />
              </>
            )}

            <Text style={[styles.label, { marginTop: 14 }]}>Tipo de mantenimiento * <Text style={styles.labelNota}>(toca uno o varios)</Text></Text>
            <View style={styles.chips}>
              {tipos.map((t) => {
                const activo = tiposIds.includes(t.id_tipo_servicio);
                return (
                  <TouchableOpacity key={t.id_tipo_servicio} style={[styles.chip, activo && styles.chipActivo]} onPress={() => alternarTipo(t.id_tipo_servicio)}>
                    {activo && <Ionicons name="checkmark" size={14} color={colors.paper100} />}
                    <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{t.nombre_tipo}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Km de llegada</Text>
                <TextInput style={styles.input} value={kmLlegada} onChangeText={setKmLlegada} keyboardType="number-pad" placeholder="Ej. 85000" placeholderTextColor={colors.ink500} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Próximo servicio</Text>
                <TextInput style={styles.input} value={kmProximo} onChangeText={(v) => { setKmProximo(v); setKmProximoManual(!!v); }} keyboardType="number-pad" placeholder="km" placeholderTextColor={colors.ink500} />
              </View>
            </View>
            {!kmProximoManual && kmProximo ? <Text style={styles.ayuda}>Sugerido según el tipo de mantenimiento; puedes cambiarlo.</Text> : null}

            <Text style={[styles.label, { marginTop: 14 }]}>Fotos <Text style={styles.labelNota}>(opcional, cómo llegó el vehículo)</Text></Text>
            <View style={styles.fotosFila}>
              {fotos.map((f, i) => (
                <View key={f.uri + i}>
                  <Image source={{ uri: f.uri }} style={styles.fotoMini} />
                  <TouchableOpacity style={styles.fotoQuitar} onPress={() => setFotos((p) => p.filter((_, j) => j !== i))} hitSlop={6}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {fotos.length < 8 && (
                <>
                  <TouchableOpacity style={styles.fotoAgregar} onPress={() => agregarFotos("camara")}>
                    <Ionicons name="camera-outline" size={22} color={colors.petrol600} />
                    <Text style={styles.fotoAgregarTexto}>Cámara</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.fotoAgregar} onPress={() => agregarFotos("galeria")}>
                    <Ionicons name="images-outline" size={22} color={colors.petrol600} />
                    <Text style={styles.fotoAgregarTexto}>Galería</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Diagnóstico <Text style={styles.labelNota}>(opcional)</Text></Text>
            <TextInput style={[styles.input, styles.textarea]} value={diagnostico} onChangeText={setDiagnostico} multiline placeholder="Lo que encontraste al revisarlo" placeholderTextColor={colors.ink500} />
            <Text style={[styles.label, { marginTop: 14 }]}>Operaciones a realizar <Text style={styles.labelNota}>(opcional)</Text></Text>
            <TextInput style={[styles.input, styles.textarea]} value={operaciones} onChangeText={setOperaciones} multiline placeholder="Ej. Cambio de aceite, revisión de frenos…" placeholderTextColor={colors.ink500} />
          </>
        )}

        {/* PASO 3: responsable, estatus y anticipo */}
        {paso === 2 && (
          <>
            <Text style={styles.pregunta}>¿Quién se encarga?</Text>
            {empleados.length === 0 ? (
              <Text style={styles.vacio}>No hay empleados registrados; la orden queda sin asignar.</Text>
            ) : (
              <View style={styles.chips}>
                {[{ id_empleado: "", nombre: "Sin asignar" }, ...empleados].map((e) => {
                  const activo = String(empleadoId) === String(e.id_empleado);
                  return (
                    <TouchableOpacity key={e.id_empleado || "ninguno"} style={[styles.chip, activo && styles.chipActivo]} onPress={() => setEmpleadoId(e.id_empleado)}>
                      <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{`${e.nombre} ${e.paterno || ""}`.trim()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text style={[styles.pregunta, { marginTop: 22 }]}>¿Dejó anticipo?</Text>
            <Text style={styles.ayuda}>Si el cliente deja dinero a cuenta, se registra como el primer pago. Si no, déjalo vacío.</Text>
            <View style={styles.segmentado}>
              {TIPOS_PAGO.map((f) => (
                <TouchableOpacity key={f.valor} style={[styles.segmento, anticipoTipo === f.valor && styles.segmentoActivo]} onPress={() => setAnticipoTipo(f.valor)}>
                  <Ionicons name={f.icono} size={15} color={anticipoTipo === f.valor ? colors.paper100 : colors.ink700} />
                  <Text style={[styles.segmentoTexto, anticipoTipo === f.valor && styles.segmentoTextoActivo]}>{f.texto}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {anticipoTipo === "mixto" ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <TextInput style={[styles.input, { flex: 1 }]} value={anticipoEfectivo} onChangeText={setAnticipoEfectivo} keyboardType="decimal-pad" placeholder="Efectivo" placeholderTextColor={colors.ink500} />
                <TextInput style={[styles.input, { flex: 1 }]} value={anticipoTarjeta} onChangeText={setAnticipoTarjeta} keyboardType="decimal-pad" placeholder="Tarjeta" placeholderTextColor={colors.ink500} />
              </View>
            ) : (
              <TextInput style={[styles.input, { marginTop: 10 }]} value={anticipoMonto} onChangeText={setAnticipoMonto} keyboardType="decimal-pad" placeholder="Monto (0.00)" placeholderTextColor={colors.ink500} />
            )}

          </>
        )}

        {/* PASO 4: confirmar */}
        {paso === 3 && (
          <>
            <Text style={styles.pregunta}>Revisa y crea la orden</Text>
            <View style={styles.resumen}>
              {[
                ["Cliente", nombreCliente(cliente), 0],
                ["Vehículo", `${nombreVehiculo(vehiculo)}${vehiculo?.placas_vehiculo ? ` · ${vehiculo.placas_vehiculo}` : ""}`, 0],
                ["Trabajo", descripcion, 1],
                ["Tipos", tiposIds.map((idT) => tipos.find((t) => t.id_tipo_servicio === idT)?.nombre_tipo).filter(Boolean).join(", "), 1],
                garantiaOriginal ? ["Garantía", motivoGarantia, 1] : null,
                diagnostico ? ["Diagnóstico", diagnostico, 1] : null,
                ["Responsable", responsable ? `${responsable.nombre} ${responsable.paterno || ""}` : "Sin asignar", 2],
                ["Anticipo", montoAnticipo > 0 ? `${fmt(montoAnticipo)} (${TIPOS_PAGO.find((t) => t.valor === anticipoTipo)?.texto})` : "Sin anticipo", 2],
                kmLlegada ? ["Kilometraje", `${Number(kmLlegada).toLocaleString("es-MX")} km${kmProximo ? ` · próximo ${Number(kmProximo).toLocaleString("es-MX")}` : ""}`, 1] : null,
                fotos.length ? ["Fotos", `${fotos.length} adjunta(s)`, 1] : null,
              ].filter(Boolean).map(([etq, val, irA]) => (
                <TouchableOpacity key={etq} style={styles.resumenFila} onPress={() => !(fijos && irA === 0) && setPaso(irA)}>
                  <Text style={styles.resumenEtiqueta}>{etq}</Text>
                  <Text style={styles.resumenValor} numberOfLines={2}>{val || "—"}</Text>
                  {!(fijos && irA === 0) && <Ionicons name="create-outline" size={15} color={colors.ink500} />}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ayuda}>Toca cualquier dato para corregirlo. Las refacciones y la mano de obra se agregan ya dentro de la orden.</Text>

            {verificacion2Pasos && (
              <TouchableOpacity style={styles.checkRow} onPress={() => setAutorizado((v) => !v)}>
                <Ionicons name={autorizado ? "checkbox" : "square-outline"} size={22} color={autorizado ? colors.petrol500 : colors.ink500} />
                <Text style={styles.checkLabel}>El cliente autoriza que se realice este servicio</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {error ? (
          <View style={styles.errorCaja}>
            <Ionicons name="alert-circle" size={18} color={colors.red600} />
            <Text style={styles.errorTexto}>{error}</Text>
          </View>
        ) : null}
      </FormScroll>

      {/* Barra fija: Atrás / Siguiente */}
      <View style={styles.barra}>
        {paso > (fijos ? 1 : 0) ? (
          <TouchableOpacity style={styles.btnSecundario} onPress={atras}>
            <Ionicons name="arrow-back" size={17} color={colors.ink900} />
            <Text style={styles.btnSecundarioTexto}>Atrás</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btnSecundario} onPress={() => navigation.navigate("HistorialServicios")}>
            <Text style={styles.btnSecundarioTexto}>Cancelar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.btnPrimario, guardando && { opacity: 0.6 }]} onPress={siguiente} disabled={guardando}>
          {guardando ? <ActivityIndicator color={colors.paper100} /> : (
            <>
              <Text style={styles.btnPrimarioTexto}>{paso === PASOS.length - 1 ? "Crear orden" : "Siguiente"}</Text>
              <Ionicons name={paso === PASOS.length - 1 ? "checkmark" : "arrow-forward"} size={17} color={colors.paper100} />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Verificación en 2 pasos */}
      <Modal visible={!!modalConfirmacion} transparent animationType="slide" onRequestClose={() => setModalConfirmacion(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Código del cliente</Text>
            <Text style={styles.ayuda}>
              Se envió un código al {cliente?.telefono1 || "teléfono del cliente"}. Código de prueba (demo, sin SMS real): {modalConfirmacion?.codigo}
            </Text>
            <TextInput style={[styles.input, styles.codigo]} value={codigoIngresado} onChangeText={setCodigoIngresado} keyboardType="number-pad" maxLength={4} placeholder="0000" placeholderTextColor={colors.ink500} autoFocus />
            {errorCodigo ? <Text style={styles.errorTexto}>{errorCodigo}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecundario} onPress={() => setModalConfirmacion(null)}>
                <Text style={styles.btnSecundarioTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimario} onPress={confirmarYCrear} disabled={guardando}>
                <Text style={styles.btnPrimarioTexto}>{guardando ? "Creando…" : "Confirmar y crear"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  progreso: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: 12, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  pasoItem: { alignItems: "center", flex: 1, gap: 4 },
  pasoCirculo: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.ink300, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper100 },
  pasoHecho: { backgroundColor: colors.teal600, borderColor: colors.teal600 },
  pasoActual: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  pasoNumero: { fontSize: 13, fontWeight: "700", color: colors.ink500 },
  pasoNombre: { fontSize: 11.5, fontWeight: "600", color: colors.ink500 },
  pasoNombreActivo: { color: colors.ink900 },
  pregunta: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 24, color: colors.ink900, marginBottom: 12 },
  ayuda: { fontSize: 13, color: colors.ink500, lineHeight: 18, marginBottom: 10 },
  aviso: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.warn100, borderRadius: 10, padding: 12, marginBottom: 14 },
  avisoTexto: { flex: 1, fontSize: 13.5, fontWeight: "600", color: colors.warn600 },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper100, borderWidth: 1.5, borderColor: colors.petrol300, borderRadius: 12, paddingHorizontal: 12, height: 48, marginBottom: 10 },
  buscadorInput: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  opcion: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paper100, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1.5, borderColor: "transparent" },
  opcionElegida: { borderColor: colors.petrol500, backgroundColor: colors.petrol100 },
  opcionTitulo: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
  opcionSub: { fontSize: 12.5, color: colors.ink500, marginTop: 1 },
  opcionNueva: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.petrol500, borderRadius: 12, padding: 13, marginBottom: 12, marginTop: 4 },
  opcionNuevaTexto: { fontSize: 15, fontWeight: "600", color: colors.petrol600 },
  cambiar: { fontSize: 13.5, fontWeight: "700", color: colors.petrol600 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  avatarTexto: { fontSize: 15, fontWeight: "700", color: colors.petrol600 },
  vacio: { fontSize: 14, color: colors.ink500, paddingVertical: 12, textAlign: "center" },
  resumenMini: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.petrol100, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 14 },
  resumenMiniTexto: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.petrol600 },
  label: { fontSize: 12, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 },
  labelNota: { fontSize: 11, fontWeight: "400", color: colors.ink500, textTransform: "none" },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: colors.ink900 },
  textarea: { minHeight: 70, textAlignVertical: "top" },
  codigo: { fontSize: 24, letterSpacing: 8, textAlign: "center", marginTop: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderColor: colors.ink300, borderRadius: 100, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.paper100 },
  chipActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  chipTexto: { fontSize: 14, fontWeight: "600", color: colors.ink700 },
  chipTextoActivo: { color: colors.paper100 },
  segmentado: { flexDirection: "row", backgroundColor: colors.paper100, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: colors.ink300 },
  segmento: { flex: 1, flexDirection: "row", gap: 5, paddingVertical: 10, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  segmentoActivo: { backgroundColor: colors.petrol500 },
  segmentoTexto: { fontSize: 13.5, fontWeight: "600", color: colors.ink700 },
  segmentoTextoActivo: { color: colors.paper100 },
  fotosFila: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fotoMini: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.paper100 },
  fotoQuitar: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(20,24,28,0.7)", alignItems: "center", justifyContent: "center" },
  fotoAgregar: { width: 72, height: 72, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.petrol500, alignItems: "center", justifyContent: "center", gap: 2 },
  fotoAgregarTexto: { fontSize: 11, fontWeight: "600", color: colors.petrol600 },
  resumen: { backgroundColor: colors.paper100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 10 },
  resumenFila: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  resumenEtiqueta: { width: 92, fontSize: 12.5, color: colors.ink500 },
  resumenValor: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.ink900 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper100, borderRadius: 12, padding: 14, marginTop: 6 },
  checkLabel: { flex: 1, fontSize: 14, color: colors.ink900 },
  errorCaja: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.red100, borderRadius: 10, padding: 12, marginTop: 14 },
  errorTexto: { flex: 1, fontSize: 13.5, fontWeight: "600", color: colors.red600 },
  barra: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10,
    paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 14, backgroundColor: colors.paper100,
    borderTopWidth: 1, borderTopColor: colors.ink300, elevation: 8, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: -3 },
  },
  btnPrimario: { flex: 1.5, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.petrol500, borderRadius: 10, height: 48 },
  btnPrimarioTexto: { fontSize: 15, fontWeight: "600", color: colors.paper100 },
  btnSecundario: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 10, height: 48 },
  btnSecundarioTexto: { fontSize: 15, fontWeight: "600", color: colors.ink900 },
  volverAlta: { flexDirection: "row", alignItems: "center", gap: 6, padding: 14, backgroundColor: colors.paper100, borderBottomWidth: 1, borderBottomColor: colors.ink300 },
  volverAltaTexto: { fontSize: 14, fontWeight: "600", color: colors.petrol600 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(20,24,28,0.55)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.paper100, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, paddingBottom: 30 },
  modalTitle: { fontFamily: "BarlowCondensed_600SemiBold", fontSize: 22, color: colors.ink900, marginBottom: 8 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
});
