import ScrollCampos from "../ui/ScrollCampos";
import { useCallback, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Modal, KeyboardAvoidingView, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "../ui/Picker";
import { useFocusEffect } from "@react-navigation/native";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta, mostrarDialogo } from "../ui/Dialogo";
import { useAuth } from "../context/AuthContext";
import { soloDigitos, telefonoValido, MENSAJE_TELEFONO_INVALIDO } from "../validaciones";

const inicialesCliente = (c) => `${(c.nombre_cliente || "?")[0]}${(c.paterno_cliente || "")[0] || ""}`.toUpperCase();

export default function UsuariosScreen({ navigation }) {
  const { user: usuarioActual } = useAuth();
  const [tab, setTab] = useState("usuarios"); // "usuarios" | "clientes"

  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(null); // null = creando, objeto = editando

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [idRol, setIdRol] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [empleados, setEmpleados] = useState([]);
  const [idEmpleado, setIdEmpleado] = useState("");

  const [clientes, setClientes] = useState([]);
  const [qClientes, setQClientes] = useState("");
  const [cargandoClientes, setCargandoClientes] = useState(false);

  async function cargar() {
    const [u, r] = await Promise.all([api.get("/usuarios/"), api.get("/roles/")]);
    setUsuarios(u);
    setRoles(r);
    if (!idRol && r.length) setIdRol(r[0].id_rol);
    // El catálogo de empleados es exclusivo del Dueño — si el rol actual
    // no tiene permiso, simplemente no se ofrece el vínculo.
    try {
      setEmpleados(await api.get("/empleados/"));
    } catch {
      setEmpleados([]);
    }
  }

  async function cargarClientes(query = qClientes) {
    setCargandoClientes(true);
    try {
      const lista = await api.get(`/clientes/?solo_activos=true${query ? `&q=${encodeURIComponent(query)}` : ""}`);
      setClientes(lista);
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setCargandoClientes(false);
    }
  }

  function generarAccesoCliente(cl) {
    mostrarDialogo({
      tono: cl.cuenta_activada ? "peligro" : "info",
      titulo: cl.cuenta_activada ? "Restablecer acceso" : "Generar acceso a la app",
      mensaje: cl.cuenta_activada
        ? `"${cl.nombre_cliente}" ya puede entrar a la app. ¿Generar una contraseña temporal nueva? La anterior deja de servir.`
        : `Se creará un usuario (su teléfono o correo) y una contraseña temporal para que "${cl.nombre_cliente}" entre a la app de clientes.`,
      acciones: [
        { texto: "Cancelar", tipo: "secundario" },
        {
          texto: cl.cuenta_activada ? "Restablecer" : "Generar",
          tipo: "primario",
          onPress: async () => {
            try {
              const { identificador, password_temporal } = await api.post(`/clientes/${cl.id_cliente}/generar-acceso`);
              await cargarClientes();
              alerta(
                "Acceso listo",
                `Usuario: ${identificador}
Contraseña temporal: ${password_temporal}

Compártesela al cliente — puede cambiarla luego desde su app.`
              );
            } catch (err) {
              alerta("Error", err.message);
            }
          },
        },
      ],
    });
  }

  useFocusEffect(
    useCallback(() => {
      cargar().catch((err) => alerta("Error", err.message));
      cargarClientes();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );
  useActualizacionGlobal("usuarios", () => cargar().catch(() => {}));
  useActualizacionGlobal("clientes", () => cargarClientes());

  function limpiarFormulario() {
    setUsername(""); setPassword(""); setNombreCompleto("");
    setTelefono(""); setCorreo(""); setIdEmpleado(""); setEditando(null);
  }

  function abrirNuevo() {
    limpiarFormulario();
    if (roles.length) setIdRol(roles[0].id_rol);
    setModalAbierto(true);
  }

  function abrirEdicion(u) {
    setEditando(u);
    setUsername(u.username);
    setPassword("");
    setNombreCompleto(u.nombre_completo);
    setIdRol(u.rol?.id_rol ?? u.id_rol ?? "");
    setTelefono(u.telefono || "");
    setCorreo(u.correo || "");
    const empleadoLigado = empleados.find((e) => e.id_usuario === u.id_usuario);
    setIdEmpleado(empleadoLigado ? empleadoLigado.id_empleado : "");
    setModalAbierto(true);
  }

  // Empleados que se pueden ofrecer para vincular: los que no tienen ya
  // una cuenta ligada, más el que ya está ligado al usuario que se edita
  // (para no desaparecerlo de la lista al abrir su propia edición).
  const empleadosDisponibles = empleados.filter((e) => !e.id_usuario || (editando && e.id_usuario === editando.id_usuario));

  async function sincronizarVinculoEmpleado(idUsuarioResultante) {
    const anterior = empleados.find((e) => e.id_usuario === idUsuarioResultante);
    const nuevoId = idEmpleado ? Number(idEmpleado) : null;
    if (anterior && anterior.id_empleado !== nuevoId) {
      const { id_empleado, fecha_creacion, ...datos } = anterior;
      await api.put(`/empleados/${id_empleado}`, { ...datos, id_usuario: null });
    }
    if (nuevoId && (!anterior || anterior.id_empleado !== nuevoId)) {
      const empleado = empleados.find((e) => e.id_empleado === nuevoId);
      if (empleado) {
        const { id_empleado, fecha_creacion, ...datos } = empleado;
        await api.put(`/empleados/${id_empleado}`, { ...datos, id_usuario: idUsuarioResultante });
      }
    }
  }

  async function guardar() {
    if (!nombreCompleto.trim() || !idRol || (!editando && (!username.trim() || !password.trim()))) {
      alerta("Falta información", "Usuario, contraseña, nombre completo y rol son obligatorios.");
      return;
    }
    if (!telefonoValido(telefono, { opcional: true })) {
      alerta("Teléfono inválido", MENSAJE_TELEFONO_INVALIDO);
      return;
    }
    setGuardando(true);
    try {
      let idUsuarioResultante;
      if (editando) {
        await api.put(`/usuarios/${editando.id_usuario}`, {
          nombre_completo: nombreCompleto.trim(),
          id_rol: Number(idRol),
          telefono: telefono.trim() || null,
          correo: correo.trim() || null,
        });
        idUsuarioResultante = editando.id_usuario;
      } else {
        const creado = await api.post("/usuarios/", {
          username: username.trim(),
          password: password.trim(),
          nombre_completo: nombreCompleto.trim(),
          id_rol: Number(idRol),
          telefono: telefono.trim() || null,
          correo: correo.trim() || null,
        });
        idUsuarioResultante = creado.id_usuario;
      }
      await sincronizarVinculoEmpleado(idUsuarioResultante);
      await cargar();
      setModalAbierto(false);
      limpiarFormulario();
    } catch (err) {
      alerta("Error", err.message);
    } finally {
      setGuardando(false);
    }
  }

  function confirmarDesactivar(u) {
    mostrarDialogo({
      tono: "peligro",
      titulo: "Desactivar usuario",
      mensaje: `¿Desactivar a "${u.nombre_completo}"? Ya no podrá iniciar sesión, pero su historial se conserva.`,
      acciones: [
        { texto: "Cancelar", tipo: "secundario" },
        {
          texto: "Desactivar",
          tipo: "peligro",
          onPress: async () => {
            try {
              await api.put(`/auth/usuarios/${u.id_usuario}/desactivar`);
              await cargar();
              alerta("Listo", `${u.nombre_completo} fue desactivado.`);
              setModalAbierto(false);
            } catch (err) {
              alerta("Error", err.message);
            }
          },
        },
      ],
    });
  }

  async function reactivar(u) {
    try {
      await api.put(`/usuarios/${u.id_usuario}`, { activo: true });
      await cargar();
      alerta("Listo", `${u.nombre_completo} fue reactivado.`);
      setModalAbierto(false);
    } catch (err) {
      alerta("Error", err.message);
    }
  }

  const esUsuarioActual = editando && usuarioActual?.username && editando.username === usuarioActual.username;

  return (
    <View style={styles.screen}>
      <View style={styles.segmentado}>
        <TouchableOpacity style={[styles.segmento, tab === "usuarios" && styles.segmentoActivo]} onPress={() => setTab("usuarios")}>
          <Ionicons name="key-outline" size={15} color={tab === "usuarios" ? colors.paper100 : colors.ink700} />
          <Text style={[styles.segmentoTexto, tab === "usuarios" && styles.segmentoTextoActivo]}>Usuarios</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmento, tab === "clientes" && styles.segmentoActivo]} onPress={() => setTab("clientes")}>
          <Ionicons name="people-outline" size={15} color={tab === "clientes" ? colors.paper100 : colors.ink700} />
          <Text style={[styles.segmentoTexto, tab === "clientes" && styles.segmentoTextoActivo]}>Clientes</Text>
        </TouchableOpacity>
      </View>

      {tab === "usuarios" ? (
        <>
          <FlatList
            data={usuarios}
            keyExtractor={(item) => String(item.id_usuario)}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.row, !item.activo && styles.rowInactiva]} onPress={() => abrirEdicion(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.nombre_completo} <Text style={styles.rowUsername}>@{item.username}</Text></Text>
                  <Text style={styles.rowSubtitle}>{item.correo || "sin correo"} · {item.telefono || "sin teléfono"}</Text>
                </View>
                {!item.activo && <Text style={styles.badgeInactivo}>Inactivo</Text>}
                <Text style={[styles.badge, item.rol?.nombre === "Administrador General" && styles.badgePetrol]}>{item.rol?.nombre}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Sin usuarios.</Text>}
          />

          <TouchableOpacity style={styles.fab} onPress={abrirNuevo}>
            <Text style={styles.fabTexto}>+</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.buscadorClientes}>
            <Ionicons name="search" size={17} color={colors.ink500} />
            <TextInput
              style={styles.buscadorClientesInput}
              placeholder="Buscar cliente"
              placeholderTextColor={colors.ink500}
              value={qClientes}
              onChangeText={(t) => { setQClientes(t); cargarClientes(t); }}
            />
            {qClientes ? (
              <TouchableOpacity onPress={() => { setQClientes(""); cargarClientes(""); }} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.ink500} />
              </TouchableOpacity>
            ) : null}
          </View>
          <FlatList
            data={clientes}
            keyExtractor={(item) => String(item.id_cliente)}
            contentContainerStyle={{ paddingBottom: 40 }}
            refreshing={cargandoClientes}
            onRefresh={() => cargarClientes()}
            renderItem={({ item: cl }) => {
              const identificador = cl.telefono1 || cl.correo_cliente;
              return (
                <View style={styles.rowCliente}>
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}
                    onPress={() => navigation.navigate("Clientes", { screen: "ClienteDetalle", params: { cliente: cl } })}
                    activeOpacity={0.75}
                  >
                    <View style={styles.avatarCliente}><Text style={styles.avatarClienteTexto}>{inicialesCliente(cl)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{cl.nombre_cliente} {cl.paterno_cliente || ""}</Text>
                      <Text style={styles.rowSubtitle}>{identificador || "Sin teléfono ni correo"}</Text>
                      <View style={styles.badgeAccesoFila}>
                        <Ionicons name={cl.cuenta_activada ? "checkmark-circle" : "ellipse-outline"} size={12} color={cl.cuenta_activada ? colors.petrol600 : colors.ink500} />
                        <Text style={[styles.badgeAccesoTexto, cl.cuenta_activada && styles.badgeAccesoTextoActivo]}>
                          {cl.cuenta_activada ? "Con acceso a la app" : "Sin acceso a la app"}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.botonAcceso} onPress={() => generarAccesoCliente(cl)} hitSlop={6}>
                    <Ionicons name="key-outline" size={17} color={colors.petrol600} />
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>{qClientes ? "Nadie coincide con la búsqueda." : "Aún no hay clientes."}</Text>}
          />

          <TouchableOpacity
            style={styles.fabExtendido}
            onPress={() => navigation.navigate("Clientes", { screen: "ClienteForm" })}
          >
            <Ionicons name="person-add" size={18} color={colors.paper100} />
            <Text style={styles.fabExtendidoTexto}>Nuevo cliente</Text>
          </TouchableOpacity>
        </>
      )}

      <Modal visible={modalAbierto} transparent animationType="slide" onRequestClose={() => setModalAbierto(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalSheet}>
            <ScrollCampos contentContainerStyle={{ paddingBottom: 4 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{editando ? "Editar usuario" : "Nuevo usuario"}</Text>
              <Text style={styles.label}>Usuario</Text>
              <TextInput
                placeholderTextColor={colors.ink500}
                style={[styles.input, editando && styles.inputDeshabilitado]}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                placeholder="jperez"
                editable={!editando}
              />
              {!editando && (
                <>
                  <Text style={styles.label}>Contraseña</Text>
                  <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
                </>
              )}
              <Text style={styles.label}>Nombre completo</Text>
              <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={nombreCompleto} onChangeText={setNombreCompleto} placeholder="Juan Pérez" />
              <Text style={styles.label}>Rol</Text>
              <View style={styles.pickerWrap}>
                <Picker titulo="Rol" estiloDisparador={{ paddingVertical: 12, paddingHorizontal: 12 }} selectedValue={idRol} onValueChange={setIdRol}>
                  {roles.map((r) => (
                    <Picker.Item key={r.id_rol} label={r.nombre} value={r.id_rol} />
                  ))}
                </Picker>
              </View>
              {empleadosDisponibles.length > 0 && (
                <>
                  <Text style={styles.label}>Empleado vinculado (opcional)</Text>
                  <View style={styles.pickerWrap}>
                    <Picker titulo="Empleado vinculado" estiloDisparador={{ paddingVertical: 12, paddingHorizontal: 12 }} selectedValue={idEmpleado} onValueChange={setIdEmpleado}>
                      <Picker.Item label="Ninguno" value="" />
                      {empleadosDisponibles.map((e) => (
                        <Picker.Item key={e.id_empleado} label={`${e.nombre} ${e.paterno || ""}`.trim()} value={e.id_empleado} />
                      ))}
                    </Picker>
                  </View>
                </>
              )}
              <Text style={styles.label}>Teléfono (opcional)</Text>
              <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={telefono} onChangeText={(v) => setTelefono(soloDigitos(v))} keyboardType="phone-pad" maxLength={10} />
              <Text style={styles.label}>Correo (opcional)</Text>
              <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={correo} onChangeText={setCorreo} autoCapitalize="none" keyboardType="email-address" />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.botonSecundario} onPress={() => { setModalAbierto(false); limpiarFormulario(); }}>
                  <Text style={styles.botonSecundarioTexto}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.boton} onPress={guardar} disabled={guardando}>
                  <Text style={styles.botonTexto}>{guardando ? "Guardando…" : "Guardar"}</Text>
                </TouchableOpacity>
              </View>

              {editando && !esUsuarioActual && (
                editando.activo ? (
                  <TouchableOpacity style={styles.botonPeligro} onPress={() => confirmarDesactivar(editando)}>
                    <Text style={styles.botonPeligroTexto}>Desactivar usuario</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.botonExito} onPress={() => reactivar(editando)}>
                    <Text style={styles.botonExitoTexto}>Reactivar usuario</Text>
                  </TouchableOpacity>
                )
              )}
              {editando && esUsuarioActual && (
                <Text style={styles.notaPropia}>No puedes desactivar tu propia cuenta.</Text>
              )}
            </ScrollCampos>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0, padding: spacing.lg },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink900, marginBottom: spacing.md },
  segmentado: { flexDirection: "row", backgroundColor: colors.paper100, borderRadius: 10, padding: 3, marginBottom: spacing.md },
  segmento: { flex: 1, flexDirection: "row", gap: 6, paddingVertical: 9, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  segmentoActivo: { backgroundColor: colors.petrol500 },
  segmentoTexto: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.ink700 },
  segmentoTextoActivo: { color: colors.paper100 },
  buscadorClientes: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper100, borderRadius: 12, paddingHorizontal: 12, height: 46, marginBottom: spacing.sm },
  buscadorClientesInput: { flex: 1, fontSize: 15, color: colors.ink900, height: "100%" },
  rowCliente: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper100, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  avatarCliente: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  avatarClienteTexto: { fontSize: 14, fontWeight: "700", color: colors.petrol600 },
  badgeAccesoFila: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  badgeAccesoTexto: { fontSize: 11, fontWeight: "600", color: colors.ink500 },
  badgeAccesoTextoActivo: { color: colors.petrol600 },
  botonAcceso: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.petrol100, alignItems: "center", justifyContent: "center" },
  fabExtendido: {
    position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", gap: 7, height: 52, paddingHorizontal: 18, borderRadius: 26,
    backgroundColor: colors.petrol500, elevation: 4,
  },
  fabExtendidoTexto: { fontSize: 15, fontWeight: "700", color: colors.paper100 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.paper100, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm, gap: 8 },
  rowInactiva: { opacity: 0.55 },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.ink900 },
  rowUsername: { fontSize: 12, fontWeight: "500", color: colors.ink500 },
  rowSubtitle: { fontSize: 12, color: colors.ink500, marginTop: 2 },
  badge: { fontSize: 11, fontWeight: "800", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 100, backgroundColor: "#ece9e2", color: colors.ink500, overflow: "hidden" },
  badgePetrol: { backgroundColor: colors.petrol100, color: colors.petrol600 },
  badgeInactivo: { fontSize: 11, fontWeight: "800", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 100, backgroundColor: colors.red100 || "#f8dfda", color: colors.red600 || "#c0392b", overflow: "hidden" },
  empty: { color: colors.ink500, fontSize: 13, textAlign: "center", marginTop: spacing.lg },
  fab: { position: "absolute", right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.petrol500, alignItems: "center", justifyContent: "center", elevation: 4 },
  fabTexto: { color: "#fff", fontSize: 28, fontWeight: "700", marginTop: -2 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(20,24,28,0.55)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.paper0, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 30, maxHeight: "85%" },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.ink900, textTransform: "uppercase", marginBottom: 12 },
  label: { fontSize: 11, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 10, fontSize: 14, color: colors.ink900 },
  inputDeshabilitado: { opacity: 0.5 },
  pickerWrap: { backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, overflow: "hidden" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  botonSecundario: { flex: 1, backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 14, alignItems: "center" },
  botonSecundarioTexto: { color: colors.ink900, fontWeight: "600" },
  boton: { flex: 1, backgroundColor: colors.petrol500, borderRadius: 8, padding: 14, alignItems: "center" },
  botonTexto: { color: "#fff", fontWeight: "800" },
  botonPeligro: { marginTop: 14, borderWidth: 1, borderColor: colors.red600 || "#c0392b", borderRadius: 8, padding: 12, alignItems: "center" },
  botonPeligroTexto: { color: colors.red600 || "#c0392b", fontWeight: "800" },
  botonExito: { marginTop: 14, backgroundColor: colors.petrol100, borderRadius: 8, padding: 12, alignItems: "center" },
  botonExitoTexto: { color: colors.petrol600, fontWeight: "800" },
  notaPropia: { marginTop: 14, fontSize: 12, color: colors.ink500, textAlign: "center", fontStyle: "italic" },
});
