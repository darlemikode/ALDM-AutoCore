import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import BuscadorSelect from "../components/BuscadorSelect";
import ClienteFormModal from "../components/ClienteFormModal";
import FormModal from "../components/FormModal";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

// Nueva orden: se entra directo a la pantalla de la orden. En el lugar del
// cliente y del vehículo se elige uno existente (con buscador) o se agrega
// uno nuevo; al tener los dos, la orden se abre sola.
export default function NuevaOrden() {
  const { notify } = useUI();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [idCliente, setIdCliente] = useState("");
  const [idVehiculo, setIdVehiculo] = useState("");
  const [paso, setPaso] = useState("cliente"); // cliente | vehiculo
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [nuevoVehiculo, setNuevoVehiculo] = useState(false);
  const [creando, setCreando] = useState(false);
  const yaCreada = useRef(false);

  async function cargar() {
    const [c, v, m, mo] = await Promise.all([
      api.get("/clientes/?solo_activos=true"), api.get("/vehiculos/"),
      api.get("/vehiculos-marcas/"), api.get("/vehiculos-modelos/"),
    ]);
    setClientes(c); setVehiculos(v); setMarcas(m); setModelos(mo);
  }
  useEffect(() => { cargar(); }, []);

  const cliente = clientes.find((c) => c.id_cliente === Number(idCliente));
  const vehiculo = vehiculos.find((v) => v.id_vehiculo === Number(idVehiculo));
  const nombreVeh = (v) => `${v.marca?.nombre_marca || ""} ${v.modelo?.nombre_modelo || ""}`.trim() || v.numero_cuenta;

  const opcionesCliente = useMemo(() => clientes.map((c) => ({
    value: c.id_cliente, label: `${c.nombre_cliente} ${c.paterno_cliente || ""}`.trim(),
    sub: [c.numero_cuenta, c.telefono1].filter(Boolean).join(" · "),
  })), [clientes]);

  const opcionesVehiculo = useMemo(() => vehiculos
    .filter((v) => !idCliente || v.id_cliente === Number(idCliente))
    .map((v) => ({ value: v.id_vehiculo, label: nombreVeh(v), sub: [v.placas_vehiculo, !idCliente && v.cliente?.nombre_cliente].filter(Boolean).join(" · ") })),
  [vehiculos, idCliente]);

  function elegirCliente(id) {
    setIdCliente(id);
    setIdVehiculo("");
    if (id) setPaso("vehiculo");
  }
  function elegirVehiculo(id) {
    setIdVehiculo(id);
    const v = vehiculos.find((x) => x.id_vehiculo === Number(id));
    if (v && !idCliente) setIdCliente(v.id_cliente);
  }

  // Con cliente y vehículo elegidos, la orden se abre sola
  useEffect(() => {
    if (!idCliente || !idVehiculo || yaCreada.current) return;
    yaCreada.current = true;
    (async () => {
      setCreando(true);
      try {
        const v = vehiculos.find((x) => x.id_vehiculo === Number(idVehiculo));
        const s = await api.post("/servicios/", {
          id_cliente: Number(idCliente), id_vehiculo: Number(idVehiculo),
          nombre_servicio: "Servicio general", km_llegada: v?.km_vehiculo ? String(v.km_vehiculo) : null,
          iva_porcentaje: 0, tipos_mantenimiento_ids: [], autorizado_cliente: false,
        });
        notify(`Orden creada — #${s.id_servicio}.`, "success");
        navigate(`/servicios/${s.id_servicio}?agregar=1`, { replace: true });
      } catch (err) {
        notify(err.message, "error");
        yaCreada.current = false;
        setCreando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCliente, idVehiculo]);

  async function guardarCliente(values) {
    const creado = await api.post("/clientes/", values);
    notify(`Cliente creado con cuenta ${creado.numero_cuenta}.`, "success");
    setNuevoCliente(false);
    await cargar();
    elegirCliente(creado.id_cliente);
    setNuevoVehiculo(true); // un cliente nuevo no tiene vehículos: se captura el suyo
  }

  function camposVehiculo(values) {
    return [
      { name: "id_marca_vehiculo", label: "Marca", type: "select", required: true,
        options: marcas.map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca })),
        creatable: { endpoint: "/vehiculos-marcas/", createField: "nombre_marca", idField: "id_marca_vehiculo", label: "marca", onCreated: (n) => setMarcas((p) => [...p, n]) } },
      { name: "id_modelo_vehiculo", label: "Modelo", type: "select", required: true,
        options: modelos.filter((m) => !values.id_marca_vehiculo || m.id_marca_vehiculo === values.id_marca_vehiculo).map((m) => ({ value: m.id_modelo_vehiculo, label: m.nombre_modelo })),
        creatable: values.id_marca_vehiculo ? { endpoint: "/vehiculos-modelos/", createField: "nombre_modelo", idField: "id_modelo_vehiculo", label: "modelo",
          extraFields: (v) => ({ id_marca_vehiculo: v.id_marca_vehiculo }), onCreated: (n) => setModelos((p) => [...p, n]) } : null },
      { name: "placas_vehiculo", label: "Placas" },
      { name: "km_vehiculo", label: "Kilometraje", required: true, type: "number" },
    ];
  }

  async function guardarVehiculo(values) {
    const creado = await api.post("/vehiculos/", { ...values, id_cliente: Number(idCliente) });
    notify("Vehículo registrado.", "success");
    setNuevoVehiculo(false);
    await cargar();
    setIdVehiculo(creado.id_vehiculo);
  }

  const tarjeta = (activa) => ({ cursor: "pointer", outline: activa ? "2px solid var(--petrol-500)" : "none" });

  return (
    <div className="orden-main">
      <div className="orden-hero">
        <div className="orden-hero-top">
          <h1 className="orden-hero-titulo"><IconoModulo ruta="/servicios" /> Orden nueva <span className="badge badge-petrol">sin abrir</span></h1>
        </div>

        <div className="orden-hero-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, padding: 20 }}>
          <div className="nota-bloque" style={tarjeta(paso === "cliente")} onClick={() => setPaso("cliente")}>
            <div className="nota-bloque-header"><span className="icono"><Icono nombre="people" size={18} /></span><h2>Cliente</h2></div>
            <div className="nota-bloque-body">
              {paso === "cliente" || !cliente ? (
                <>
                  <BuscadorSelect label="Buscar cliente" opciones={opcionesCliente} value={idCliente} onChange={elegirCliente} placeholder="Nombre, cuenta o teléfono…" />
                  {hasPermission("clientes.crear") && (
                    <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={(e) => { e.stopPropagation(); setNuevoCliente(true); }}>＋ Agregar cliente</button>
                  )}
                </>
              ) : (
                <div><b>{cliente.nombre_cliente} {cliente.paterno_cliente || ""}</b><div className="subtitle">{cliente.numero_cuenta}{cliente.telefono1 ? ` · ${cliente.telefono1}` : ""}</div><small>Toca para cambiar</small></div>
              )}
            </div>
          </div>

          <div className="nota-bloque" style={{ ...tarjeta(paso === "vehiculo"), opacity: cliente ? 1 : 0.55 }} onClick={() => cliente && setPaso("vehiculo")}>
            <div className="nota-bloque-header"><span className="icono"><Icono nombre="car" size={18} /></span><h2>Vehículo</h2></div>
            <div className="nota-bloque-body">
              {!cliente ? <div className="subtitle">Primero elige el cliente.</div> : (
                <>
                  <BuscadorSelect label="Buscar vehículo" opciones={opcionesVehiculo} value={idVehiculo} onChange={elegirVehiculo}
                    placeholder="Marca, modelo o placas…" vacio="Este cliente no tiene vehículos" />
                  {hasPermission("vehiculos.crear") && (
                    <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={(e) => { e.stopPropagation(); setNuevoVehiculo(true); }}>＋ Agregar vehículo</button>
                  )}
                </>
              )}
              {vehiculo && <div className="subtitle" style={{ marginTop: 6 }}>{nombreVeh(vehiculo)}</div>}
            </div>
          </div>
        </div>

        <div className="empty-state" style={{ margin: "0 20px 20px" }}>
          {creando ? "Abriendo la orden…" : "Elige el cliente y su vehículo: la orden se abre sola y ahí agregas las refacciones."}
        </div>
      </div>

      {nuevoCliente && <ClienteFormModal title="Nuevo cliente" initialValues={{}} onSubmit={guardarCliente} onClose={() => setNuevoCliente(false)} />}
      {nuevoVehiculo && (
        <FormModal title={`Nuevo vehículo${cliente ? ` — ${cliente.nombre_cliente}` : ""}`} icono="🚗" fields={camposVehiculo} initialValues={{}} onSubmit={guardarVehiculo} onClose={() => setNuevoVehiculo(false)} />
      )}
    </div>
  );
}
