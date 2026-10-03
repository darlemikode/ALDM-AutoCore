import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import FormModal from "../components/FormModal";
import ModalPortal from "../components/ModalPortal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import IconoModulo from "../components/IconoModulo";

const STATUS_BADGE = {
  abierto: "badge-petrol",
  cerrado: "badge-teal",
  cancelado: "badge-red",
};

const ETIQUETAS_ETAPA = {
  recibido: "Recibido",
  diagnostico: "En diagnóstico",
  esperando_autorizacion: "Esperando autorización del cliente",
  en_reparacion: "En reparación",
  esperando_refacciones: "Esperando refacciones",
  control_calidad: "Control de calidad",
  listo_entrega: "Listo para entrega",
};

export default function Servicios() {
  const { notify } = useUI();
  const { hasPermission } = useAuth();
  const puedeVerPorCobrar = hasPermission("dashboard.ver_por_cobrar");
  const puedeVerPrecios = hasPermission("servicios.ver_precios");
  const [searchParams] = useSearchParams();
  const [servicios, setServicios] = useState([]);
  const [status, setStatus] = useState(() => searchParams.get("status") || "");
  const [creating, setCreating] = useState(false);
  const [garantiaOriginal, setGarantiaOriginal] = useState(null); // servicio original si venimos de "Reclamar garantía"
  const [prefillVehiculo, setPrefillVehiculo] = useState(null); // { id_cliente, id_vehiculo } si venimos de "crear orden" tras dar de alta un vehículo
  const [clientes, setClientes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [tiposServicio, setTiposServicio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verificacion2Pasos, setVerificacion2Pasos] = useState(() => localStorage.getItem("sm_verificacion_2_pasos") === "true");
  const [modalConfirmar, setModalConfirmar] = useState(null); // { valores, codigo } cuando está pidiendo el código
  const [codigoIngresado, setCodigoIngresado] = useState("");
  const [errorCodigo, setErrorCodigo] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  async function load() {
    setLoading(true);
    const data = await api.get(`/servicios/${status ? `?status=${status}` : ""}`);
    setServicios(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useActualizacionGlobal("servicios", load);

  // Si llegamos aquí desde el botón "🛡️ Reclamar garantía" del detalle de
  // otra orden, abre la captura ya lista con ese cliente/vehículo.
  useEffect(() => {
    if (location.state?.garantiaOriginal) {
      setGarantiaOriginal(location.state.garantiaOriginal);
      openCreate();
      window.history.replaceState({}, ""); // evita que se reabra si recargas la página
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si llegamos aquí desde "Vehículo registrado — ¿crear una orden?", abre
  // la captura ya lista con ese cliente y vehículo.
  useEffect(() => {
    if (searchParams.get("abrir_nuevo") === "1" && searchParams.get("id_vehiculo")) {
      setPrefillVehiculo({
        id_cliente: Number(searchParams.get("id_cliente")),
        id_vehiculo: Number(searchParams.get("id_vehiculo")),
      });
      openCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchParams.get("nueva") === "1") {
      window.history.replaceState({}, "");
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
  async function nuevaOrdenDirecta() {
    if (verificacion2Pasos) { openCreate(); return; } // con verificación en 2 pasos se conserva el formulario con código
    try {
      const s = await api.post("/servicios/", { nombre_servicio: "Servicio general", iva_porcentaje: 0, tipos_mantenimiento_ids: [], autorizado_cliente: false });
      navigate(`/servicios/${s.id_servicio}`);
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

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/servicios" /> Órdenes de servicio</h1>
          <div className="subtitle">{servicios.length} orden(es)</div>
        </div>
        <button className="btn btn-primary" onClick={nuevaOrdenDirecta}>
          🔧 Nueva orden
        </button>
      </div>

      <div className="panel">
        <div className="toolbar">
          {["", "abierto", "cerrado", "cancelado"].map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${status === s ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setStatus(s)}
            >
              {s === "" ? "Todas" : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : servicios.length === 0 ? (
          <div className="empty-state">No hay órdenes de servicio con este filtro.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Orden</th>
                <th>Cliente</th>
                <th>Vehículo</th>
                <th>Entrada</th>
                <th>Estado</th>
                {puedeVerPrecios && <th>Total</th>}
                {puedeVerPorCobrar && <th>Saldo</th>}
              </tr>
            </thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id_servicio} style={{ cursor: "pointer" }} onClick={() => navigate(`/servicios/${s.id_servicio}`)}>
                  <td>
                    <Link to={`/servicios/${s.id_servicio}`}>{s.es_garantia && "🛡️ "}#{s.id_servicio} · {s.nombre_servicio}</Link>
                  </td>
                  <td>{s.cliente ? `${s.cliente.nombre_cliente} ${s.cliente.paterno_cliente || ""}` : "—"}</td>
                  <td>{s.vehiculo?.placas_vehiculo || "—"}</td>
                  <td>{new Date(s.fecha_entrada_servicio).toLocaleDateString("es-MX")}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[s.status] || "badge-grey"}`}>{s.status}</span>
                    {s.status === "abierto" && s.etapa && (
                      <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 3 }}>{ETIQUETAS_ETAPA[s.etapa] || s.etapa}</div>
                    )}
                  </td>
                  {puedeVerPrecios && <td className="mono">{fmt(s.costos.total)}</td>}
                  {puedeVerPorCobrar && (
                    <td className="mono">
                      {s.pagado ? <span className="badge badge-teal">Pagado</span> : fmt(s.costos.saldo_pendiente)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
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
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setModalConfirmar(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <h2 style={{ fontSize: 18 }}>Verificación en 2 pasos</h2>
            <p style={{ fontSize: 13.5, color: "var(--ink-500)", marginBottom: 10 }}>
              Dile este código al cliente y pídele que lo confirme: <b style={{ fontSize: 18, letterSpacing: 2 }}>{modalConfirmar.codigo}</b>
            </p>
            <div className="field">
              <label>Código que confirmó el cliente</label>
              <input value={codigoIngresado} onChange={(e) => setCodigoIngresado(e.target.value)} placeholder="0000" autoFocus />
            </div>
            {errorCodigo && <div className="error-text">{errorCodigo}</div>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModalConfirmar(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarYCrear}>Confirmar y crear orden</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
