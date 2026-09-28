import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import ListaCrud from "../ui/ListaCrud";

// Mismos campos y grupos que web-admin/src/pages/Empleados.jsx
const CAMPOS = [
  { name: "nombre", label: "Nombre", required: true, grupo: "personal" },
  { name: "paterno", label: "Apellido paterno", grupo: "personal", mitad: true },
  { name: "materno", label: "Apellido materno", grupo: "personal", mitad: true },
  { name: "telefono", label: "Teléfono", type: "phone", grupo: "contacto" },
  { name: "correo", label: "Correo", type: "email", grupo: "contacto" },
  { name: "puesto", label: "Puesto", grupo: "trabajo", placeholder: "Ej. Mecánico, Hojalatero" },
  { name: "fecha_ingreso", label: "Fecha de ingreso", type: "date", grupo: "trabajo" },
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

  const campos = CAMPOS.concat([{
    name: "id_usuario", label: "Cuenta de usuario ligada", type: "select", grupo: "trabajo",
    hint: "Opcional — para que vea su propio dashboard.",
    options: usuarios.map((u) => ({ value: u.id_usuario, label: `${u.nombre_completo || u.nombre_usuario || u.username} (@${u.username})` })),
  }]).concat(
    hasPermission("nomina.ver") ? [
      { name: "sueldo_base", label: "Sueldo base", type: "number", grupo: "nomina", hint: "Por periodo, según la periodicidad de pago." },
      { name: "periodicidad_pago", label: "Periodicidad de pago", type: "select", grupo: "nomina", options: PERIODICIDADES },
    ] : []
  );

  return (
    <ListaCrud
      navigation={navigation}
      hasPermission={hasPermission}
      endpoint="/empleados/"
      idCampo="id_empleado"
      etiqueta="empleado"
      icono="id-card-outline"
      campos={campos}
      grupos={GRUPOS}
      permisos={{ crear: "empleados.crear", editar: "empleados.editar", eliminar: "empleados.eliminar" }}
      cargarExtra={() => api.get("/auth/usuarios").then(setUsuarios).catch(() => setUsuarios([]))}
      titulo={(e) => `${e.nombre} ${e.paterno || ""} ${e.materno || ""}`.trim()}
      subtitulo={(e) => [e.puesto, e.telefono, e.correo].filter(Boolean).join(" · ")}
      badge={(e) => (e.activo === false ? { texto: "inactivo", tono: "gris" } : e.id_usuario ? { texto: "con cuenta", tono: "teal" } : null)}
      buscarEn={(e) => `${e.nombre} ${e.paterno || ""} ${e.materno || ""} ${e.puesto || ""} ${e.telefono || ""}`}
      prepararGuardar={(v) => ({ ...v, id_usuario: v.id_usuario ? Number(v.id_usuario) : null, fecha_ingreso: v.fecha_ingreso || null, sueldo_base: Number(v.sueldo_base) || 0, periodicidad_pago: v.periodicidad_pago || "quincenal" })}
    />
  );
}
