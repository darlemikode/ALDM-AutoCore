import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import ListaCrud from "../ui/ListaCrud";
import { alerta } from "../ui/Dialogo";
import { colors } from "../theme";

const ESTATUS = [
  { value: "activo", label: "Activo" },
  { value: "vacaciones", label: "Vacaciones" },
  { value: "incapacidad", label: "Incapacidad" },
  { value: "suspendido", label: "Suspendido" },
  { value: "baja", label: "Baja" },
];
const COLOR_ESTATUS = {
  activo: [colors.teal100, colors.teal600], vacaciones: [colors.petrol100, colors.petrol600],
  incapacidad: [colors.warn100, colors.warn600], suspendido: [colors.red100, colors.red600], baja: [colors.paper0, colors.ink500],
};

function cambiarEstatus(emp, recargar) {
  const botones = ESTATUS.filter((x) => x.value !== (emp.estatus || "activo")).map((x) => ({
    text: x.label,
    style: x.value === "baja" ? "destructive" : undefined,
    onPress: async () => {
      try { await api.put(`/empleados/${emp.id_empleado}/estatus`, { estatus: x.value }); await recargar(); }
      catch (err) { alerta("Error", err.message); }
    },
  }));
  alerta("Cambiar estatus", `${emp.nombre}: elige el nuevo estatus.`, [...botones, { text: "Cancelar", style: "cancel" }]);
}

// Mismos campos y grupos que web-admin/src/pages/Empleados.jsx
const CAMPOS = [
  { name: "nombre", label: "Nombre", required: true, grupo: "personal" },
  { name: "paterno", label: "Apellido paterno", grupo: "personal", mitad: true },
  { name: "materno", label: "Apellido materno", grupo: "personal", mitad: true },
  { name: "telefono", label: "Teléfono", type: "phone", grupo: "contacto" },
  { name: "correo", label: "Correo", type: "email", grupo: "contacto" },
  { name: "puesto", label: "Puesto", grupo: "trabajo", placeholder: "Ej. Mecánico, Hojalatero" },
  { name: "fecha_ingreso", label: "Fecha de ingreso", type: "date", grupo: "trabajo" },
  { name: "estatus", label: "Estatus", type: "select", grupo: "trabajo", options: ESTATUS },
];
const GRUPOS = { personal: "Datos personales", contacto: "Contacto", trabajo: "Trabajo", nomina: "Nómina" };
const PERIODICIDADES = [
  { value: "semanal", label: "Semanal" },
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual", label: "Mensual" },
];

export default function EmpleadosScreen({ navigation }) {
  const { hasPermission } = useAuth();
  const [usuarios, setUsuarios] = useState([]);

  // Sueldo capturado POR PERIODO (lo que se paga cada semana / quincena / mes); el servidor guarda el equivalente mensual
  const PAGOS = { semanal: 4, quincenal: 2, mensual: 1 }; // pagos al mes
  const UNIDAD = { semanal: "semana", quincenal: "quincena", mensual: "mes" };
  const camposDe = (v) => {
    const per = v?.periodicidad_pago || "semanal";
    return CAMPOS.concat([{
      name: "id_usuario", label: "Cuenta de usuario ligada", type: "select", grupo: "trabajo",
      hint: "Opcional — para que vea su propio dashboard.",
      options: usuarios.map((u) => ({ value: u.id_usuario, label: `${u.nombre_completo || u.nombre_usuario || u.username} (@${u.username})` })),
    }]).concat(
      hasPermission("nomina.ver") ? [
        { name: "periodicidad_pago", label: "¿Cada cuándo se le paga?", type: "select", grupo: "nomina", options: PERIODICIDADES },
        { name: "sueldo_periodo", label: `Sueldo por ${UNIDAD[per] || "periodo"} ($)`, type: "number", grupo: "nomina", hint: `Lo que se le paga cada ${UNIDAD[per] || "periodo"}, tal cual.` },
      ] : []
    );
  };

  return (
    <ListaCrud
      navigation={navigation}
      hasPermission={hasPermission}
      endpoint="/empleados/"
      idCampo="id_empleado"
      etiqueta="empleado"
      icono="id-card-outline"
      campos={camposDe}
      valoresNuevo={{ periodicidad_pago: "semanal", estatus: "activo" }}
      valoresParaEditar={(e) => ({ ...e, periodicidad_pago: e.periodicidad_pago || "semanal", sueldo_periodo: e.sueldo_mensual != null ? String(Math.round(e.sueldo_mensual / (PAGOS[e.periodicidad_pago || "semanal"] || 4) * 100) / 100) : "" })}
      grupos={GRUPOS}
      permisos={{ crear: "empleados.crear", editar: "empleados.editar", eliminar: false }}
      cargarExtra={() => api.get("/auth/usuarios").then(setUsuarios).catch(() => setUsuarios([]))}
      titulo={(e) => `${e.nombre} ${e.paterno || ""} ${e.materno || ""}`.trim()}
      subtitulo={(e) => [e.puesto, e.telefono].filter(Boolean).join("\n")}
      derecha={(e, recargar) => {
        const est = e.estatus || "activo";
        const [fondo, texto] = COLOR_ESTATUS[est] || COLOR_ESTATUS.baja;
        const chip = (
          <View style={{ backgroundColor: fondo, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: texto, fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>{ESTATUS.find((x) => x.value === est)?.label || est}</Text>
          </View>
        );
        return hasPermission("empleados.editar")
          ? <TouchableOpacity onPress={() => cambiarEstatus(e, recargar)} hitSlop={8} activeOpacity={0.7}>{chip}</TouchableOpacity>
          : chip;
      }}
      buscarEn={(e) => `${e.nombre} ${e.paterno || ""} ${e.materno || ""} ${e.puesto || ""} ${e.telefono || ""}`}
      prepararGuardar={(v) => {
        const { sueldo_periodo, ...resto } = v;
        const hay = sueldo_periodo !== "" && sueldo_periodo != null;
        // el servidor trabaja con el equivalente mensual (4 semanales, 2 quincenales, 1 mensual); null = no tocar el sueldo
        const mensual = hay ? Number(sueldo_periodo) * (PAGOS[v.periodicidad_pago || "semanal"] || 4) : null;
        return { ...resto, periodicidad_pago: v.periodicidad_pago || "semanal", estatus: v.estatus || "activo", id_usuario: v.id_usuario ? Number(v.id_usuario) : null, fecha_ingreso: v.fecha_ingreso || null, sueldo_mensual: mensual };
      }}
    />
  );
}
