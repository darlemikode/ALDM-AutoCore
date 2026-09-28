import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import ListaCrud from "../ui/ListaCrud";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const GRUPOS = { general: "Datos generales", costo: "Cantidad y costo" };

// Mismos campos y grupos que web-admin/src/pages/Herramientas.jsx
export default function HerramientasScreen({ navigation }) {
  const { hasPermission } = useAuth();
  const [marcas, setMarcas] = useState([]);
  const nombreMarca = (id) => marcas.find((m) => m.id_herramienta_marca === id)?.nombre_marca;

  const campos = [
    { name: "nombre_herramienta", label: "Nombre", required: true, grupo: "general", placeholder: "Juego de dados, torquímetro…" },
    { name: "modelo_herramienta", label: "Modelo", grupo: "general", mitad: true },
    { name: "medida_herramienta", label: "Medida", grupo: "general", mitad: true, placeholder: "1/2 pulg." },
    { name: "id_herramienta_marca", label: "Marca", type: "select", grupo: "general", options: marcas.map((m) => ({ value: m.id_herramienta_marca, label: m.nombre_marca })) },
    { name: "cantidad_herramienta", label: "Cantidad", type: "number", grupo: "costo", mitad: true },
    { name: "costo_herramienta", label: "Costo", type: "number", grupo: "costo", mitad: true },
    { name: "factura_herramienta", label: "Factura", grupo: "costo" },
    { name: "comentario", label: "Comentario", type: "textarea", grupo: "costo" },
  ];

  return (
    <ListaCrud
      navigation={navigation}
      hasPermission={hasPermission}
      endpoint="/herramientas/"
      idCampo="id_herramienta"
      etiqueta="herramienta"
      icono="hammer-outline"
      campos={campos}
      grupos={GRUPOS}
      fotos="herramienta"
      permisos={{ crear: "herramientas.crear", editar: "herramientas.editar", eliminar: "herramientas.eliminar" }}
      cargarExtra={() => api.get("/herramientas-marcas/").then(setMarcas).catch(() => setMarcas([]))}
      titulo={(h) => h.nombre_herramienta}
      subtitulo={(h) => [nombreMarca(h.id_herramienta_marca), h.modelo_herramienta, h.medida_herramienta, `${h.cantidad_herramienta ?? 1} pza`, h.costo_herramienta ? fmt(h.costo_herramienta) : null].filter(Boolean).join(" · ")}
      badge={(h) => (h.factura_herramienta ? { texto: `factura ${h.factura_herramienta}`, tono: "petrol" } : null)}
      buscarEn={(h) => `${h.nombre_herramienta} ${h.modelo_herramienta || ""} ${nombreMarca(h.id_herramienta_marca) || ""} ${h.medida_herramienta || ""}`}
      resumen={(lista) => [
        { etiqueta: "Piezas", valor: lista.reduce((a, h) => a + (Number(h.cantidad_herramienta) || 0), 0) },
        { etiqueta: "Valor del inventario", valor: fmt(lista.reduce((a, h) => a + (Number(h.costo_herramienta) || 0) * (Number(h.cantidad_herramienta) || 1), 0)) },
      ]}
      valoresParaEditar={(h) => ({ ...h, cantidad_herramienta: String(h.cantidad_herramienta ?? 1), costo_herramienta: h.costo_herramienta != null ? String(h.costo_herramienta) : "" })}
      prepararGuardar={(v) => ({
        nombre_herramienta: (v.nombre_herramienta || "").trim(),
        modelo_herramienta: v.modelo_herramienta?.trim() || null,
        id_herramienta_marca: v.id_herramienta_marca ? Number(v.id_herramienta_marca) : null,
        medida_herramienta: v.medida_herramienta?.trim() || null,
        cantidad_herramienta: parseInt(v.cantidad_herramienta, 10) || 1,
        costo_herramienta: parseFloat(v.costo_herramienta) || 0,
        factura_herramienta: v.factura_herramienta?.trim() || null,
        comentario: v.comentario?.trim() || null,
      })}
    />
  );
}
