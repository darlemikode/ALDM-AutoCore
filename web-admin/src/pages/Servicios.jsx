import { IconoAuto } from "../components/Icono";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import FormModal from "../components/FormModal";
import MensajeModal from "../components/MensajeModal";
import ModalPortal from "../components/ModalPortal";
import FotoGaleria from "../components/FotoGaleria";
import ElegirClienteVehiculo from "../components/ElegirClienteVehiculo";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";
import { contiene } from "../lib/texto";

const STATUS_BADGE = {
  abierto: "badge-petrol",
  cerrado: "badge-teal",
  cancelado: "badge-red",
};

// Catálogo unificado de estatus — el mismo que ETAPAS_SERVICIO en el
// backend (ya integra lo que antes eran "status" + "etapa" + la marca de
// garantía en un solo campo `etapa`). Es la única fuente de verdad: los
// chips de filtro y las columnas del Kanban salen de aquí.
const OPCIONES_ESTATUS = [
  { clave: "", etiqueta: "Todas", emoji: "⚪", color: "var(--ink-500)" },
  { clave: "en_proceso", etiqueta: "Recibido", emoji: "🔵", color: "#2563EB" },
  { clave: "abierto", etiqueta: "En piso", emoji: "🟢", color: "#2563EB" },
  { clave: "pendiente", etiqueta: "Confirmación del cliente", emoji: "🟡", color: "#F59E0B" },
  { clave: "espera_refacciones", etiqueta: "Espera refacciones", emoji: "🟠", color: "#D97706" },
  { clave: "en_reparacion", etiqueta: "En reparación", emoji: "🔧", color: "#1D4ED8" },
  { clave: "listo_entrega", etiqueta: "Listo para entrega", emoji: "✅", color: "#16845B" },
  { clave: "cerrado", etiqueta: "Órdenes finalizadas", emoji: "⚫", color: "#0F6B49" },
  { clave: "garantia", etiqueta: "Garantía", emoji: "🟣", color: "#7C5CD6" },
  { clave: "cancelado", etiqueta: "Cancelado", emoji: "🔴", color: "#6B7280" },
];
const ETIQUETAS_ETAPA = Object.fromEntries(OPCIONES_ESTATUS.filter((op) => op.clave).map((op) => [op.clave, op.etiqueta]));
const COLOR_ETAPA = Object.fromEntries(OPCIONES_ESTATUS.filter((op) => op.clave).map((op) => [op.clave, op.color]));

// "Abierto" sigue siendo el status real de la orden (gobierna si se puede
// editar) — para el filtro, una orden "abierto" cuya etapa ya no esté en
// este catálogo (dato viejo) también cuenta como "Abierto" genérico.
function coincideConEstatus(s, clave) {
  // "abierto" ya no es el estatus genérico "lo que sea que siga abierto" —
  // ahora es una etapa concreta del flujo ("En piso"), así que se compara
  // igual que cualquier otra etapa (último return) y no se trata aparte.
  if (clave === "") return true;
  if (clave === "cerrado") return s.status === "cerrado";
  if (clave === "cancelado") return s.status === "cancelado";
  return s.status === "abierto" && s.etapa === clave;
}

// Columnas del Kanban — el mismo catálogo de arriba, sin "Todas" (no aporta
// como columna propia).
const KANBAN_COLUMNAS = OPCIONES_ESTATUS.filter((op) => op.clave !== "");
// Posición de cada estatus en el flujo (Recibido → … → Garantía/Cancelado),
// para que la vista "Lista" también salga ordenada por estatus y no solo el Kanban.
const INDICE_ESTATUS = Object.fromEntries(KANBAN_COLUMNAS.map((op, i) => [op.clave, i]));

// A qué columna cae cada orden: cancelado/cerrado por su status real;
// cualquier otra cae directo por su etapa (ya es la misma clave).
function columnaKanbanDe(s) {
  if (s.status === "cancelado") return "cancelado";
  if (s.status === "cerrado") return "cerrado";
  if (ETIQUETAS_ETAPA[s.etapa] && s.etapa !== "cerrado" && s.etapa !== "cancelado") return s.etapa;
  return "abierto"; // dato viejo (ej. "recibido"/"diagnostico") o sin etapa
}

export default function Servicios() {
  const { notify, confirmDialog } = useUI();
  const { hasPermission } = useAuth();
  const puedeVerPorCobrar = hasPermission("dashboard.ver_por_cobrar");
  const puedeVerPrecios = hasPermission("servicios.ver_precios");
  const puedeEditarKanban = hasPermission("servicios.editar");
  const [searchParams] = useSearchParams();
  const [servicios, setServicios] = useState([]);
  const [status, setStatus] = useState(() => searchParams.get("status") || "");
  const [q, setQ] = useState("");
  const [vista, setVista] = useState(() => localStorage.getItem("sm_servicios_vista") || "lista"); // "lista" | "kanban"
  const [arrastrando, setArrastrando] = useState(null); // id_servicio que se está arrastrando
  const [sobreColumna, setSobreColumna] = useState(null); // clave de columna con el cursor encima
  const [creating, setCreating] = useState(false);
  const [eligiendoNueva, setEligiendoNueva] = useState(false);
  const [clientePre, setClientePre] = useState(null); // cliente preelegido (viene del módulo Clientes)
  const yaCreoDirecta = useRef(false);
  const [garantiaOriginal, setGarantiaOriginal] = useState(null); // servicio original si venimos de "Reclamar garantía"
  const [prefillVehiculo, setPrefillVehiculo] = useState(null); // { id_cliente, id_vehiculo } si venimos de "crear orden" tras dar de alta un vehículo
  const [clientes, setClientes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [tiposServicio, setTiposServicio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verificacion2Pasos, setVerificacion2Pasos] = useState(() => localStorage.getItem("sm_verificacion_2_pasos") === "true");
  const [modalConfirmar, setModalConfirmar] = useState(null); // { valores, codigo } cuando está pidiendo el código
  const [fotosModal, setFotosModal] = useState(null); // { tipo: "vehiculo"|"servicio", id, titulo }
  const [codigoIngresado, setCodigoIngresado] = useState("");
  const [errorCodigo, setErrorCodigo] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  // Los chips de filtro ya no son solo "status" del backend (ahora mezclan
  // etapa y garantía), así que se trae todo y se filtra en el navegador.
  async function load() {
    const data = await api.get("/servicios/");
    setServicios(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useActualizacionGlobal("servicios", load);

  // Si llegamos aquí desde el botón "🛡️ Reclamar garantía" del detalle de
  // otra orden, abre la captura ya lista con ese cliente/vehículo.
  useEffect(() => {
    if (location.state?.garantiaOriginal && !yaCreoDirecta.current) {
      yaCreoDirecta.current = true;
      const g = location.state.garantiaOriginal;
      window.history.replaceState({}, ""); // evita que se reabra si recargas la página
      crearDirectaConVehiculo({
        id_cliente: g.id_cliente, id_vehiculo: g.id_vehiculo,
        nombre_servicio: `Garantía — ${g.nombre_servicio}`, es_garantia: true, id_servicio_original: g.id_servicio,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si llegamos aquí desde "Vehículo registrado — ¿crear una orden?", abre
  // la captura ya lista con ese cliente y vehículo.
  useEffect(() => {
    if (searchParams.get("abrir_nuevo") === "1" && searchParams.get("id_vehiculo") && !yaCreoDirecta.current && hasPermission("servicios.crear")) {
      yaCreoDirecta.current = true;
      crearDirectaConVehiculo({
        id_cliente: Number(searchParams.get("id_cliente")),
        id_vehiculo: Number(searchParams.get("id_vehiculo")),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchParams.get("nueva") === "1") {
      window.history.replaceState({}, "");
      if (searchParams.get("cliente")) setClientePre(Number(searchParams.get("cliente")));
      nuevaOrdenDirecta();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openCreate() {
    const [c, v, e, t] = await Promise.all([
      api.get("/clientes/?solo_activos=true"), api.get("/vehiculos/"),
      api.get("/empleados/").catch(() => []), // si no tiene permiso de empleados, simplemente no se ofrece el selector
      api.get("/tipos-servicio/"),
    ]);
    setClientes(c);
    setVehiculos(v);
    setEmpleados(e.filter((emp) => emp.activo));
    setTiposServicio(t);
    setCreating(true);
  }

  // "Nueva orden": se abre la orden vacía y ahí mismo se elige/agrega cliente y vehículo
  // Crea la orden ya con cliente y vehículo y manda directo a ella (sin pantalla intermedia)
  async function crearDirectaConVehiculo({ id_cliente, id_vehiculo, nombre_servicio = "Servicio general", es_garantia = false, id_servicio_original = null }) {
    try {
      const s = await api.post("/servicios/", {
        nombre_servicio, iva_porcentaje: 0, id_cliente, id_vehiculo, tipos_mantenimiento_ids: [],
        es_garantia, id_servicio_original, autorizado_cliente: false,
      });
      notify(`Orden creada — #${s.id_servicio}.`, "success");
      navigate(`/servicios/${s.id_servicio}`, { replace: true });
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function nuevaOrdenDirecta() {
    if (!hasPermission("servicios.crear")) return;
    if (verificacion2Pasos) { openCreate(); return; } // con verificación en 2 pasos se conserva el formulario con código
    // Primero se elige cliente y vehículo; la orden se crea hasta aceptar (sin borradores en blanco)
    setEligiendoNueva(true);
  }

  // Si ese cliente con ese vehículo ya tiene una orden abierta, se lleva a ella;
  // si no, se crea la orden nueva ya con sus datos.
  async function confirmarNuevaOrden({ id_cliente, id_vehiculo }) {
    try {
      if (id_vehiculo) {
        const abiertas = await api.get(`/servicios/?status=abierto&id_cliente=${id_cliente}`);
        const igual = (abiertas || []).find((o) => Number(o.id_cliente) === Number(id_cliente) && Number(o.id_vehiculo) === Number(id_vehiculo));
        if (igual) {
          setEligiendoNueva(false);
          notify(`Ese cliente y vehículo ya tienen la orden #${igual.id_servicio} abierta — te llevo a ella.`, "info");
          navigate(`/servicios/${igual.id_servicio}`);
          return;
        }
      }
      setEligiendoNueva(false);
      await crearDirectaConVehiculo({ id_cliente, id_vehiculo });
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function handleCreate(values) {
    if (verificacion2Pasos && !values._confirmadoYa) {
      const codigo = String(Math.floor(1000 + Math.random() * 9000));
      setCreating(false); // cierra el formulario de la orden; el modal de código aparece encima
      setModalConfirmar({ valores: values, codigo });
      setCodigoIngresado("");
      setErrorCodigo("");
      return;
    }
    await crearServicio(values, verificacion2Pasos);
  }

  async function crearServicio(values, autorizado) {
    const { anticipo_tipo_pago, anticipo_monto, anticipo_efectivo, anticipo_tarjeta, _confirmadoYa, fotos_temp, ...datosOrden } = values;
    const servicio = await api.post("/servicios/", {
      ...datosOrden,
      iva_porcentaje: 0, // sin IVA automático: se aplica desde la orden si el cliente lo pide
      id_cliente: Number(values.id_cliente),
      id_vehiculo: Number(values.id_vehiculo),
      id_empleado_responsable: values.id_empleado_responsable ? Number(values.id_empleado_responsable) : null,
      tipos_mantenimiento_ids: values.tipos_mantenimiento_ids || [],
      es_garantia: !!garantiaOriginal,
      id_servicio_original: garantiaOriginal?.id_servicio || null,
      autorizado_cliente: !!autorizado,
    });

    // Fotos (opcional) — se suben ya con la orden creada, porque el
    // endpoint de fotos necesita un id_servicio real al que ligarlas.
    if (fotos_temp && fotos_temp.length > 0) {
      for (const archivo of fotos_temp) {
        try {
          const formData = new FormData();
          formData.append("archivo", archivo);
          formData.append("entidad_tipo", "servicio");
          formData.append("entidad_id", servicio.id_servicio);
          await api.postForm("/fotos/", formData);
        } catch (err) {
          notify(`Una foto no se pudo subir: ${err.message}`, "error");
        }
      }
    }

    // Anticipo (opcional) — se registra como el primer pago, ya con la
    // orden creada (igual que en la app móvil).
    const montoAnticipo = anticipo_tipo_pago === "mixto"
      ? (Number(anticipo_efectivo) || 0) + (Number(anticipo_tarjeta) || 0)
      : Number(anticipo_monto) || 0;
    if (montoAnticipo > 0) {
      try {
        await api.post(`/servicios/${servicio.id_servicio}/abonos`, {
          monto_abono: montoAnticipo,
          tipo_pago: anticipo_tipo_pago || "efectivo",
          desglose_mixto_efectivo: anticipo_tipo_pago === "mixto" ? Number(anticipo_efectivo) || 0 : null,
          desglose_mixto_tarjeta: anticipo_tipo_pago === "mixto" ? Number(anticipo_tarjeta) || 0 : null,
          comentario: "Anticipo al crear la orden",
        });
      } catch (err) {
        // La orden ya se creó — un anticipo fallido no debe tirar todo el flujo.
        notify(`La orden se creó, pero el anticipo no se pudo registrar: ${err.message}`, "error");
      }
    }

    setCreating(false);
    setGarantiaOriginal(null);
    notify(`Orden creada — #${servicio.id_servicio}.`, "success");
    navigate(`/servicios/${servicio.id_servicio}`);
  }

  async function confirmarYCrear() {
    if (codigoIngresado !== modalConfirmar.codigo) {
      setErrorCodigo("El código no coincide. Verifica con el cliente e intenta de nuevo.");
      return;
    }
    await crearServicio(modalConfirmar.valores, true);
    setModalConfirmar(null);
  }

  // Los campos son una función de `values`: así el selector de vehículo se
  // recalcula en cada render según el cliente que se haya elegido.
  function camposOrden(values) {
    const vehiculosDelCliente = values.id_cliente
      ? vehiculos.filter((v) => v.id_cliente === Number(values.id_cliente))
      : vehiculos;
    const nombresTiposElegidos = tiposServicio
      .filter((t) => (values.tipos_mantenimiento_ids || []).includes(t.id_tipo_servicio))
      .map((t) => t.nombre_tipo.toLowerCase());
    const campos = [
      {
        name: "id_cliente",
        label: "Cliente",
        type: "select",
        required: true,
        disabled: !!garantiaOriginal,
        grupo: "vehiculo",
        options: clientes.map((c) => ({ value: c.id_cliente, label: `${c.nombre_cliente} ${c.paterno_cliente || ""} (${c.numero_cuenta})` })),
      },
      {
        name: "id_vehiculo",
        label: values.id_cliente ? "Vehículo de este cliente" : "Vehículo (elige un cliente primero)",
        type: "select",
        required: true,
        disabled: !!garantiaOriginal,
        grupo: "vehiculo",
        options: vehiculosDelCliente.map((v) => ({
          value: v.id_vehiculo,
          label: `${v.marca?.nombre_marca || ""} ${v.modelo?.nombre_modelo || ""} — ${v.placas_vehiculo || "sin placas"} (${v.numero_cuenta})`.trim(),
        })),
        // Al elegir el vehículo, se precarga el último kilometraje que ya
        // se tenía capturado para él — no hay por qué volver a preguntarlo
        // si ya se sabía.
        onElegir: (idVehiculo) => {
          const v = vehiculos.find((x) => x.id_vehiculo === Number(idVehiculo));
          return v?.km_vehiculo ? { km_llegada: v.km_vehiculo } : null;
        },
      },
      { name: "km_llegada", label: "Kilometraje de llegada", type: "number", grupo: "vehiculo" },
      {
        name: "km_proximo_servicio",
        label: "Próximo servicio (km) — se sugiere solo, puedes cambiarlo",
        type: "number",
        grupo: "vehiculo",
      },
    ];
    if (empleados.length > 0) {
      campos.push({
        name: "id_empleado_responsable",
        label: "Responsable (opcional)",
        type: "select",
        grupo: "vehiculo",
        options: [{ value: "", label: "Sin asignar" }].concat(empleados.map((e) => ({ value: e.id_empleado, label: `${e.nombre} ${e.paterno || ""}` }))),
      });
    }
    if (garantiaOriginal) {
      campos.push({ name: "motivo_garantia", label: "¿Qué volvió a fallar?", type: "textarea", full: true, required: true, grupo: "trabajo" });
    }
    campos.push({
      name: "tipos_mantenimiento_ids", label: "Tipo(s) de mantenimiento", type: "multiselect", full: true, grupo: "trabajo",
      options: tiposServicio.map((t) => ({ value: t.id_tipo_servicio, label: t.nombre_tipo })),
      // Al elegir el tipo de mantenimiento, sugiere el próximo servicio
      // sumando al kilometraje de llegada: +10,000 si es afinación,
      // +5,000 si es cambio de aceite (configurable más adelante si hace
      // falta otro criterio). Solo sugiere — no pisa un valor que la
      // persona ya haya escrito a mano.
      onElegir: (idsElegidos, actuales) => {
        if (actuales.km_proximo_servicio) return null;
        const km = Number(actuales.km_llegada);
        if (!km) return null;
        const nombres = tiposServicio.filter((t) => idsElegidos.includes(t.id_tipo_servicio)).map((t) => t.nombre_tipo.toLowerCase());
        let incremento = 0;
        if (nombres.some((n) => n.includes("afinación") || n.includes("afinacion"))) incremento = 10000;
        else if (nombres.some((n) => n.includes("aceite"))) incremento = 5000;
        return incremento ? { km_proximo_servicio: String(km + incremento) } : null;
      },
    });

    campos.push({ name: "nombre_servicio", label: "Descripción de la orden", required: true, full: true, grupo: "trabajo" });
    // Fotos y anticipo se guardan aparte y piden poder editar la orden
    if (!hasPermission("servicios.editar")) return campos;
    campos.push({ name: "fotos_temp", label: "Fotos de la orden (opcional)", type: "file-multiple", full: true, grupo: "trabajo" });

    // Anticipo (opcional) — el monto cambia de forma según el tipo de pago,
    // igual que en la app móvil: un solo campo, o el desglose Efectivo/Tarjeta si es Mixto.
    campos.push({
      name: "anticipo_tipo_pago", label: "Anticipo — tipo de pago (opcional)", type: "select", grupo: "anticipo",
      options: [{ value: "efectivo", label: "Efectivo" }, { value: "tarjeta", label: "Pago con tarjeta" }, { value: "mixto", label: "Mixto" }],
    });
    if (values.anticipo_tipo_pago === "mixto") {
      campos.push({ name: "anticipo_efectivo", label: "Anticipo — Efectivo", type: "number", grupo: "anticipo" });
      campos.push({ name: "anticipo_tarjeta", label: "Anticipo — Tarjeta", type: "number", grupo: "anticipo" });
    } else {
      campos.push({ name: "anticipo_monto", label: "Anticipo — Monto", type: "number", grupo: "anticipo" });
    }
    return campos;
  }

  const gruposOrden = {
    vehiculo: { icono: "🚗", titulo: "Cliente y vehículo" },
    trabajo: { icono: "🔧", titulo: "Trabajo a realizar", acento: "acento-teal" },
    anticipo: { icono: "💲", titulo: "Anticipo (opcional)", acento: "acento-ambar" },
  };

  const fmt = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

  function cambiarVista(v) { setVista(v); localStorage.setItem("sm_servicios_vista", v); }

  // Búsqueda libre: por #orden, descripción, cliente, placas o vehículo.
  function coincideBusqueda(s) {
    if (!q.trim()) return true;
    const cli = s.cliente ? `${s.cliente.nombre_cliente} ${s.cliente.paterno_cliente || ""}` : "";
    return (
      contiene(String(s.id_servicio), q) ||
      contiene(s.nombre_servicio, q) ||
      contiene(cli, q) ||
      contiene(s.vehiculo?.placas_vehiculo, q) ||
      contiene(s.vehiculo?.marca?.nombre_marca, q) ||
      contiene(s.vehiculo?.modelo?.nombre_modelo, q)
    );
  }
  // Lista: el chip de estatus sí filtra qué filas se ven, y dentro de eso
  // se ordenan por estatus (siguiendo el flujo del taller) y, dentro del
  // mismo estatus, las más recientes primero.
  const filtrados = servicios
    .filter((s) => coincideConEstatus(s, status) && coincideBusqueda(s))
    .sort((a, b) => {
      const ia = INDICE_ESTATUS[columnaKanbanDe(a)] ?? 999;
      const ib = INDICE_ESTATUS[columnaKanbanDe(b)] ?? 999;
      if (ia !== ib) return ia - ib;
      return b.id_servicio - a.id_servicio;
    });
  // Kanban: el chip NO oculta las demás columnas — nada más resalta la
  // seleccionada y achica las otras (se ven todas, igual que el tablero real).
  const filtradosKanban = servicios.filter((s) => coincideBusqueda(s));
  const columnaResaltada = vista === "kanban" ? status : "";

  const porColumna = {};
  filtradosKanban.forEach((s) => {
    const k = columnaKanbanDe(s);
    (porColumna[k] = porColumna[k] || []).push(s);
  });

  async function moverServicio(s, columnaClave) {
    try {
      if (columnaClave === "cancelado") {
        const ok = await confirmDialog("¿Cancelar esta orden de servicio? Si fue un error, podrás reabrirla más adelante.", { danger: true, confirmar: "Sí, cancelar" });
        if (!ok) return;
        const actualizado = await api.put(`/servicios/${s.id_servicio}`, { status: "cancelado" });
        setServicios((prev) => prev.map((x) => (x.id_servicio === s.id_servicio ? actualizado : x)));
        notify("Se actualizó el estado de la orden.", "success");
        return;
      }
      if (columnaClave === "cerrado") {
        const ok = await confirmDialog(
          "Esto solo marca la orden como cerrada, sin cobrar ni avisar al cliente. Para eso usa «Finalizar y generar nota» dentro de la orden. ¿Cerrarla de todos modos?",
          { title: "Cerrar orden", confirmar: "Sí, cerrar" }
        );
        if (!ok) return;
        const actualizado = await api.put(`/servicios/${s.id_servicio}`, { status: "cerrado" });
        setServicios((prev) => prev.map((x) => (x.id_servicio === s.id_servicio ? actualizado : x)));
        notify("Se actualizó el estado de la orden.", "success");
        return;
      }
      // en_proceso / pendiente / espera_refacciones / garantía / listo_entrega:
      // la clave de la columna ya ES la etapa a guardar.
      if (s.status !== "abierto") { notify("Solo se puede cambiar la etapa de órdenes abiertas — reábrela primero.", "error"); return; }
      const actualizado = await api.put(`/servicios/${s.id_servicio}/etapa`, { etapa: columnaClave, comentario: null });
      setServicios((prev) => prev.map((x) => (x.id_servicio === s.id_servicio ? actualizado : x)));
      notify(`Orden #${s.id_servicio}: estatus "${ETIQUETAS_ETAPA[columnaClave]}". Se avisó al cliente.`, "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  function alSoltar(e, columnaClave) {
    e.preventDefault();
    setSobreColumna(null);
    if (!puedeEditarKanban) return;
    const idServicio = Number(e.dataTransfer.getData("text/plain"));
    const s = servicios.find((x) => x.id_servicio === idServicio);
    if (!s || columnaKanbanDe(s) === columnaClave) return;
    moverServicio(s, columnaClave);
  }

  return (
    <>
      {eligiendoNueva && (
        <ElegirClienteVehiculo idCliente={clientePre} onConfirmar={confirmarNuevaOrden} onCerrar={() => { setEligiendoNueva(false); setClientePre(null); }} />
      )}
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/servicios" /> Órdenes de servicio</h1>
          <div className="subtitle">{filtrados.length}{filtrados.length !== servicios.length ? ` de ${servicios.length}` : ""} orden(es)</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="vista-toggle vista-toggle-iconos">
            <button type="button" className={`vista-toggle-btn ${vista === "lista" ? "activo" : ""}`} title="Vista de lista" aria-label="Vista de lista" onClick={() => cambiarVista("lista")}>
              <Icono nombre="list" size={19} />
            </button>
            <button type="button" className={`vista-toggle-btn ${vista === "kanban" ? "activo" : ""}`} title="Vista de tablero Kanban" aria-label="Vista de tablero Kanban" onClick={() => cambiarVista("kanban")}>
              <Icono nombre="grid" size={19} />
            </button>
          </div>
          {hasPermission("servicios.crear") && (
          <button className="btn btn-primary btn-nuevo" onClick={nuevaOrdenDirecta}>
            <span className="btn-nuevo-icono"><Icono nombre="doc-add" size={22} /><span className="btn-nuevo-mas">+</span></span>Nueva orden</button>
          )}
        </div>
      </div>

      <div className={`panel ${vista === "kanban" ? "panel-kanban" : ""}`}>
        <div className="toolbar">
          <input className="search-input" placeholder="Buscar por orden, cliente, vehículo o placas…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="cat-chips">
          {OPCIONES_ESTATUS.map((op) => (
            <button type="button" key={op.clave} className={`cat-chip ${status === op.clave ? "cat-chip-on" : ""}`} style={{ "--c": op.color }} onClick={() => setStatus(op.clave)}>
              <span className="cat-chip-emoji">{op.emoji}</span>{op.etiqueta}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : (vista === "kanban" ? filtradosKanban : filtrados).length === 0 ? (
          <div className="empty-state">{q.trim() ? "Ninguna orden coincide con la búsqueda." : "No hay órdenes de servicio con este filtro."}</div>
        ) : vista === "kanban" ? (
          <div className="kanban-tablero">
            {KANBAN_COLUMNAS.map((col) => {
              const vacia = (porColumna[col.clave] || []).length === 0;
              const resaltada = columnaResaltada === col.clave;
              const atenuada = columnaResaltada && !resaltada;
              return (
              <div
                key={col.clave}
                className={`kanban-columna${sobreColumna === col.clave ? " sobre" : ""}${vacia ? " vacia" : ""}${resaltada ? " resaltada" : ""}${atenuada ? " atenuada" : ""}`}
                style={{ "--c": col.color || "var(--violet-600)" }}
                onDragOver={(e) => { if (puedeEditarKanban) e.preventDefault(); }}
                onDragEnter={() => puedeEditarKanban && setSobreColumna(col.clave)}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setSobreColumna(null); }}
                onDrop={(e) => alSoltar(e, col.clave)}
              >
                <div className="kanban-columna-header" style={{ "--c": col.color || "var(--violet-600)" }}>
                  {col.emoji && <span className="kanban-columna-icono">{col.emoji}</span>}
                  <span className="kanban-columna-titulo">{col.etiqueta}</span>
                  <span className="kanban-columna-conteo">{(porColumna[col.clave] || []).length}</span>
                </div>
                <div className="kanban-columna-body">
                  {(porColumna[col.clave] || []).length === 0 ? (
                    <div className="kanban-vacio">Sin órdenes</div>
                  ) : (
                    (porColumna[col.clave] || []).map((s) => {
                      const cli = s.cliente ? `${s.cliente.nombre_cliente} ${s.cliente.paterno_cliente || ""}`.trim() : null;
                      return (
                        <div
                          key={s.id_servicio}
                          className={`kanban-tarjeta${arrastrando === s.id_servicio ? " arrastrando" : ""}`}
                          draggable={puedeEditarKanban}
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(s.id_servicio)); e.dataTransfer.effectAllowed = "move"; setArrastrando(s.id_servicio); }}
                          onDragEnd={() => setArrastrando(null)}
                          onClick={() => navigate(`/servicios/${s.id_servicio}`)}
                        >
                          <div className="kanban-tarjeta-top">
                            <span className="kanban-tarjeta-num">#{s.id_servicio}</span>
                            {s.es_garantia && <IconoAuto valor="🛡️" size={14} />}
                          </div>
                          <div className="kanban-tarjeta-titulo">{s.nombre_servicio}</div>
                          <div className="kanban-tarjeta-cliente"><Icono nombre="user" size={14} /> {cli || "Sin cliente"}</div>
                          {(() => {
                            const marcaModelo = [s.vehiculo?.marca?.nombre_marca, s.vehiculo?.modelo?.nombre_modelo].filter(Boolean).join(" ");
                            return s.vehiculo ? (
                              <div className="kanban-tarjeta-vehiculo">
                                <Icono nombre="car" size={14} />
                                <span className="kanban-tarjeta-vehiculo-nombre">{marcaModelo || "Vehículo"}</span>
                                {s.vehiculo?.placas_vehiculo && <span className="kanban-tarjeta-placa">{s.vehiculo.placas_vehiculo}</span>}
                              </div>
                            ) : (
                              <div className="kanban-tarjeta-vehiculo kanban-tarjeta-vehiculo-vacio"><Icono nombre="car" size={14} /> Sin vehículo</div>
                            );
                          })()}
                          {(puedeVerPrecios || puedeVerPorCobrar) && (
                            <div className="kanban-tarjeta-dinero">
                              {puedeVerPrecios && <span className="mono">{fmt(s.costos.total)}</span>}
                              {puedeVerPorCobrar && !s.pagado && s.costos.saldo_pendiente > 0 && <span className="kanban-tarjeta-saldo">Saldo {fmt(s.costos.saldo_pendiente)}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <div className="ordenes-lista">
            {filtrados.map((s) => {
              const cli = s.cliente ? `${s.cliente.nombre_cliente} ${s.cliente.paterno_cliente || ""}`.trim() : null;
              const claveFila = columnaKanbanDe(s);
              return (
                <div key={s.id_servicio} className={`orden-fila est-${s.status}`} style={{ "--acc": COLOR_ETAPA[claveFila] || "#2563EB" }} onClick={() => navigate(`/servicios/${s.id_servicio}`)}>
                  <div className="orden-num">#{s.id_servicio}</div>
                  <div className="orden-main">
                    <div className="orden-titulo">{s.es_garantia && <><IconoAuto valor="🛡️" size={16} />{" "}</>}{s.nombre_servicio}</div>
                    <div className="orden-meta">
                      <span><Icono nombre="user" size={15} /> {cli || "Sin cliente"}</span>
                      <span><Icono nombre="car" size={15} /> {s.vehiculo?.placas_vehiculo || "Sin vehículo"}</span>
                      <span><Icono nombre="calendar" size={15} /> {new Date(s.fecha_entrada_servicio).toLocaleDateString("es-MX")}</span>
                    </div>
                  </div>
                  <div className="orden-estado">
                    {(() => {
                      const clave = columnaKanbanDe(s);
                      return (
                        <span className="badge-etapa" style={{ "--c": COLOR_ETAPA[clave] || "var(--ink-500)" }}>
                          {ETIQUETAS_ETAPA[clave] || clave}
                        </span>
                      );
                    })()}
                  </div>
                  {(puedeVerPrecios || puedeVerPorCobrar) && (
                    <div className="orden-dinero">
                      {puedeVerPrecios && <div className="orden-total mono">{fmt(s.costos.total)}</div>}
                      {puedeVerPorCobrar && (s.pagado
                        ? <span className="badge badge-teal">Pagado</span>
                        : <div className="orden-saldo">Saldo {fmt(s.costos.saldo_pendiente)}</div>)}
                    </div>
                  )}
                  <div className="orden-flecha">›</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <FormModal
          title={garantiaOriginal ? `Reclamación de garantía — orden #${garantiaOriginal.id_servicio}` : "Nueva orden de servicio"}
          icono="🔧"
          subtitulo={garantiaOriginal ? "Reclamación de garantía sobre una orden anterior." : "Cliente, vehículo, trabajo a realizar y anticipo."}
          grupos={gruposOrden}
          fields={camposOrden}
          initialValues={
            garantiaOriginal
              ? {
                  id_cliente: garantiaOriginal.id_cliente,
                  id_vehiculo: garantiaOriginal.id_vehiculo,
                  nombre_servicio: `Garantía — ${garantiaOriginal.nombre_servicio}`,
                  anticipo_tipo_pago: "efectivo",
                }
              : prefillVehiculo
              ? { anticipo_tipo_pago: "efectivo", id_cliente: prefillVehiculo.id_cliente, id_vehiculo: prefillVehiculo.id_vehiculo }
              : { anticipo_tipo_pago: "efectivo" }
          }
          onSubmit={handleCreate}
          onClose={() => { setCreating(false); setGarantiaOriginal(null); setPrefillVehiculo(null); }}
        />
      )}

      {modalConfirmar && (
        <MensajeModal
          icono="🔒"
          titulo="Verificación en 2 pasos"
          ancho={380}
          onCerrar={() => setModalConfirmar(null)}
          primario={{ texto: "Confirmar y crear orden", onClick: confirmarYCrear }}
          secundario={{ texto: "Cancelar", onClick: () => setModalConfirmar(null) }}
        >
          <p>Dile este código al cliente y pídele que lo confirme: <b style={{ fontSize: 18, letterSpacing: 2 }}>{modalConfirmar.codigo}</b></p>
          <div className="field" style={{ textAlign: "left" }}>
            <label>Código que confirmó el cliente</label>
            <input value={codigoIngresado} onChange={(e) => setCodigoIngresado(e.target.value)} placeholder="0000" autoFocus />
          </div>
          {errorCodigo && <div className="error-text">{errorCodigo}</div>}
        </MensajeModal>
      )}
    </>
  );
}
