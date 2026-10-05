import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import HojaFormulario from "../ui/HojaFormulario";
import { alerta } from "../ui/Dialogo";
import { colors } from "../theme";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import ListaCrud from "../ui/ListaCrud";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// ---- Fechas (en UTC para no depender de la zona horaria) ----
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (t) => (/^\d{4}-\d{2}-\d{2}$/.test(String(t || "").slice(0, 10)) ? new Date(`${String(t).slice(0, 10)}T00:00:00Z`) : null);
const hoy = () => { const d = new Date(); return iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))); };
const sumar = (d, n) => new Date(d.getTime() + n * 86400000);
const finDeMes = (y, m) => new Date(Date.UTC(y, m + 1, 0));

// Fecha fin sugerida según periodicidad, día de pago (semanal) y fecha de inicio.
function calcularFin(periodicidad, diaPago, inicio) {
  const d = parse(inicio);
  if (!d) return "";
  if (periodicidad === "semanal") {
    const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
    let falta = (Number(diaPago ?? 4) - dow + 7) % 7;
    if (falta === 0) falta = 7;
    return iso(sumar(d, falta));
  }
  if (periodicidad === "quincenal") {
    return d.getUTCDate() <= 14 ? iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15))) : iso(finDeMes(d.getUTCFullYear(), d.getUTCMonth()));
  }
  // mensual: mes natural si empieza el 1; si no, hasta el día anterior del mes siguiente
  if (d.getUTCDate() === 1) return iso(finDeMes(d.getUTCFullYear(), d.getUTCMonth()));
  return iso(sumar(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())), -1));
}
const recalcular = (v) => ({ fecha_fin: calcularFin(v.periodicidad, v.dia_pago, v.fecha_inicio) });

const camposNomina = (v, empleados = []) => {
  const ini = parse(v.fecha_inicio), fin = parse(v.fecha_fin);
  const invalido = ini && fin && fin < ini;
  const dias = ini && fin && !invalido ? Math.round((fin - ini) / 86400000) + 1 : null;
  return [
    {
      name: "periodicidad", label: "¿Cada cuándo se paga?", type: "select", required: true, onElegir: (_, n) => recalcular(n),
      options: [
        { value: "semanal", label: "Semanal" },
        { value: "quincenal", label: "Quincenal (15 y fin de mes)" },
        { value: "mensual", label: "Mensual" },
      ],
    },
    ...(v.periodicidad === "semanal" ? [{
      name: "dia_pago", label: "¿Qué día de la semana se paga?", type: "select", required: true, onElegir: (_, n) => recalcular(n),
      options: DIAS.map((l, i) => ({ value: String(i), label: l })),
    }] : []),
    { name: "fecha_inicio", label: "Empieza el", type: "date", required: true, onElegir: (_, n) => recalcular(n) },
    {
      name: "fecha_fin", label: "Termina el", type: "date", required: true,
      hint: invalido ? "⚠ Debe ser igual o posterior a la fecha de inicio." : dias ? `Se calcula sola · ${dias} día(s) de periodo` : "Se calcula sola al elegir inicio y periodicidad.",
    },
    {
      name: "empleados", label: "¿A quién se le paga?", type: "multiselect",
      hint: (v.empleados || []).length ? `${v.empleados.length} empleado(s) elegido(s)` : "Sin elegir = todos los empleados que cobran.",
      options: empleados,
    },
    { name: "recurrente", label: "Repetir automáticamente cada periodo", type: "checkbox" },
  ];
};

// ---- Generar varios periodos de golpe ----
const RANGOS = [
  { value: "mes", label: "Este mes" }, { value: "mes_sig", label: "Próximo mes" }, { value: "trimestre", label: "Este trimestre" },
  { value: "semestre", label: "Este semestre" }, { value: "anio", label: "Todo el año" },
];
function rangoDe(clave) {
  const h = new Date();
  const y = h.getFullYear(), m = h.getMonth();
  const u = (yy, mm, dd) => iso(new Date(Date.UTC(yy, mm, dd)));
  if (clave === "mes_sig") return [u(y, m + 1, 1), u(y, m + 2, 0)];
  if (clave === "trimestre") { const q = Math.floor(m / 3) * 3; return [u(y, q, 1), u(y, q + 3, 0)]; }
  if (clave === "semestre") { const q = m < 6 ? 0 : 6; return [u(y, q, 1), u(y, q + 6, 0)]; }
  if (clave === "anio") return [u(y, 0, 1), u(y, 12, 0)];
  return [u(y, m, 1), u(y, m + 1, 0)];
}
function camposLote(v, empleados) {
  const [d, h] = rangoDe(v.rango || "mes");
  const dias = Math.round((parse(h) - parse(d)) / 86400000) + 1;
  const aprox = v.periodicidad === "semanal" ? Math.ceil(dias / 7) : v.periodicidad === "quincenal" ? Math.round(dias / 15.2) : Math.round(dias / 30.4);
  return [
    { name: "rango", label: "¿Qué tanto quieres generar?", type: "select", required: true, options: RANGOS, hint: `Del ${d} al ${h} · aprox. ${aprox} periodo(s)` },
    {
      name: "periodicidad", label: "¿Cada cuándo se paga?", type: "select", required: true,
      options: [{ value: "semanal", label: "Semanal" }, { value: "quincenal", label: "Quincenal" }, { value: "mensual", label: "Mensual" }],
    },
    ...(v.periodicidad === "semanal" ? [{ name: "dia_pago", label: "¿Qué día de la semana se paga?", type: "select", required: true, options: DIAS.map((l, i) => ({ value: String(i), label: l })) }] : []),
    { name: "empleados", label: "¿A quién se le paga?", type: "multiselect", options: empleados, hint: "Sin elegir = todos los empleados que cobran. Los periodos que ya existan en esas fechas se respetan." },
  ];
}

export default function NominaScreen({ navigation }) {
  const { hasPermission } = useAuth();
  const [empleados, setEmpleados] = useState([]);
  const [lote, setLote] = useState(false);
  const [version, setVersion] = useState(0);

  const puedeCrear = hasPermission("nomina.crear");

  async function generarLote(v) {
    const [desde, hasta] = rangoDe(v.rango || "mes");
    const r = await api.post("/nomina/periodos/lote", {
      desde, hasta, periodicidad: v.periodicidad, dia_pago: Number(v.dia_pago ?? 4), empleados: (v.empleados || []).map(Number),
    });
    setLote(false);
    setVersion((n) => n + 1);
    alerta("Listo", `${r.creados} periodo(s) creado(s)${r.omitidos ? ` · ${r.omitidos} ya existían` : ""}.`);
  }

  return (
    <View style={{ flex: 1 }}>
    <ListaCrud
      key={version}
      navigation={navigation}
      hasPermission={hasPermission}
      endpoint="/nomina/periodos"
      valoresNuevo={{ periodicidad: "quincenal", dia_pago: "4", recurrente: true, fecha_inicio: hoy(), fecha_fin: calcularFin("quincenal", 4, hoy()) }}
      idCampo="id_periodo"
      etiqueta="periodo de nómina"
      icono="cash-outline"
      campos={(v) => camposNomina(v, empleados)}
      cargarExtra={() => api.get("/empleados/").then((l) => setEmpleados((l || [])
        .filter((e) => ["activo", "vacaciones", "incapacidad"].includes(e.estatus))
        .map((e) => ({ value: e.id_empleado, label: `${e.nombre} ${e.paterno || ""}`.trim() })))).catch(() => setEmpleados([]))}
      prepararGuardar={(v) => {
        if (parse(v.fecha_fin) < parse(v.fecha_inicio)) throw new Error("La fecha de fin debe ser igual o posterior a la de inicio.");
        return { ...v, dia_pago: Number(v.dia_pago ?? 4), recurrente: !!v.recurrente, empleados: (v.empleados || []).map(Number) };
      }}
      valoresParaEditar={(p) => ({ ...p, dia_pago: String(p.dia_pago ?? 4), empleados: (p.empleados_ids || "").split(",").filter(Boolean).map(Number) })}
      permisos={{ crear: "nomina.crear", editar: "nomina.editar", eliminar: "nomina.eliminar" }}
      alTocar={(item, nav) => nav.navigate("PeriodoNominaDetalle", { id: item.id_periodo })}
      titulo={(p) => `${p.fecha_inicio} — ${p.fecha_fin}`}
      subtitulo={(p) => `${p.periodicidad[0].toUpperCase()}${p.periodicidad.slice(1)}${p.dia_pago != null ? ` · paga ${["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][p.dia_pago]}` : ""}${p.recurrente ? " · se repite" : ""} · ${(p.recibos || []).length} recibo(s) · ${fmt((p.recibos || []).reduce((a, r) => a + (r.total_pagar || 0), 0))}`}
      badge={(p) => (p.status === "pagado" ? { texto: "pagado", tono: "teal" } : { texto: "abierto", tono: "warn" })}
      buscarEn={(p) => `${p.fecha_inicio} ${p.fecha_fin} ${p.periodicidad}`}
      textoVacio="Aún no hay periodos de nómina. Crea el primero con el botón +."
    />
    {puedeCrear && (
      <TouchableOpacity onPress={() => setLote(true)} activeOpacity={0.85}
        style={{ position: "absolute", right: 20, bottom: 100, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 100, backgroundColor: colors.paper100, borderWidth: 1.5, borderColor: colors.petrol500 }}>
        <Ionicons name="calendar-number-outline" size={20} color={colors.petrol500} />
        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.petrol500 }}>Generar varios</Text>
      </TouchableOpacity>
    )}
    <HojaFormulario
      visible={lote}
      titulo="Generar varios periodos"
      subtitulo="Crea de una vez todos los periodos del mes, trimestre, semestre o año"
      icono="calendar-number-outline"
      campos={(v) => camposLote(v, empleados)}
      valoresIniciales={{ rango: "mes", periodicidad: "semanal", dia_pago: "4", empleados: [] }}
      textoGuardar="Generar"
      onGuardar={generarLote}
      onCerrar={() => setLote(false)}
    />
    </View>
  );
}
