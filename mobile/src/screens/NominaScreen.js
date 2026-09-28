import { useAuth } from "../context/AuthContext";
import ListaCrud from "../ui/ListaCrud";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CAMPOS = [
  { name: "fecha_inicio", label: "Fecha de inicio", type: "date", required: true },
  { name: "fecha_fin", label: "Fecha de fin", type: "date", required: true, mitad: true },
  {
    name: "periodicidad", label: "Periodicidad", type: "select", required: true,
    options: [
      { value: "semanal", label: "Semanal" },
      { value: "quincenal", label: "Quincenal" },
      { value: "mensual", label: "Mensual" },
    ],
  },
];

export default function NominaScreen({ navigation }) {
  const { hasPermission } = useAuth();

  return (
    <ListaCrud
      navigation={navigation}
      hasPermission={hasPermission}
      endpoint="/nomina/periodos"
      idCampo="id_periodo"
      etiqueta="periodo de nómina"
      icono="cash-outline"
      campos={CAMPOS}
      permisos={{ crear: "nomina.crear", eliminar: "nomina.eliminar" }}
      alTocar={(item, nav) => nav.navigate("PeriodoNominaDetalle", { id: item.id_periodo })}
      titulo={(p) => `${p.fecha_inicio} — ${p.fecha_fin}`}
      subtitulo={(p) => `${p.periodicidad[0].toUpperCase()}${p.periodicidad.slice(1)} · ${(p.recibos || []).length} recibo(s) · ${fmt((p.recibos || []).reduce((a, r) => a + (r.total_pagar || 0), 0))}`}
      badge={(p) => (p.status === "pagado" ? { texto: "pagado", tono: "teal" } : { texto: "abierto", tono: "warn" })}
      buscarEn={(p) => `${p.fecha_inicio} ${p.fecha_fin} ${p.periodicidad}`}
      textoVacio="Aún no hay periodos de nómina. Crea el primero con el botón +."
    />
  );
}
