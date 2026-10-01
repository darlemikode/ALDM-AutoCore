import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import BuscadorSelect from "./BuscadorSelect";
import ClienteFormModal from "./ClienteFormModal";
import FormModal from "./FormModal";
import ModalPortal from "./ModalPortal";

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

  async function confirmar() {
    if (!idCliente) { notify("Elige el cliente.", "error"); return; }
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
        <div className="modal" style={{ maxWidth: 520, overflow: "visible" }}>
          <h2 style={{ fontSize: 20 }}>Cliente y vehículo de la orden</h2>
          <BuscadorSelect label="Cliente" opciones={opcionesCliente} value={idCliente} onChange={elegirCliente} placeholder="Buscar por nombre, cuenta o teléfono…" />
          {hasPermission("clientes.crear") && (
            <button type="button" className="btn btn-secondary btn-sm" style={{ margin: "6px 0 14px" }} onClick={() => setNuevoCliente(true)}>＋ Agregar cliente</button>
          )}
          {cliente && (
            <>
              <BuscadorSelect label="Vehículo" opciones={opcionesVehiculo} value={idVehiculo} onChange={elegirVehiculo} placeholder="Buscar por marca, modelo o placas…" vacio="Este cliente no tiene vehículos" />
              {hasPermission("vehiculos.crear") && (
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setNuevoVehiculo(true)}>＋ Agregar vehículo</button>
              )}
            </>
          )}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmar} disabled={guardando || !idCliente}>{guardando ? "Guardando…" : "Aceptar"}</button>
          </div>
        </div>
      </div>
      {nuevoCliente && <ClienteFormModal title="Nuevo cliente" initialValues={{}} onSubmit={guardarCliente} onClose={() => setNuevoCliente(false)} />}
      {nuevoVehiculo && <FormModal title={`Nuevo vehículo${cliente ? ` — ${cliente.nombre_cliente}` : ""}`} icono="🚗" fields={camposVehiculo} initialValues={{}} onSubmit={guardarVehiculo} onClose={() => setNuevoVehiculo(false)} />}
    </ModalPortal>
  );
}
