import { useEffect, useMemo, useState } from "react";
import { marcarCampo } from "../validacion";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import BuscadorSelect from "./BuscadorSelect";
import ClienteFormModal from "./ClienteFormModal";
import FormModal from "./FormModal";
import ModalPortal from "./ModalPortal";
import { Icono } from "./Icono";

/*
 * Ventana emergente para fijar el cliente y el vehículo de una orden:
 * se elige uno existente (con buscador) o se da de alta en el momento.
 *   foco: "cliente" | "vehiculo" — qué selector se muestra primero
 *   onConfirmar({ id_cliente, id_vehiculo })
 */
export default function ElegirClienteVehiculo({ idCliente: cli0, idVehiculo: veh0, onConfirmar, onCerrar }) {
  const { notify } = useUI();
  const { hasPermission } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [idCliente, setIdCliente] = useState(cli0 || "");
  const [idVehiculo, setIdVehiculo] = useState(veh0 || "");
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [nuevoVehiculo, setNuevoVehiculo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const [c, v, m, mo] = await Promise.all([
      api.get("/clientes/?solo_activos=true"), api.get("/vehiculos/"),
      api.get("/vehiculos-marcas/"), api.get("/vehiculos-modelos/"),
    ]);
    setClientes(c); setVehiculos(v); setMarcas(m); setModelos(mo);
  }
  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && !nuevoCliente && !nuevoVehiculo) onCerrar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [nuevoCliente, nuevoVehiculo, onCerrar]);

  const nombreVeh = (v) => `${v.marca?.nombre_marca || ""} ${v.modelo?.nombre_modelo || ""}`.trim() || v.numero_cuenta;
  const cliente = clientes.find((c) => c.id_cliente === Number(idCliente));

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
    const propios = vehiculos.filter((v) => v.id_cliente === Number(id));
    setIdVehiculo(propios.length === 1 ? propios[0].id_vehiculo : "");
  }
  function elegirVehiculo(id) {
    setIdVehiculo(id);
    const v = vehiculos.find((x) => x.id_vehiculo === Number(id));
    if (v) setIdCliente(v.id_cliente);
  }

  async function guardarCliente(values) {
    const creado = await api.post("/clientes/", values);
    notify(`Cliente creado con cuenta ${creado.numero_cuenta}.`, "success");
    setNuevoCliente(false);
    await cargar();
    setIdCliente(creado.id_cliente);
    setIdVehiculo("");
    setNuevoVehiculo(true);
  }

  function camposVehiculo(values) {
    return [
      { name: "id_marca_vehiculo", label: "Marca", type: "select", required: true,
        onElegir: (idMarca, v) => (v.id_modelo_vehiculo && modelos.find((m) => m.id_modelo_vehiculo === v.id_modelo_vehiculo)?.id_marca_vehiculo !== idMarca ? { id_modelo_vehiculo: null } : {}),
        options: marcas.map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca })),
        creatable: { endpoint: "/vehiculos-marcas/", createField: "nombre_marca", idField: "id_marca_vehiculo", label: "marca", onCreated: (n) => setMarcas((p) => [...p, n]) } },
      { name: "id_modelo_vehiculo", label: "Modelo", type: "select", required: true,
        onElegir: (idModelo) => {
          const m = modelos.find((x) => x.id_modelo_vehiculo === idModelo);
          return m ? { id_marca_vehiculo: m.id_marca_vehiculo } : {};
        },
        options: modelos.filter((m) => !values.id_marca_vehiculo || m.id_marca_vehiculo === values.id_marca_vehiculo).map((m) => ({ value: m.id_modelo_vehiculo, label: values.id_marca_vehiculo ? m.nombre_modelo : `${marcas.find((x) => x.id_marca_vehiculo === m.id_marca_vehiculo)?.nombre_marca || ""} ${m.nombre_modelo}`.trim() })),
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

  async function confirmar() {
    if (!idCliente) { marcarCampo(document.querySelector(".ecv-modal .buscador-select input"), "Elige un cliente"); return; }
    setGuardando(true);
    try {
      await onConfirmar({ id_cliente: Number(idCliente), id_vehiculo: idVehiculo ? Number(idVehiculo) : null });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
        <div className="modal ecv-modal" style={{ maxWidth: 560, overflow: "visible" }}>
          <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={onCerrar}><Icono nombre="close" size={20} /></button>
          <div className="ecv-cabecera">
            <span className="ecv-icono"><Icono nombre="construct" size={22} /></span>
            <div><h2 className="ecv-titulo">Cliente y vehículo</h2><div className="subtitle">Elige o agrega a quién se le hace el servicio</div></div>
          </div>
          <div className="ecv-pasos">
            <span className={"ecv-paso" + (idCliente ? " listo" : " activo")}>1 · Cliente{idCliente ? " ✓" : ""}</span>
            <span className={"ecv-paso" + (idVehiculo ? " listo" : idCliente ? " activo" : "")}>2 · Vehículo{idVehiculo ? " ✓" : ""}</span>
          </div>
          <BuscadorSelect label="Cliente" opciones={opcionesCliente} value={idCliente} onChange={elegirCliente} placeholder="Buscar por nombre, cuenta o teléfono…" />
          {hasPermission("clientes.crear") && (
            <button type="button" className="btn btn-secondary ecv-agregar" onClick={() => setNuevoCliente(true)}><Icono nombre="add" size={18} /> Agregar cliente nuevo</button>
          )}
          {cliente && (
            <>
              <BuscadorSelect label="Vehículo" opciones={opcionesVehiculo} value={idVehiculo} onChange={elegirVehiculo} placeholder="Buscar por marca, modelo o placas…" vacio="Este cliente no tiene vehículos" />
              {hasPermission("vehiculos.crear") && (
                <button type="button" className="btn btn-secondary ecv-agregar" onClick={() => setNuevoVehiculo(true)}><Icono nombre="add" size={18} /> Agregar vehículo nuevo</button>
              )}
            </>
          )}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmar} disabled={guardando || !idCliente}>{guardando ? "Guardando…" : "Aceptar y continuar"}</button>
          </div>
        </div>
      </div>
      {nuevoCliente && <ClienteFormModal title="Nuevo cliente" initialValues={{}} onSubmit={guardarCliente} onClose={() => setNuevoCliente(false)} />}
      {nuevoVehiculo && <FormModal title={`Nuevo vehículo${cliente ? ` — ${cliente.nombre_cliente}` : ""}`} icono="🚗" fields={camposVehiculo} initialValues={{}} onSubmit={guardarVehiculo} onClose={() => setNuevoVehiculo(false)} />}
    </ModalPortal>
  );
}
