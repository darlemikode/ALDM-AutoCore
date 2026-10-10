import { useMemo, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, RefreshControl, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import HojaFormulario from "../ui/HojaFormulario";
import { Badge, Fab, Vacio, useCargar } from "../ui/comunes";

export default function UsuariosScreen({ navigation }) {
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [taller, setTaller] = useState(""); // "" = todos · "sin" = sin taller · id del taller
  const { datos, recargar, refrescando } = useCargar(() => api.get("/superadmin/usuarios"));
  const talleres = useMemo(() => {
    const m = new Map();
    (datos || []).forEach((u) => u.membresias.forEach((x) => m.set(String(x.id_taller), x.taller?.nombre_comercial || `Taller ${x.id_taller}`)));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [datos]);
  const lista = useMemo(() => (datos || []).filter((u) => {
    if (taller === "sin" && u.membresias.length > 0) return false;
    if (taller && taller !== "sin" && !u.membresias.some((m) => String(m.id_taller) === taller)) return false;
    const texto = `${u.username} ${u.nombre_completo} ${u.correo || ""} ${u.membresias.map((m) => m.taller?.nombre_comercial || "").join(" ")}`.toLowerCase();
    return !q || texto.includes(q.toLowerCase());
  }), [datos, q, taller]);
  const opciones = [["", "Todos"], ...talleres, ["sin", "Sin taller"]];

  async function crear(v) {
    const u = await api.post("/superadmin/usuarios", {
      username: v.username, password: v.password, nombre_completo: v.nombre_completo,
      telefono: v.telefono || null, correo: v.correo || null, es_superadmin: !!v.es_superadmin, membresias: [],
    });
    setNuevo(false);
    navigation.navigate("UsuarioDetalle", { id: u.id_usuario });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.buscador}>
        <Ionicons name="search" size={18} color={colors.ink500} />
        <TextInput style={styles.buscadorInput} value={q} onChangeText={setQ} placeholder="Usuario, nombre, correo o taller" placeholderTextColor={colors.ink500} autoCapitalize="none" />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {opciones.map(([id, nombre]) => (
            <TouchableOpacity key={id || "todos"} style={[styles.chip, taller === id && styles.chipOn]} onPress={() => setTaller(id)}>
              <Text style={[styles.chipTexto, taller === id && styles.chipTextoOn]} numberOfLines={1}>{nombre}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={lista}
        keyExtractor={(u) => String(u.id_usuario)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => recargar(true)} />}
        ListEmptyComponent={datos ? <Vacio texto="Sin usuarios." icono="people-outline" /> : null}
        renderItem={({ item: u }) => (
          <TouchableOpacity style={styles.item} onPress={() => navigation.navigate("UsuarioDetalle", { id: u.id_usuario })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>{u.nombre_completo}</Text>
              <Text style={styles.sub}>@{u.username} · {u.membresias.length === 0 ? "sin talleres" : u.membresias.map((m) => m.taller?.nombre_comercial).join(", ")}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              {u.es_superadmin ? <Badge texto="súper admin" tono="blue" /> : null}
              {!u.activo ? <Badge texto="inactivo" tono="gris" /> : null}
            </View>
          </TouchableOpacity>
        )}
      />
      <Fab etiqueta="Nuevo usuario" onPress={() => setNuevo(true)} />
      <HojaFormulario
        visible={nuevo}
        titulo="Nuevo usuario"
        subtitulo="Después le asignas a qué talleres puede entrar."
        icono="person-add-outline"
        valoresIniciales={{ es_superadmin: false }}
        campos={[
          { name: "nombre_completo", label: "Nombre completo", required: true },
          { name: "username", label: "Usuario", required: true, autoCapitalize: "none" },
          { name: "password", label: "Contraseña", required: true, hint: "Mínimo 6 caracteres" },
          { name: "telefono", label: "Teléfono", type: "phone", mitad: true },
          { name: "correo", label: "Correo", type: "email", mitad: true },
          { name: "es_superadmin", label: "Súper administrador de ALDM", type: "checkbox", hint: "Puede entrar a esta app" },
        ]}
        onGuardar={crear}
        onCerrar={() => setNuevo(false)}
      />
    </View>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  buscador: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper100, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: colors.ink300, marginHorizontal: spacing.lg, marginTop: spacing.md },
  buscadorInput: { flex: 1, fontSize: 14.5, color: colors.ink900 },
  item: { flexDirection: "row", gap: 10, backgroundColor: colors.paper100, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.ink300 },
  nombre: { fontSize: 15, fontWeight: "700", color: colors.ink900 },
  sub: { fontSize: 12.5, color: colors.ink700, marginTop: 2 },
  chips: { gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  chip: { borderRadius: 100, borderWidth: 1, borderColor: colors.ink300, backgroundColor: colors.paper100, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 220 },
  chipOn: { backgroundColor: colors.petrol600, borderColor: colors.petrol600 },
  chipTexto: { fontSize: 14, fontWeight: "600", color: colors.ink700 },
  chipTextoOn: { color: "#fff" },
});
