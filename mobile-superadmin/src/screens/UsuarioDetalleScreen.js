// Un usuario: sus datos, si es súper administrador, y A QUÉ TALLERES puede
// entrar y con qué rol en cada uno.
import { useState } from "react";
import { View, Text, ScrollView, Switch, TouchableOpacity, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import HojaFormulario from "../ui/HojaFormulario";
import { alerta } from "../ui/Dialogo";
import { Boton, Fila, Seccion, Tarjeta, confirmar, useCargar } from "../ui/comunes";

export default function UsuarioDetalleScreen({ route, navigation }) {
  const { id } = route.params;
  const { usuario: yo } = useAuth();
  const [hoja, setHoja] = useState(null); // "datos" | "password" | "taller" | {rolDe: membresia}
  const [rolesPorTaller, setRolesPorTaller] = useState({});
  const { datos, setDatos, recargar, refrescando } = useCargar(async () => {
    const [u, talleres] = await Promise.all([api.get("/superadmin/usuarios").then((l) => l.find((x) => x.id_usuario === id)), api.get("/superadmin/talleres")]);
    if (!u) throw new Error("Usuario no encontrado");
    navigation.setOptions({ title: u.username });
    return { u, talleres };
  }, [id]);

  if (!datos) return <View style={styles.screen} />;
  const { u, talleres } = datos;
  const soyYo = yo?.username === u.username;

  async function rolesDe(idTaller) {
    if (rolesPorTaller[idTaller]) return rolesPorTaller[idTaller];
    const roles = await api.get(`/superadmin/talleres/${idTaller}/roles`);
    setRolesPorTaller((m) => ({ ...m, [idTaller]: roles }));
    return roles;
  }

  async function guardarMembresias(lista) {
    try {
      const actualizado = await api.put(`/superadmin/usuarios/${id}/talleres`, lista.map((m) => ({ id_taller: m.id_taller, id_rol: m.id_rol, activo: m.activo })));
      setDatos({ ...datos, u: actualizado });
    } catch (err) {
      alerta("No se pudo guardar", err.message);
    }
  }

  async function actualizar(cuerpo) {
    const actualizado = await api.put(`/superadmin/usuarios/${id}`, cuerpo);
    setDatos({ ...datos, u: actualizado });
  }

  async function abrirRol(m) {
    try {
      await rolesDe(m.id_taller);
      setHoja({ rolDe: m });
    } catch (err) {
      alerta("No se pudieron cargar los roles", err.message);
    }
  }

  const quitar = (m) => confirmar("Quitar acceso", `${u.username} ya no podrá entrar a ${m.taller?.nombre_comercial}.`, "Quitar", () =>
    guardarMembresias(u.membresias.filter((x) => x.id_taller !== m.id_taller)));

  const disponibles = talleres.filter((t) => !u.membresias.some((m) => m.id_taller === t.id_taller));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => recargar(true)} />}>
      <Tarjeta>
        <Text style={styles.nombre}>{u.nombre_completo}</Text>
        <Fila etiqueta="Usuario" valor={`@${u.username}`} />
        <Fila etiqueta="Teléfono" valor={u.telefono} />
        <Fila etiqueta="Correo" valor={u.correo} />
        <View style={styles.switchFila}>
          <Text style={styles.switchTexto}>Cuenta activa</Text>
          <Switch value={u.activo} disabled={soyYo} onValueChange={(v) => actualizar({ activo: v }).catch((e) => alerta("No se pudo", e.message))} trackColor={{ true: colors.petrol500 }} />
        </View>
        <View style={styles.switchFila}>
          <Text style={styles.switchTexto}>Súper administrador (entra a esta app)</Text>
          <Switch value={u.es_superadmin} disabled={soyYo} onValueChange={(v) => actualizar({ es_superadmin: v }).catch((e) => alerta("No se pudo", e.message))} trackColor={{ true: colors.petrol500 }} />
        </View>
        <View style={styles.acciones}>
          <Boton texto="Editar datos" icono="create-outline" tipo="secundario" onPress={() => setHoja("datos")} style={{ flex: 1 }} />
          <Boton texto="Contraseña" icono="key-outline" tipo="secundario" onPress={() => setHoja("password")} style={{ flex: 1 }} />
        </View>
      </Tarjeta>

      <Seccion titulo={`Talleres (${u.membresias.length})`} accion={disponibles.length ? "Agregar" : null} onAccion={() => setHoja("taller")} />
      {u.membresias.length === 0 ? <Text style={styles.sub}>No tiene acceso a ningún taller.</Text> : u.membresias.map((m) => (
        <Tarjeta key={m.id_taller}>
          <View style={styles.membresia}>
            <Ionicons name="business-outline" size={20} color={colors.petrol600} />
            <View style={{ flex: 1 }}>
              <Text style={styles.taller}>{m.taller?.nombre_comercial}</Text>
              <TouchableOpacity onPress={() => abrirRol(m)}>
                <Text style={styles.rol}>{m.rol?.nombre} <Text style={styles.link}>· cambiar</Text></Text>
              </TouchableOpacity>
            </View>
            <Switch value={m.activo} onValueChange={(v) => guardarMembresias(u.membresias.map((x) => (x.id_taller === m.id_taller ? { ...x, activo: v } : x)))} trackColor={{ true: colors.petrol500 }} />
            <TouchableOpacity onPress={() => quitar(m)} hitSlop={10}><Ionicons name="trash-outline" size={19} color={colors.red600} /></TouchableOpacity>
          </View>
        </Tarjeta>
      ))}

      <HojaFormulario
        visible={hoja === "datos"}
        titulo="Datos del usuario"
        icono="person-outline"
        valoresIniciales={{ nombre_completo: u.nombre_completo, telefono: u.telefono || "", correo: u.correo || "" }}
        campos={[
          { name: "nombre_completo", label: "Nombre completo", required: true },
          { name: "telefono", label: "Teléfono", type: "phone" },
          { name: "correo", label: "Correo", type: "email" },
        ]}
        onGuardar={async (v) => { await actualizar({ nombre_completo: v.nombre_completo, telefono: v.telefono || null, correo: v.correo || null }); setHoja(null); }}
        onCerrar={() => setHoja(null)}
      />
      <HojaFormulario
        visible={hoja === "password"}
        titulo="Nueva contraseña"
        subtitulo="Compártela con el usuario por un medio seguro."
        icono="key-outline"
        campos={[{ name: "password", label: "Contraseña nueva", required: true, hint: "Mínimo 6 caracteres" }]}
        onGuardar={async (v) => { await actualizar({ password: v.password }); setHoja(null); alerta("Listo", "La contraseña se cambió."); }}
        onCerrar={() => setHoja(null)}
      />
      <HojaFormulario
        visible={hoja === "taller"}
        titulo="Dar acceso a un taller"
        subtitulo="Entra como Administrador General; después puedes cambiarle el rol."
        icono="business-outline"
        campos={[{ name: "id_taller", label: "Taller", type: "select", required: true, options: disponibles.map((t) => ({ value: t.id_taller, label: t.nombre_comercial })) }]}
        onGuardar={async (v) => {
          await guardarMembresias([...u.membresias, { id_taller: Number(v.id_taller), id_rol: null, activo: true }]);
          setHoja(null);
        }}
        onCerrar={() => setHoja(null)}
      />
      <HojaFormulario
        visible={!!hoja?.rolDe}
        titulo="Rol en el taller"
        subtitulo={hoja?.rolDe?.taller?.nombre_comercial}
        icono="shield-checkmark-outline"
        valoresIniciales={{ id_rol: hoja?.rolDe?.id_rol }}
        campos={[{ name: "id_rol", label: "Rol", type: "select", required: true, options: (rolesPorTaller[hoja?.rolDe?.id_taller] || []).map((r) => ({ value: r.id_rol, label: r.nombre })) }]}
        onGuardar={async (v) => {
          await guardarMembresias(u.membresias.map((x) => (x.id_taller === hoja.rolDe.id_taller ? { ...x, id_rol: Number(v.id_rol) } : x)));
          setHoja(null);
        }}
        onCerrar={() => setHoja(null)}
      />
    </ScrollView>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  nombre: { fontFamily: "BarlowCondensed_700Bold", fontSize: 24, color: colors.ink900, marginBottom: 4 },
  sub: { fontSize: 13, color: colors.ink700, marginBottom: 10 },
  switchFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  switchTexto: { fontSize: 14, color: colors.ink900, flex: 1 },
  acciones: { flexDirection: "row", gap: 10, marginTop: 10 },
  membresia: { flexDirection: "row", alignItems: "center", gap: 12 },
  taller: { fontSize: 15, fontWeight: "700", color: colors.ink900 },
  rol: { fontSize: 13, color: colors.ink700, marginTop: 2 },
  link: { color: colors.petrol600, fontWeight: "700" },
});
