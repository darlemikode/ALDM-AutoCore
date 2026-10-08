import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import FormScroll from "../ui/FormScroll";
import { api } from "../api";
import { colors, spacing } from "../theme";
import { crearEstilos } from "../ui/estilos";
import { alerta, mostrarDialogo } from "../ui/Dialogo";
import { useAuth } from "../context/AuthContext";
import BadgeIcono from "../ui/BadgeIcono";
import { MODULOS } from "../iconosModulo";

// Agrupa el catálogo de permisos por módulo, para mostrarlos organizados
// en vez de una lista plana de ~43 claves.
function agruparPorModulo(permisos) {
  const grupos = {};
  permisos.forEach((p) => {
    if (!grupos[p.modulo]) grupos[p.modulo] = [];
    grupos[p.modulo].push(p);
  });
  return grupos;
}

const ETIQUETA_MODULO = {
  clientes: "Clientes", vehiculos: "Vehículos", servicios: "Servicios (Órdenes)",
  refacciones: "Refacciones", herramientas: "Herramientas", proveedores: "Proveedores",
  catalogos: "Catálogos generales", usuarios: "Usuarios", promociones: "Promociones",
  empleados: "Empleados", nomina: "Nómina", configuracion: "Configuración", roles: "Roles y permisos",
  dashboard: "Panel", cotizaciones: "Cotizaciones", facturacion: "Facturación", citas: "Citas solicitadas",
  inventario: "Inventario", comisiones: "Comisiones", reportes: "Reportes", asistente: "Asistente",
  errores: "Errores del sistema", taller: "Datos del taller", sincronizacion: "Sincronización",
};
const TITULO_ICONO = {
  servicios: "Órdenes de servicio", catalogos: "Catálogos", roles: "Roles y permisos", usuarios: "Usuarios",
  configuracion: "Datos del taller", taller: "Datos del taller", citas: "Citas solicitadas", errores: "Errores del sistema",
  dashboard: "Panel",
};
const tituloModulo = (m) => ETIQUETA_MODULO[m] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : m);
function infoModulo(m) {
  const k = TITULO_ICONO[m] || tituloModulo(m);
  return MODULOS[k] || { icono: "apps-outline", color: colors.petrol500 };
}

const ETIQUETA_ACCION = { ver: "Ver", crear: "Crear", editar: "Editar", eliminar: "Eliminar", ver_por_cobrar: "Ver por cobrar", ver_precios: "Ver precios" };
const ICONO_ACCION = { ver: "eye-outline", crear: "add-circle-outline", editar: "create-outline", eliminar: "trash-outline", ver_por_cobrar: "cash-outline", ver_precios: "pricetag-outline" };

export default function GestionRolesScreen() {
  const { hasPermission } = useAuth();
  const puedeEditar = hasPermission ? hasPermission("roles.editar") : false;

  const [roles, setRoles] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [rolAbierto, setRolAbierto] = useState(null);
  const [guardandoId, setGuardandoId] = useState(null);
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [descNueva, setDescNueva] = useState("");

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [r, p] = await Promise.all([api.get("/roles/"), api.get("/roles/permisos-disponibles")]);
      setRoles(r || []);
      setPermisos(p || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los roles.");
    } finally {
      setCargando(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      cargar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  async function guardarPermisos(rol, clavesNuevas) {
    setGuardandoId(rol.id_rol);
    // Optimista: refleja el cambio de inmediato, revierte si falla.
    const anteriores = roles;
    setRoles((rs) => rs.map((r) => (r.id_rol === rol.id_rol ? { ...r, permisos: permisos.filter((p) => clavesNuevas.includes(p.clave)) } : r)));
    try {
      await api.put(`/roles/${rol.id_rol}`, { permisos: clavesNuevas });
    } catch (err) {
      setRoles(anteriores);
      alerta("Error", err.message);
    } finally {
      setGuardandoId(null);
    }
  }

  function alternarPermiso(rol, clave) {
    const actuales = rol.permisos.map((p) => p.clave);
    const nuevas = actuales.includes(clave) ? actuales.filter((c) => c !== clave) : [...actuales, clave];
    guardarPermisos(rol, nuevas);
  }

  function alternarModulo(rol, clavesModulo, todasActivas) {
    const actuales = rol.permisos.map((p) => p.clave);
    const nuevas = todasActivas
      ? actuales.filter((c) => !clavesModulo.includes(c))
      : Array.from(new Set([...actuales, ...clavesModulo]));
    guardarPermisos(rol, nuevas);
  }

  async function crearRol() {
    if (!nombreNuevo.trim()) {
      alerta("Falta información", "Ponle un nombre al rol nuevo.");
      return;
    }
    try {
      await api.post("/roles/", { nombre: nombreNuevo.trim(), descripcion: descNueva.trim() || null, permisos: [] });
      setCreando(false);
      setNombreNuevo("");
      setDescNueva("");
      await cargar();
      alerta("Listo", "Rol creado. Ábrelo para asignarle permisos.");
    } catch (err) {
      alerta("Error", err.message);
    }
  }

  function confirmarEliminar(rol) {
    mostrarDialogo({
      tono: "peligro",
      titulo: "Eliminar rol",
      mensaje: `¿Eliminar el rol "${rol.nombre}"? Esto no se puede deshacer.`,
      acciones: [
        { texto: "Cancelar", tipo: "secundario" },
        {
          texto: "Eliminar",
          tipo: "peligro",
          onPress: async () => {
            try {
              await api.del(`/roles/${rol.id_rol}`);
              setRolAbierto(null);
              await cargar();
              alerta("Listo", "Rol eliminado.");
            } catch (err) {
              alerta("Error", err.message);
            }
          },
        },
      ],
    });
  }

  const modulos = useMemo(() => [...new Set(permisos.map((p) => p.modulo))], [permisos]);

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.petrol500} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.errorTexto}>{error}</Text>
      </View>
    );
  }

  return (
    <FormScroll style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      <Text style={styles.subtitulo}>
        {puedeEditar
          ? "Toca un rol para ver y ajustar sus permisos por módulo. Los cambios se guardan al momento."
          : "Consulta de solo lectura — tu rol no tiene permiso para editar roles."}
      </Text>

      {roles.map((rol) => {
        const abierto = rolAbierto === rol.id_rol;
        const totalPermisos = rol.permisos.length;
        const grupos = agruparPorModulo(rol.permisos);
        return (
          <View key={rol.id_rol} style={styles.card}>
            <TouchableOpacity onPress={() => setRolAbierto(abierto ? null : rol.id_rol)} style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rolNombre}>
                  {rol.nombre} {rol.es_sistema && <Text style={styles.badgeBase}>Base</Text>}
                </Text>
                <Text style={styles.rolDescripcion}>{rol.descripcion}</Text>
              </View>
              <Text style={styles.contador}>{totalPermisos}/{permisos.length}</Text>
            </TouchableOpacity>

            {abierto && (
              <View style={styles.detalle}>
                {!puedeEditar ? (
                  Object.keys(grupos).length === 0 ? (
                    <Text style={styles.sinPermisos}>Sin permisos asignados.</Text>
                  ) : (
                    Object.keys(grupos).map((modulo) => (
                      <View key={modulo} style={styles.grupoModulo}>
                        <Text style={styles.moduloNombre}>{tituloModulo(modulo)}</Text>
                        <Text style={styles.moduloAcciones}>
                          {grupos[modulo].map((p) => ETIQUETA_ACCION[p.clave.split(".")[1]] || p.clave).join(", ")}
                        </Text>
                      </View>
                    ))
                  )
                ) : (
                  <>
                    {guardandoId === rol.id_rol && <Text style={styles.guardando}>Guardando…</Text>}
                    {modulos.map((modulo) => {
                      const permisosModulo = permisos.filter((p) => p.modulo === modulo);
                      const clavesModulo = permisosModulo.map((p) => p.clave);
                      const activas = rol.permisos.map((p) => p.clave);
                      const activosModulo = clavesModulo.filter((c) => activas.includes(c)).length;
                      const todasActivas = activosModulo === clavesModulo.length;
                      return (
                        <View key={modulo} style={styles.moduloCard}>
                          <View style={styles.moduloCardHeader}>
                            <BadgeIcono icono={infoModulo(modulo).icono} color={infoModulo(modulo).color} size={36} activo={activosModulo > 0} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.moduloTitulo}>{tituloModulo(modulo)}</Text>
                              <Text style={[styles.moduloContador, activosModulo === clavesModulo.length && { color: "#2e9e57" }]}>
                                {activosModulo === clavesModulo.length ? "Acceso completo" : activosModulo === 0 ? "Sin acceso" : `${activosModulo} de ${clavesModulo.length} permisos`}
                              </Text>
                            </View>
                            <TouchableOpacity style={styles.botonChico} onPress={() => alternarModulo(rol, clavesModulo, todasActivas)}>
                              <Ionicons name={todasActivas ? "close-circle-outline" : "checkmark-done-outline"} size={16} color={colors.ink700} />
                              <Text style={styles.botonChicoTexto}>{todasActivas ? "Quitar todos" : "Marcar todos"}</Text>
                          </TouchableOpacity>
                        </View>
                          <View style={styles.chips}>
                            {permisosModulo.map((p) => {
                              const activo = activas.includes(p.clave);
                              const cm = infoModulo(modulo).color;
                              return (
                                <TouchableOpacity
                                  key={p.clave}
                                  style={[styles.chip, activo && { backgroundColor: `${cm}2e`, borderColor: cm }]}
                                  onPress={() => alternarPermiso(rol, p.clave)}
                                >
                                  <Ionicons
                                    name={activo ? "checkmark-circle" : (ICONO_ACCION[p.clave.split(".")[1]] || "ellipse-outline")}
                                    size={18}
                                    color={activo ? cm : colors.ink500}
                                  />
                                  <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>
                                   {ETIQUETA_ACCION[p.clave.split(".")[1]] || p.clave}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                    {!rol.es_sistema && (
                      <TouchableOpacity style={styles.botonEliminar} onPress={() => confirmarEliminar(rol)}>
                        <Text style={styles.botonEliminarTexto}>Eliminar rol</Text>
                      </TouchableOpacity>
                    )}
                    {rol.es_sistema && (
                      <Text style={styles.notaBase}>Rol base del sistema — se pueden ajustar sus permisos, pero no eliminarlo.</Text>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        );
      })}

      {puedeEditar && (
        <View style={styles.card}>
          {!creando ? (
            <TouchableOpacity style={styles.filaNuevoRol} onPress={() => setCreando(true)}>
              <Ionicons name="add-circle-outline" size={16} color={colors.petrol600} />
              <Text style={styles.filaNuevoRolTexto}>Crear rol nuevo</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.detalle}>
              <Text style={styles.label}>Nombre del rol</Text>
              <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={nombreNuevo} onChangeText={setNombreNuevo} placeholder="Ej. Recepción nocturna" />
              <Text style={styles.label}>Descripción (opcional)</Text>
              <TextInput placeholderTextColor={colors.ink500} style={styles.input} value={descNueva} onChangeText={setDescNueva} placeholder="Para qué es este rol" />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.botonSecundario} onPress={() => { setCreando(false); setNombreNuevo(""); setDescNueva(""); }}>
                  <Text style={styles.botonSecundarioTexto}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.boton} onPress={crearRol}>
                  <Text style={styles.botonTexto}>Crear rol</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </FormScroll>
  );
}

const styles = crearEstilos({
  screen: { flex: 1, backgroundColor: colors.paper0 },
  centrado: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper0 },
  errorTexto: { color: colors.red600, fontSize: 14, textAlign: "center", padding: spacing.lg },
  subtitulo: { fontSize: 14, color: colors.ink500, marginBottom: spacing.lg },
  card: { backgroundColor: colors.paper100, borderRadius: 10, marginBottom: spacing.sm, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  rolNombre: { fontSize: 17, fontWeight: "700", color: colors.ink900 },
  badgeBase: { fontSize: 10, fontWeight: "800", color: colors.ink700, backgroundColor: colors.ink300, paddingHorizontal: 6, borderRadius: 6 },
  rolDescripcion: { fontSize: 13.5, color: colors.ink500, marginTop: 2 },
  contador: { fontSize: 14, fontWeight: "800", color: colors.petrol600, marginLeft: 8 },
  detalle: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.ink300 },
  guardando: { fontSize: 11, color: colors.petrol600, fontWeight: "700", marginTop: 8 },
  grupoModulo: { marginTop: 10 },
  moduloNombre: { fontSize: 12.5, fontWeight: "700", color: colors.ink700 },
  moduloAcciones: { fontSize: 12, color: colors.ink500, marginTop: 1 },
  sinPermisos: { fontSize: 12.5, color: colors.ink500, fontStyle: "italic", marginTop: 10 },
  moduloCard: { marginTop: 12, backgroundColor: colors.paper0, borderRadius: 12, padding: 12 },
  moduloCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  moduloTitulo: { fontSize: 16, fontWeight: "800", color: colors.ink900 },
  moduloContador: { fontSize: 13, fontWeight: "700", color: colors.ink500, marginTop: 1 },
  botonChico: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.ink300, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  botonChicoTexto: { fontSize: 12.5, fontWeight: "700", color: colors.ink700 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderColor: colors.ink300, backgroundColor: colors.paper100, borderRadius: 100, paddingVertical: 9, paddingHorizontal: 14, minWidth: 96 },
  chipActivo: { backgroundColor: colors.petrol500, borderColor: colors.petrol500 },
  chipTexto: { fontSize: 14, fontWeight: "700", color: colors.ink500 },
  chipTextoActivo: { color: colors.ink900 },
  notaBase: { fontSize: 11.5, color: colors.ink500, fontStyle: "italic", marginTop: 12 },
  botonEliminar: { marginTop: 14, borderWidth: 1, borderColor: colors.red600, borderRadius: 8, padding: 10, alignItems: "center" },
  botonEliminarTexto: { color: colors.red600, fontWeight: "800", fontSize: 12.5 },
  filaNuevoRol: { flexDirection: "row", gap: 6, padding: spacing.md, alignItems: "center", justifyContent: "center" },
  filaNuevoRolTexto: { color: colors.petrol600, fontWeight: "800", fontSize: 13.5 },
  label: { fontSize: 11, fontWeight: "700", color: colors.ink500, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 10, fontSize: 14, color: colors.ink900 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  botonSecundario: { flex: 1, backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300, borderRadius: 8, padding: 12, alignItems: "center" },
  botonSecundarioTexto: { color: colors.ink900, fontWeight: "600" },
  boton: { flex: 1, backgroundColor: colors.petrol500, borderRadius: 8, padding: 12, alignItems: "center" },
  botonTexto: { color: "#fff", fontWeight: "800" },
});
