import { useAuth } from "../context/AuthContext";
import ListaCrud from "../ui/ListaCrud";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Mismos campos que web-admin/src/pages/Cotizaciones.jsx
const CAMPOS = [
  { name: "titulo", label: "Título", required: true, placeholder: "Ej. Afinación mayor Nissan Versa" },
  { name: "vigente_hasta", label: "Vigente hasta", type: "date", hint: "Opcional." },
  { name: "iva_porcentaje", label: "Aplicar IVA (16%)", type: "checkbox", hint: "Sumar IVA al total" },
];

export default function CotizacionesScreen({ navigation }) {
  const { hasPermission } = useAuth();
  const vencida = (c) => c.vigente_hasta && new Date(c.vigente_hasta) < new Date(new Date().toDateString());
  return (
    <ListaCrud
      navigation={navigation}
      hasPermission={hasPermission}
      endpoint="/cotizaciones/"
      idCampo="id_cotizacion"
      etiqueta="cotización"
      icono="document-text-outline"
      campos={CAMPOS}
      permisos={{ crear: "cotizaciones.crear", editar: "cotizaciones.editar", eliminar: "cotizaciones.eliminar" }}
      titulo={(c) => `#${c.id_cotizacion} · ${c.titulo}`}
      subtitulo={(c) => `${(c.detalles || []).length} concepto(s) · ${fmt(c.costos?.total)} · ${new Date(c.fecha_cotizacion).toLocaleDateString("es-MX")}`}
      badge={(c) => (vencida(c) ? { texto: "vencida", tono: "red" } : c.vigente_hasta ? { texto: `vigente al ${String(c.vigente_hasta).slice(0, 10)}`, tono: "teal" } : null)}
      buscarEn={(c) => `${c.id_cotizacion} ${c.titulo}`}
      valoresParaEditar={(c) => ({ ...c, iva_porcentaje: (c.iva_porcentaje ?? 16) > 0, vigente_hasta: c.vigente_hasta ? String(c.vigente_hasta).slice(0, 10) : "" })}
      prepararGuardar={(v) => ({ titulo: v.titulo, vigente_hasta: v.vigente_hasta || null, iva_porcentaje: v.iva_porcentaje ? 16 : 0, comentarios: v.comentarios ?? null })}
      alTocar={(c, nav) => nav.navigate("CotizacionDetalle", { id: c.id_cotizacion })}
      despuesDeCrear={(c, nav) => nav.navigate("CotizacionDetalle", { id: c.id_cotizacion })}
      textoVacio="Aún no hay cotizaciones. Toca + para armar un presupuesto."
    />
  );
}
