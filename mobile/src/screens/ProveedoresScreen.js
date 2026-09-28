import { useAuth } from "../context/AuthContext";
import ListaCrud from "../ui/ListaCrud";

// Mismos campos y grupos que web-admin/src/pages/Proveedores.jsx
const CAMPOS = [
  { name: "nombre_proveedor", label: "Nombre", required: true, grupo: "general" },
  { name: "empresa_proveedor", label: "Empresa", grupo: "general" },
  { name: "rfc_proveedor", label: "RFC", grupo: "general", autoCapitalize: "characters" },
  { name: "telefono1_proveedor", label: "Teléfono principal", type: "phone", grupo: "contacto", mitad: true },
  { name: "telefono2_proveedor", label: "Teléfono secundario", type: "phone", grupo: "contacto", mitad: true },
  { name: "correo_proveedor", label: "Correo", type: "email", grupo: "contacto" },
  { name: "calle_proveedor", label: "Calle", grupo: "direccion" },
  { name: "numexterior_proveedor", label: "Número ext.", grupo: "direccion", mitad: true },
  { name: "numinterior_proveedor", label: "Número int.", grupo: "direccion", mitad: true },
  { name: "colonia_proveedor", label: "Colonia", grupo: "direccion" },
];
const GRUPOS = { general: "Datos generales", contacto: "Contacto", direccion: "Dirección" };

export default function ProveedoresScreen({ navigation }) {
  const { hasPermission } = useAuth();
  return (
    <ListaCrud
      navigation={navigation}
      hasPermission={hasPermission}
      endpoint="/proveedores/"
      idCampo="id_proveedor"
      etiqueta="proveedor"
      icono="business-outline"
      campos={CAMPOS}
      grupos={GRUPOS}
      permisos={{ crear: "proveedores.crear", editar: "proveedores.editar", eliminar: "proveedores.eliminar" }}
      titulo={(p) => p.nombre_proveedor}
      subtitulo={(p) => [p.empresa_proveedor, p.telefono1_proveedor, p.correo_proveedor].filter(Boolean).join(" · ")}
      buscarEn={(p) => `${p.nombre_proveedor} ${p.empresa_proveedor || ""} ${p.telefono1_proveedor || ""} ${p.rfc_proveedor || ""}`}
      alTocar={(p, nav) => nav.navigate("ProveedorDetalle", { proveedor: p })}
    />
  );
}
