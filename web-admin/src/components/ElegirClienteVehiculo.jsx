import { useEffect, useMemo, useRef, useState } from "react";
import { opMarca, opModelo } from "./Combo";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import { contiene } from "../lib/texto";
import "./elegirCV.css";
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
  // Los datos se piden al servidor solo cuando hacen falta: clientes por bloques (con búsqueda en el servidor),
  // vehículos solo del cliente elegido y marcas/modelos solo al dar de alta un vehículo.
  const [clientes, setClientes] = useState([]);
  const [totalClientes, setTotalClientes] = useState(0);
  const [cargandoClientes, setCargandoClientes] = useState(true);
  const [clienteSel, setClienteSel] = useState(null);
  const [vehiculos, setVehiculos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const catalogosListos = useRef(false);
  const [idCliente, setIdCliente] = useState(cli0 || "");
  const [idVehiculo, setIdVehiculo] = useState(veh0 || "");
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [nuevoVehiculo, setNuevoVehiculo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState(cli0 ? 2 : 1);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const POR_PAGINA = 30; // bloques de 30: se cargan más al bajar
  const [limite, setLimite] = useState(POR_PAGINA); // solo para la lista de vehículos (ya filtrada por cliente)
  useEffect(() => { setLimite(POR_PAGINA); }, [q, paso]);

  const filtroClientes = (texto) => `solo_activos=true${texto.trim() ? `&q=${encodeURIComponent(texto.trim())}` : ""}`;
  // Primer bloque de clientes (y su total) cada vez que cambia la búsqueda
  useEffect(() => {
    if (paso !== 1) return undefined;
    let vigente = true;
    setCargandoClientes(true);
    const t = setTimeout(async () => {
      try {
        const [lista, tot] = await Promise.all([
          api.get(`/clientes/?${filtroClientes(q)}&limite=${POR_PAGINA}`),
          api.get(`/clientes/conteo?${filtroClientes(q)}`),
        ]);
        if (!vigente) return;
        setClientes(lista); setTotalClientes(tot.total);
      } catch { if (vigente) setClientes([]); }
      finally { if (vigente) setCargandoClientes(false); }
    }, q.trim() ? 250 : 0);
    return () => { vigente = false; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, paso]);
  async function masClientes() {
    if (cargandoClientes || clientes.length >= totalClientes) return;
    setCargandoClientes(true);
    try {
      const mas = await api.get(`/clientes/?${filtroClientes(q)}&limite=${POR_PAGINA}&offset=${clientes.length}`);
      setClientes((prev) => [...prev, ...mas.filter((m) => !prev.some((x) => x.id_cliente === m.id_cliente))]);
    } finally { setCargandoClientes(false); }
  }
  // Cliente ya elegido de antes (p. ej. viene de otra pantalla): se trae solo ese
  useEffect(() => {
    if (cli0) api.get(`/clientes/${cli0}`).then(setClienteSel).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function cargarVehiculos(idCli) {
    if (!idCli) { setVehiculos([]); return []; }
    const v = await api.get(`/vehiculos/?id_cliente=${idCli}`);
    setVehiculos(v);
    return v;
  }
  useEffect(() => { if (idCliente) cargarVehiculos(idCliente).catch(() => setVehiculos([])); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  async function asegurarCatalogos() {
    if (catalogosListos.current) return;
    catalogosListos.current = true;
    try {
      const [m, mo] = await Promise.all([api.get("/vehiculos-marcas/"), api.get("/vehiculos-modelos/")]);
      setMarcas(m); setModelos(mo);
    } catch { catalogosListos.current = false; }
  }
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && !nuevoCliente && !nuevoVehiculo) onCerrar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [nuevoCliente, nuevoVehiculo, onCerrar]);

  const nombreVeh = (v) => `${v.marca?.nombre_marca || ""} ${v.modelo?.nombre_modelo || ""}`.trim() || v.numero_cuenta;
  const cliente = clienteSel || clientes.find((c) => c.id_cliente === Number(idCliente));

  const opcionesCliente = useMemo(() => clientes.map((c) => ({
    value: c.id_cliente, label: `${c.nombre_cliente} ${c.paterno_cliente || ""}`.trim(),
    sub: [c.numero_cuenta, c.telefono1].filter(Boolean).join(" · "),
  })), [clientes]);
  const opcionesVehiculo = useMemo(() => vehiculos
    .map((v) => ({ value: v.id_vehiculo, label: nombreVeh(v), sub: [v.placas_vehiculo, !idCliente && v.cliente?.nombre_cliente].filter(Boolean).join(" · ") })),
  [vehiculos, idCliente]);

  async function elegirCliente(id) {
    setIdCliente(id);
    setClienteSel(clientes.find((c) => c.id_cliente === Number(id)) || null);
    setIdVehiculo("");
    irAPaso(2);
    try {
      const propios = await cargarVehiculos(id);
      if (propios.length === 1) setIdVehiculo(propios[0].id_vehiculo);
    } catch { setVehiculos([]); }
  }
  function irAPaso(p) { setPaso(p); setQ(""); setSel(0); }
  function elegirVehiculo(id) {
    setIdVehiculo(id);
  }

  async function guardarCliente(values) {
    const creado = await api.post("/clientes/", values);
    notify(`Cliente creado con cuenta ${creado.numero_cuenta}.`, "success");
    setNuevoCliente(false);
    setClienteSel(creado);
    setIdCliente(creado.id_cliente);
    setIdVehiculo("");
    setVehiculos([]);
    irAPaso(2);
    if (hasPermission("vehiculos.crear")) setNuevoVehiculo(true);
  }

  function camposVehiculo(values) {
    return [
      { name: "id_marca_vehiculo", label: "Marca", type: "select", required: true,
        onElegir: (idMarca, v) => (v.id_modelo_vehiculo && modelos.find((m) => m.id_modelo_vehiculo === v.id_modelo_vehiculo)?.id_marca_vehiculo !== idMarca ? { id_modelo_vehiculo: null } : {}),
        options: marcas.map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca, ...opMarca(m) })),
        creatable: { endpoint: "/vehiculos-marcas/", createField: "nombre_marca", idField: "id_marca_vehiculo", label: "marca", onCreated: (n) => setMarcas((p) => [...p, n]) } },
      { name: "id_modelo_vehiculo", label: "Modelo", type: "select", required: true,
        onElegir: (idModelo) => {
          const m = modelos.find((x) => x.id_modelo_vehiculo === idModelo);
          return m ? { id_marca_vehiculo: m.id_marca_vehiculo } : {};
        },
        options: modelos.filter((m) => !values.id_marca_vehiculo || m.id_marca_vehiculo === values.id_marca_vehiculo).map((m) => ({ value: m.id_modelo_vehiculo, ...opModelo(m, marcas), label: values.id_marca_vehiculo ? m.nombre_modelo : `${marcas.find((x) => x.id_marca_vehiculo === m.id_marca_vehiculo)?.nombre_marca || ""} ${m.nombre_modelo}`.trim() })),
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
    await cargarVehiculos(idCliente);
    setIdVehiculo(creado.id_vehiculo);
  }

  async function confirmar() {
    if (!idCliente) return;
    setGuardando(true);
    try {
      await onConfirmar({ id_cliente: Number(idCliente), id_vehiculo: idVehiculo ? Number(idVehiculo) : null });
    } finally {
      setGuardando(false);
    }
  }

  const todas = paso === 1 ? opcionesCliente : opcionesVehiculo.filter((o) => !q.trim() || contiene(`${o.label} ${o.sub || ""}`, q.trim()));
  // Clientes: ya vienen filtrados y paginados del servidor. Vehículos: son pocos (solo los del cliente).
  const lista = paso === 1 ? todas : todas.slice(0, limite);
  const hayMas = paso === 1 ? clientes.length < totalClientes : todas.length > lista.length;
  const masResultados = () => (paso === 1 ? masClientes() : setLimite((l) => Math.min(l + POR_PAGINA, todas.length)));
  const valorActual = paso === 1 ? idCliente : idVehiculo;
  const elegir = (o) => (paso === 1 ? elegirCliente(o.value) : elegirVehiculo(o.value));
  function teclas(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (hayMas && sel >= lista.length - 2) masResultados(); setSel((i) => Math.min(i + 1, lista.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (lista[sel]) elegir(lista[sel]); else if (idCliente) confirmar(); }
  }
  const puedeNuevo = paso === 1 ? hasPermission("clientes.crear") : hasPermission("vehiculos.crear");
  const nuevo = () => (paso === 1 ? setNuevoCliente(true) : (asegurarCatalogos(), setNuevoVehiculo(true)));
  const iniciales = (t) => (t || "?").split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
  const nombreCliente = cliente ? `${cliente.nombre_cliente} ${cliente.paterno_cliente || ""}`.trim() : "";
  const veh = vehiculos.find((v) => v.id_vehiculo === Number(idVehiculo));

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
        <div className="modal ecv-modal ecv2" style={{ maxWidth: 640, width: "min(640px, 94vw)" }}>
          <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={onCerrar}><Icono nombre="close" size={20} /></button>
          <div className="ecv-cabecera">
            <span className="ecv-icono"><Icono nombre="construct" size={22} /></span>
            <div><h2 className="ecv-titulo">Cliente y vehículo</h2><div className="subtitle">Elige o agrega a quién se le hace el servicio</div></div>
          </div>
          <div className="ecv2-tabs">
            <button type="button" className={"ecv2-tab" + (paso === 1 ? " activo" : "") + (idCliente ? " listo" : "")} onClick={() => irAPaso(1)}>
              <small>1 · Cliente</small><b>{idCliente ? nombreCliente : "Elegir"}</b>
            </button>
            <button type="button" className={"ecv2-tab" + (paso === 2 ? " activo" : "") + (idVehiculo ? " listo" : "")} disabled={!idCliente} onClick={() => irAPaso(2)}>
              <small>2 · Vehículo</small><b>{idVehiculo && veh ? nombreVeh(veh) : "Elegir (opcional)"}</b>
            </button>
          </div>
          <div className="ecv2-buscar">
            <input autoFocus key={paso} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={teclas}
              placeholder={paso === 1 ? "Buscar cliente por nombre, cuenta o teléfono…" : "Buscar vehículo por marca, modelo o placas…"} />
            {puedeNuevo && (paso === 1 || idCliente) && (
              <button type="button" className="btn btn-secondary" onClick={nuevo}><Icono nombre="add" size={18} /> {paso === 1 ? "Nuevo cliente" : "Nuevo vehículo"}</button>
            )}
          </div>
          <div className="ecv2-lista" onScroll={(e) => { const el = e.currentTarget; if (hayMas && el.scrollTop + el.clientHeight >= el.scrollHeight - 160) masResultados(); }}>
            {lista.length === 0 ? (
              <div className="ecv2-vacio">
                {cargandoClientes && paso === 1 ? "Cargando…" : paso === 2 && !q.trim() ? "Este cliente aún no tiene vehículos." : "Sin resultados."}
                {puedeNuevo && <button type="button" className="btn btn-primary" onClick={nuevo}><Icono nombre="add" size={18} /> {paso === 1 ? "Agregar cliente nuevo" : "Agregar vehículo nuevo"}</button>}
              </div>
            ) : lista.map((o, i) => (
              <button type="button" key={o.value} className={"ecv2-item" + (String(o.value) === String(valorActual) ? " activo" : "") + (i === sel ? " resaltado" : "")}
                onMouseEnter={() => setSel(i)} onClick={() => elegir(o)}>
                <span className="ecv2-av">{paso === 1 ? iniciales(o.label) : <Icono nombre="car" size={18} />}</span>
                <span className="ecv2-txt"><b>{o.label}</b>{o.sub && <small>{o.sub}</small>}</span>
                {String(o.value) === String(valorActual) && <span className="ecv2-ok">✓</span>}
              </button>
            ))}
            {hayMas && <button type="button" className="btn btn-secondary" style={{ margin: "6px auto 2px", display: "block" }} onClick={masResultados}>Mostrar más ({(paso === 1 ? totalClientes : todas.length) - lista.length} restantes)</button>}
          </div>
          <div style={{ fontSize: 12, opacity: .65, padding: "6px 4px 0" }}>{paso === 1 ? totalClientes : todas.length} {paso === 1 ? "cliente(s)" : "vehículo(s)"}{q.trim() ? " encontrados" : " en total"}{hayMas ? ` · mostrando ${lista.length}` : ""}</div>
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
