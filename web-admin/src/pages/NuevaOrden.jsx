import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import BuscadorSelect from "../components/BuscadorSelect";
import IconoModulo from "../components/IconoModulo";

// Nueva orden: se elige cliente y vehículo con buscador y se abre la orden;
// todo lo demás (diagnóstico, refacciones, anticipo, fotos) se captura ya dentro de ella.
export default function NuevaOrden() {
  const { notify } = useUI();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [idCliente, setIdCliente] = useState("");
  const [idVehiculo, setIdVehiculo] = useState("");
  const [nombre, setNombre] = useState("");
  const [km, setKm] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/clientes/?solo_activos=true"), api.get("/vehiculos/")]).then(([c, v]) => { setClientes(c); setVehiculos(v); });
  }, []);

  const opcionesCliente = useMemo(() => clientes.map((c) => ({
    value: c.id_cliente,
    label: `${c.nombre_cliente} ${c.paterno_cliente || ""}`.trim(),
    sub: [c.numero_cuenta, c.telefono1].filter(Boolean).join(" · "),
  })), [clientes]);

  const opcionesVehiculo = useMemo(() => vehiculos
    .filter((v) => !idCliente || v.id_cliente === Number(idCliente))
    .map((v) => ({
      value: v.id_vehiculo,
      label: `${v.marca?.nombre_marca || ""} ${v.modelo?.nombre_modelo || ""}`.trim() || v.numero_cuenta,
      sub: [v.placas_vehiculo, !idCliente && v.cliente?.nombre_cliente].filter(Boolean).join(" · "),
    })), [vehiculos, idCliente]);

  function elegirCliente(id) {
    setIdCliente(id);
    const propios = vehiculos.filter((v) => v.id_cliente === Number(id));
    setIdVehiculo(propios.length === 1 ? propios[0].id_vehiculo : "");
  }
  function elegirVehiculo(id) {
    setIdVehiculo(id);
    const v = vehiculos.find((x) => x.id_vehiculo === Number(id));
    if (v) {
      setIdCliente(v.id_cliente);
      if (v.km_vehiculo && !km) setKm(String(v.km_vehiculo));
    }
  }

  async function abrir() {
    if (!idCliente || !idVehiculo) { notify("Elige el cliente y el vehículo.", "error"); return; }
    setGuardando(true);
    try {
      const s = await api.post("/servicios/", {
        id_cliente: Number(idCliente), id_vehiculo: Number(idVehiculo),
        nombre_servicio: nombre.trim() || "Servicio general",
        km_llegada: km.trim() || null, iva_porcentaje: 0,
        tipos_mantenimiento_ids: [], autorizado_cliente: false,
      });
      notify(`Orden creada — #${s.id_servicio}.`, "success");
      navigate(`/servicios/${s.id_servicio}?agregar=1`, { replace: true });
    } catch (err) {
      notify(err.message, "error");
      setGuardando(false);
    }
  }

  return (
    <div className="orden-main">
      <div className="orden-hero">
        <div className="orden-hero-top">
          <Link className="icon-btn" to="/servicios" title="Volver a las órdenes de servicio">←</Link>
          <h1 className="orden-hero-titulo"><IconoModulo ruta="/servicios" /> Nueva orden de servicio</h1>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, padding: 20 }}>
          <BuscadorSelect label="Cliente" opciones={opcionesCliente} value={idCliente} onChange={elegirCliente} placeholder="Buscar cliente por nombre, cuenta o teléfono…" />
          <BuscadorSelect label={idCliente ? "Vehículo de este cliente" : "Vehículo"} opciones={opcionesVehiculo} value={idVehiculo} onChange={elegirVehiculo}
            placeholder="Buscar vehículo por marca, modelo o placas…" vacio="Este cliente no tiene vehículos" />
          <div className="field"><label>Trabajo a realizar</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Cambio de balatas (se puede editar después)" /></div>
          <div className="field"><label>Kilometraje de llegada</label><input value={km} onChange={(e) => setKm(e.target.value)} inputMode="numeric" placeholder="45000" /></div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", padding: "0 20px 20px", flexWrap: "wrap" }}>
          {idCliente && !opcionesVehiculo.length && (
            <Link className="btn btn-secondary" to={`/vehiculos?id_cliente=${idCliente}&abrir_nuevo=1`}>Agregar vehículo a este cliente</Link>
          )}
          <Link className="btn btn-secondary" to="/clientes?abrir_nuevo=1">Nuevo cliente</Link>
          <button className="btn btn-primary" onClick={abrir} disabled={guardando || !idCliente || !idVehiculo}>
            {guardando ? "Abriendo…" : "Abrir orden"}
          </button>
        </div>
      </div>
    </div>
  );
}
