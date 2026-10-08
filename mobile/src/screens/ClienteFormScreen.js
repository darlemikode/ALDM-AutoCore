import { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Picker } from "../ui/Picker";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import FormScroll from "../ui/FormScroll";
import { mostrarDialogo, alerta } from "../ui/Dialogo";
import { soloDigitos, telefonoValido, MENSAJE_TELEFONO_INVALIDO, correoValido, MENSAJE_CORREO_INVALIDO } from "../validaciones";

const ESTADOS_MEXICO = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas",
  "Chihuahua", "Ciudad de México", "Coahuila", "Colima", "Durango", "Estado de México",
  "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit",
  "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
];

/**
 * Captura completa de cliente, en el mismo orden/alineación que el panel
 * web: datos generales, luego dirección con CP inteligente.
 *
 * onGuardado(clienteCreado) — se llama al terminar, para que la pantalla
 * que abrió este formulario (Nueva orden, alta de vehículo, o el módulo de
 * Clientes) reciba el cliente recién creado sin tener que recargar nada.
 */
export default function ClienteFormScreen({ navigation, route, onGuardado }) {
  const clienteExistente = route?.params?.cliente || null;
  const alGuardar = onGuardado || route?.params?.onGuardado || null;
  const editando = !!clienteExistente;

  const [nombre, setNombre] = useState(clienteExistente?.nombre_cliente || "");
  const [paterno, setPaterno] = useState(clienteExistente?.paterno_cliente || "");
  const [materno, setMaterno] = useState(clienteExistente?.materno_cliente || "");
  const [telefono1, setTelefono1] = useState(clienteExistente?.telefono1 || "");
  const [telefono2, setTelefono2] = useState(clienteExistente?.telefono2 || "");
  const [correo, setCorreo] = useState(clienteExistente?.correo_cliente || "");
  const [empresa, setEmpresa] = useState(clienteExistente?.empresa_cliente || "");
  const [rfc, setRfc] = useState(clienteExistente?.rfc_cliente || "");

  const [cp, setCp] = useState(clienteExistente?.cp_cliente || "");
  const [estado, setEstado] = useState("");
  const [municipio, setMunicipio] = useState(""); // "ciudad" en el backend
  const [colonia, setColonia] = useState(clienteExistente?.colonia_cliente || "");
  const [coloniasSugeridas, setColoniasSugeridas] = useState([]);
  const [calle, setCalle] = useState(clienteExistente?.calle_cliente || "");
  const [numExt, setNumExt] = useState(clienteExistente?.numexterior_cliente || "");
  const [numInt, setNumInt] = useState(clienteExistente?.numinterior_cliente || "");
  const [comentarios, setComentarios] = useState(clienteExistente?.comentarios || "");

  const [buscandoCp, setBuscandoCp] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState([]);
  const [masDatos, setMasDatos] = useState(
    !!(clienteExistente && (clienteExistente.materno_cliente || clienteExistente.telefono2 || clienteExistente.empresa_cliente || clienteExistente.rfc_cliente || clienteExistente.cp_cliente || clienteExistente.calle_cliente || clienteExistente.comentarios))
  );

  useEffect(() => {
    navigation?.setOptions?.({ title: editando ? "Editar cliente" : "Nuevo cliente" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si venimos a editar un cliente que ya tiene id_estado/id_ciudad
  // guardados, se traducen de vuelta a texto para mostrarlos — si no, el
  // formulario se vería vacío aunque el cliente sí tenga dirección.
  useEffect(() => {
    if (!clienteExistente?.id_estado) return;
    (async () => {
      try {
        const estados = await api.get("/estados/");
        const est = estados.find((e) => e.id_estado === clienteExistente.id_estado);
        setEstado(est?.nombre_estado || "");
        if (clienteExistente.id_ciudad) {
          const ciudades = await api.get("/ciudades/");
          const ciu = ciudades.find((c) => c.id_ciudad === clienteExistente.id_ciudad);
          setMunicipio(ciu?.nombre_ciudad || "");
        }
      } catch {
        // si falla la traducción, el formulario sigue usable, solo sin precargar estado/ciudad
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buscarCp(valor) {
    setCp(valor);
    if (valor.length !== 5) return;
    setBuscandoCp(true);
    try {
      const info = await api.get(`/codigos-postales/${valor}`);
      setEstado(info.estado || "");
      setMunicipio(info.ciudad || info.municipio || "");
      setColoniasSugeridas(info.colonias || []);
      if (info.colonias?.length === 1) setColonia(info.colonias[0]);
    } catch {
      // CP no encontrado en el catálogo cargado (por ahora solo León, GTO) —
      // no truena nada, la persona sigue llenando estado/municipio/colonia
      // a mano.
      setColoniasSugeridas([]);
    } finally {
      setBuscandoCp(false);
    }
  }

  // El backend guarda estado/ciudad como catálogo (id_estado/id_ciudad),
  // no como texto libre — antes este formulario capturaba el texto y
  // nunca lo mandaba. Aquí se busca (o se crea si no existe) la fila del
  // catálogo correspondiente, y se manda su ID.
  async function resolverEstadoYCiudad(estadoTexto, ciudadTexto) {
    let idEstado = null;
    let idCiudad = null;
    if (estadoTexto?.trim()) {
      const estados = await api.get("/estados/");
      let estadoEncontrado = estados.find((e) => e.nombre_estado.toLowerCase() === estadoTexto.trim().toLowerCase());
      if (!estadoEncontrado) {
        const paises = await api.get("/paises/");
        let mexico = paises.find((p) => p.nombre_pais.toLowerCase().includes("méxico") || p.nombre_pais.toLowerCase().includes("mexico"));
        if (!mexico) mexico = await api.post("/paises/", { nombre_pais: "México" });
        estadoEncontrado = await api.post("/estados/", { nombre_estado: estadoTexto.trim(), id_pais: mexico.id_pais });
      }
      idEstado = estadoEncontrado.id_estado;

      if (ciudadTexto?.trim()) {
        const ciudades = await api.get("/ciudades/");
        let ciudadEncontrada = ciudades.find((c) => c.nombre_ciudad.toLowerCase() === ciudadTexto.trim().toLowerCase() && c.id_estado === idEstado);
        if (!ciudadEncontrada) ciudadEncontrada = await api.post("/ciudades/", { nombre_ciudad: ciudadTexto.trim(), id_estado: idEstado });
        idCiudad = ciudadEncontrada.id_ciudad;
      }
    }
    return { idEstado, idCiudad };
  }

  async function guardar() {
    const faltantes = [];
    if (!nombre.trim()) faltantes.push("nombre");
    if (!telefono1.trim()) faltantes.push("telefono1");
    else if (!telefonoValido(telefono1)) faltantes.push("telefono1");
    if (telefono2.trim() && !telefonoValido(telefono2, { opcional: true })) faltantes.push("telefono2");
    if (!correoValido(correo)) faltantes.push("correo");
    if (faltantes.length > 0) {
      // Sin alerta: se marca en rojo y se lleva a la persona directo al
      // primer campo que falta, con el teclado abierto.
      setErrores(faltantes);
      if (faltantes.includes("telefono2")) setMasDatos(true);
      irACampo(faltantes[0]);
      return;
    }
    setErrores([]);
    setGuardando(true);
    try {
      const { idEstado, idCiudad } = await resolverEstadoYCiudad(estado, municipio);
      const datos = {
        nombre_cliente: nombre.trim(),
        paterno_cliente: paterno.trim() || null,
        materno_cliente: materno.trim() || null,
        telefono1: telefono1.trim(),
        telefono2: telefono2.trim() || null,
        correo_cliente: correo.trim() || null,
        empresa_cliente: empresa.trim() || null,
        rfc_cliente: rfc.trim() || null,
        cp_cliente: cp || null,
        id_estado: idEstado,
        id_ciudad: idCiudad,
        colonia_cliente: colonia.trim() || null,
        calle_cliente: calle.trim() || null,
        numexterior_cliente: numExt.trim() || null,
        numinterior_cliente: numInt.trim() || null,
        comentarios: comentarios.trim() || null,
      };
      const nuevo = editando
        ? await api.put(`/clientes/${clienteExistente.id_cliente}`, datos)
        : await api.post("/clientes/", datos);

      if (alGuardar) {
        alGuardar(nuevo);
        return;
      }

      if (editando) { navigation.goBack(); return; }
      mostrarDialogo({
        tono: "exito", icono: "person-add", etiqueta: nuevo.numero_cuenta ? `Cuenta ${nuevo.numero_cuenta}` : "Cliente registrado",
        titulo: "¡Cliente creado!",
        mensaje: `${nuevo.nombre_cliente} ya está registrado. ¿Le damos de alta su vehículo ahora mismo?`,
        acciones: [
          { texto: "Sí, agregar vehículo", tipo: "primario", icono: "car-sport", onPress: () => navigation.replace("VehiculoForm", { clienteFijo: nuevo }) },
          { texto: "Ahora no", tipo: "secundario", onPress: () => navigation.goBack() },
        ],
      });
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardando(false);
    }
  }

  const conError = (campo) => errores.includes(campo) && styles.inputError;
  const mensajeErrorCampo = (campo) => {
    const valor = campo === "telefono1" ? telefono1 : campo === "telefono2" ? telefono2 : "";
    if ((campo === "telefono1" || campo === "telefono2") && valor.trim()) return MENSAJE_TELEFONO_INVALIDO;
    if (campo === "correo") return MENSAJE_CORREO_INVALIDO;
    return "Este dato es obligatorio";
  };

  const scrollRef = useRef(null);
  const contenidoRef = useRef(null);
  const refs = { nombre: useRef(null), telefono1: useRef(null), telefono2: useRef(null) };

  function irACampo(campo) {
    const input = refs[campo]?.current;
    if (!input) return;
    try {
      input.measureLayout(
        contenidoRef.current,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 60), animated: true }),
        () => {}
      );
    } catch {
      // si no se puede medir, al menos se enfoca
    }
    setTimeout(() => input.focus(), 250);
  }

  // Al escribir en un campo marcado, se quita su marca de error
  const limpiarError = (campo) => errores.includes(campo) && setErrores((prev) => prev.filter((c) => c !== campo));

  return (
    <View style={styles.screen}>
    <FormScroll ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 }}>
      <View ref={contenidoRef} collapsable={false}>
      <Campo label="Nombre *" error={errores.includes("nombre")}>
        <TextInput
          ref={refs.nombre}
          style={[styles.input, conError("nombre")]}
          value={nombre}
          onChangeText={(v) => { setNombre(v); limpiarError("nombre"); }}
          placeholder="Juan"
          placeholderTextColor={colors.ink500}
        />
      </Campo>
      <Fila>
        <Campo label="Apellido paterno" flex>
          <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={paterno} onChangeText={setPaterno} placeholder="Pérez" />
        </Campo>
        <Campo label="Apellido materno" flex>
          <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={materno} onChangeText={setMaterno} placeholder="López" />
        </Campo>
      </Fila>
      <Campo label="Teléfono principal *" error={errores.includes("telefono1")} mensajeError={mensajeErrorCampo("telefono1")}>
          <TextInput
            ref={refs.telefono1}
            style={[styles.input, conError("telefono1")]}
            value={telefono1}
            onChangeText={(v) => { setTelefono1(soloDigitos(v)); limpiarError("telefono1"); }}
            keyboardType="phone-pad"
            maxLength={10}
            placeholder="33 0000 0000"
            placeholderTextColor={colors.ink500}
          />
        </Campo>
      <Campo label="Correo" error={errores.includes("correo")} mensajeError={mensajeErrorCampo("correo")}>
        <TextInput placeholderTextColor={colors.ink500} style={[styles.input, conError("correo")]} value={correo} onChangeText={(v) => { setCorreo(v); limpiarError("correo"); }} keyboardType="email-address" autoCapitalize="none" placeholder="correo@ejemplo.com" />
      </Campo>
      <TouchableOpacity style={styles.masDatos} onPress={() => setMasDatos((v) => !v)} activeOpacity={0.7}>
        <Text style={styles.masDatosTexto}>{masDatos ? "▲ Ocultar datos opcionales" : "▼ Más datos (dirección, empresa, RFC…)"}</Text>
      </TouchableOpacity>
      {masDatos && (
        <View>
      <Campo label="Teléfono secundario" error={errores.includes("telefono2")} mensajeError={mensajeErrorCampo("telefono2")}>
          <TextInput
            ref={refs.telefono2}
            placeholderTextColor={colors.ink500}
            style={[styles.input, conError("telefono2")]}
            value={telefono2}
            onChangeText={(v) => { setTelefono2(soloDigitos(v)); limpiarError("telefono2"); }}
            keyboardType="phone-pad"
            maxLength={10}
            placeholder="Opcional"
          />
        </Campo>
      <Fila>
        <Campo label="Empresa" flex>
          <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={empresa} onChangeText={setEmpresa} placeholder="Opcional" />
        </Campo>
        <Campo label="RFC" flex>
          <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={rfc} onChangeText={setRfc} autoCapitalize="characters" placeholder="Opcional" />
        </Campo>
      </Fila>

      <Text style={styles.divider}>Dirección</Text>

      <Campo label="Código postal">
        <TextInput placeholderTextColor={colors.ink500}
          style={styles.input}
          value={cp}
          onChangeText={buscarCp}
          keyboardType="numeric"
          maxLength={5}
          placeholder="37000"
        />
      </Campo>
      {buscandoCp && <Text style={styles.hint}>Buscando…</Text>}

      <Fila>
        <Campo label="Estado" flex>
          <View style={styles.pickerWrap}>
            <Picker titulo="Estado" style={{ color: colors.ink900 }} dropdownIconColor={colors.ink500} selectedValue={estado} onValueChange={setEstado}>
              <Picker.Item label="-- Selecciona --" value="" />
              {ESTADOS_MEXICO.map((e) => <Picker.Item key={e} label={e} value={e} />)}
            </Picker>
          </View>
        </Campo>
        <Campo label="Municipio/Ciudad" flex>
          <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={municipio} onChangeText={setMunicipio} placeholder="Se llena con el CP" />
        </Campo>
      </Fila>

      <Campo label="Colonia">
        <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={colonia} onChangeText={setColonia} placeholder="Escribe o elige del CP" />
        {coloniasSugeridas.length > 0 && (
          <View style={styles.sugerencias}>
            {coloniasSugeridas.map((c) => (
              <TouchableOpacity key={c} style={styles.sugerenciaItem} onPress={() => setColonia(c)}>
                <Text style={styles.sugerenciaTexto}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Campo>

      <Campo label="Calle">
        <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={calle} onChangeText={setCalle} placeholder="Av. Siempre Viva" />
      </Campo>
      <Fila>
        <Campo label="Número ext." flex>
          <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={numExt} onChangeText={setNumExt} placeholder="123" />
        </Campo>
        <Campo label="Número int." flex>
          <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={numInt} onChangeText={setNumInt} placeholder="Opcional" />
        </Campo>
      </Fila>

      <Text style={styles.divider}>Otros</Text>
      <Campo label="Comentarios">
        <TextInput placeholderTextColor={colors.ink500} style={[styles.input, styles.textarea]} value={comentarios} onChangeText={setComentarios} multiline placeholder="Notas sobre el cliente" />
      </Campo>

        </View>
      )}
      </View>
    </FormScroll>
    <View style={styles.pie}>
      <TouchableOpacity style={styles.button} onPress={guardar} disabled={guardando}>
        <Text style={styles.buttonText}>{guardando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar cliente"}</Text>
      </TouchableOpacity>
    </View>
    </View>
  );
}

function Fila({ children }) {
  return <View style={styles.fila}>{children}</View>;
}

function Campo({ label, flex, error, mensajeError, children }) {
  return (
    <View style={[styles.campo, flex && { flex: 1 }]}>
      <Text style={[styles.label, error && styles.labelError]}>{label}</Text>
      {children}
      {error ? <Text style={styles.errorCampo}>{mensajeError || "Este dato es obligatorio"}</Text> : null}
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  fila: { flexDirection: "row", gap: spacing.sm },
  campo: { marginBottom: spacing.md },
  label: { fontSize: 12, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 7 },
  input: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 10, fontSize: 14, color: colors.ink900 },
  inputError: { borderColor: colors.red600, borderWidth: 2 },
  labelError: { color: colors.red600 },
  errorCampo: { fontSize: 12, color: colors.red600, marginTop: 4 },
  textarea: { minHeight: 70, textAlignVertical: "top" },
  pickerWrap: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, overflow: "hidden" },
  divider: { fontSize: 11, fontWeight: "700", color: colors.petrol600, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: "#e2e5e6" },
  hint: { fontSize: 11, color: colors.ink500, marginTop: -8, marginBottom: 8 },
  sugerencias: { backgroundColor: colors.paper100, borderWidth: 1, borderColor: colors.ink300, borderTopWidth: 0, borderRadius: 8, marginTop: -4 },
  sugerenciaItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: "#f0f0ee" },
  sugerenciaTexto: { fontSize: 13, color: colors.ink900 },
  error: { color: colors.red600, fontSize: 13, marginBottom: spacing.sm },
  masDatos: { alignSelf: "flex-start", paddingVertical: 10, marginBottom: spacing.sm },
  masDatosTexto: { fontSize: 14, fontWeight: "700", color: colors.petrol600 },
  pie: { paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.ink300, backgroundColor: colors.paper0 },
  button: { backgroundColor: colors.petrol500, borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: colors.paper100, fontWeight: "800", fontSize: 14, textTransform: "uppercase" },
});
