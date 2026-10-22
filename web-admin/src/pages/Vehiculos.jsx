import { IconoAuto } from "../components/Icono";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FiltroChips, { colorGrupo, contarPor } from "../components/FiltroChips";
import FormModal from "../components/FormModal";
import ModalPortal from "../components/ModalPortal";
import MensajeModal from "../components/MensajeModal";
import FotoGaleria from "../components/FotoGaleria";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

// Catálogo unificado de estatus — mismo catálogo que ETAPAS_SERVICIO en el backend
const ETIQUETAS_ETAPA = {
  en_proceso: "Recibido",
  abierto: "En piso",
  pendiente: "Confirmación del cliente",
  espera_refacciones: "Espera refacciones",
  en_reparacion: "En reparación",
  listo_entrega: "Listo para entrega",
  cerrado: "Órdenes finalizadas",
  garantia: "Garantía",
  cancelado: "Cancelado",
};
const STATUS_BADGE = { abierto: "badge-petrol", cerrado: "badge-teal", cancelado: "badge-red" };

// "Hace 3 días" / "Hace 2 meses" / "Nunca" — para ordenar y mostrar a quién
// le hicieron servicio más recientemente.
function hace(fecha) {
  if (!fecha) return "Nunca se le ha dado servicio";
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Hace 1 día";
  if (dias < 30) return `Hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `Hace ${meses} mes${meses === 1 ? "" : "es"}`;
  const anios = Math.floor(meses / 12);
  return `Hace ${anios} año${anios === 1 ? "" : "s"}`;
}

export default function Vehiculos() {
  const [params, setParams] = useSearchParams();
  const idCliente = params.get("id_cliente");
  const navigate = useNavigate();
  const { confirmDialog, notify } = useUI();
  const { hasPermission } = useAuth();

  const [vehiculos, setVehiculos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [colores, setColores] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marcaSel, setMarcaSel] = useState("");
  const [q, setQ] = useState("");
  const [vista, setVista] = useState("lista"); // lista | clientes
  const [fotosDe, setFotosDe] = useState(null); // vehículo cuyas fotos se están viendo
  const [ofrecerSiguiente, setOfrecerSiguiente] = useState(null); // vehículo recién creado

  async function loadAll() {
    const [v, c, m, mo, co] = await Promise.all([
      api.get(`/vehiculos/${idCliente ? `?id_cliente=${idCliente}` : ""}`),
      api.get("/clientes/?solo_activos=true"),
      api.get("/vehiculos-marcas/"),
      api.get("/vehiculos-modelos/"),
      api.get("/colores-vehiculos/"),
    ]);
    setVehiculos(v);
    setClientes(c);
    setMarcas(m);
    setModelos(mo);
    setColores(co);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCliente]);

  // Si se llegó aquí desde "Cliente creado — ¿agregar su vehículo?", se
  // abre el formulario de alta solo, ya con el cliente precargado, sin
  // que la persona tenga que volver a buscarlo ni dar clic en "+ Nuevo".
  useEffect(() => {
    if (params.get("abrir_nuevo") === "1" && idCliente && hasPermission("vehiculos.crear")) {
      setEditing({ id_cliente: Number(idCliente) });
      const nuevosParams = new URLSearchParams(params);
      nuevosParams.delete("abrir_nuevo");
      setParams(nuevosParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al editar, el cliente dueño no se puede cambiar (rompería la cuenta
  // única vehículo↔cliente), así que el selector se deshabilita.
  // `fields` es una función de `values`: así el modelo solo ofrece "+ Nuevo"
  // una vez que ya se eligió una marca (el modelo pertenece a una marca).
  function fields(values) {
    return [
      {
        name: "id_cliente",
        label: "Cliente",
        type: "buscable",
        placeholder: "Escribe el nombre del cliente…",
        required: true,
        disabled: !!editing?.id_vehiculo,
        grupo: "propietario",
        options: [...clientes]
          .sort((a, b) => a.nombre_cliente.localeCompare(b.nombre_cliente))
          .map((c) => ({ value: c.id_cliente, label: `${c.nombre_cliente} ${c.paterno_cliente || ""}`.trim() })),
      },
      {
        name: "id_marca_vehiculo",
        label: "Marca",
        type: "select",
        required: true,
        grupo: "identificacion",
        // Al cambiar de marca, se limpia el modelo si ya no le corresponde
        onElegir: (idMarca, v) => (v.id_modelo_vehiculo && modelos.find((m) => m.id_modelo_vehiculo === v.id_modelo_vehiculo)?.id_marca_vehiculo !== idMarca ? { id_modelo_vehiculo: null } : {}),
        options: marcas.map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca })),
        creatable: {
          endpoint: "/vehiculos-marcas/",
          createField: "nombre_marca",
          idField: "id_marca_vehiculo",
          label: "marca",
          onCreated: (nueva) => setMarcas((prev) => [...prev, nueva]),
        },
      },
      {
        name: "id_modelo_vehiculo",
        label: "Modelo",
        type: "select",
        required: true,
        grupo: "identificacion",
        // Al elegir un modelo, la marca se hereda sola
        onElegir: (idModelo) => {
          const m = modelos.find((x) => x.id_modelo_vehiculo === idModelo);
          return m ? { id_marca_vehiculo: m.id_marca_vehiculo } : {};
        },
        options: modelos
          .filter((m) => !values.id_marca_vehiculo || m.id_marca_vehiculo === values.id_marca_vehiculo)
          .map((m) => ({ value: m.id_modelo_vehiculo, label: values.id_marca_vehiculo ? m.nombre_modelo : `${marcas.find((x) => x.id_marca_vehiculo === m.id_marca_vehiculo)?.nombre_marca || ""} ${m.nombre_modelo}`.trim() })),
        creatable: values.id_marca_vehiculo
          ? {
              endpoint: "/vehiculos-modelos/",
              createField: "nombre_modelo",
              idField: "id_modelo_vehiculo",
              label: "modelo",
              extraFields: (v) => ({ id_marca_vehiculo: v.id_marca_vehiculo }),
              onCreated: (nuevo) => setModelos((prev) => [...prev, nuevo]),
            }
          : null,
      },
      {
        name: "id_color",
        label: "Color",
        type: "select",
        grupo: "identificacion",
        options: colores.map((c) => ({ value: c.id_color, label: c.nombre_color })),
        creatable: {
          endpoint: "/colores-vehiculos/",
          createField: "nombre_color",
          idField: "id_color",
          label: "color",
          onCreated: (nuevo) => setColores((prev) => [...prev, nuevo]),
        },
      },
      { name: "placas_vehiculo", label: "Placas", grupo: "identificacion" },
      { name: "numserie_vehiculo", label: "Número de serie (VIN)", grupo: "identificacion" },
      { name: "id_year_vehiculo", label: "Año", grupo: "identificacion" },
      { name: "cilindraje_vehiculo", label: "Cilindraje", grupo: "identificacion" },
      { name: "km_vehiculo", label: "Kilometraje", required: true, type: "number", grupo: "identificacion" },
      { name: "comentarios", label: "Comentarios", type: "textarea", full: true, grupo: "propietario" },
    ];
  }

  const gruposVehiculo = {
    propietario: { icono: "🧑", titulo: "Propietario y notas", completo: true },
    identificacion: { icono: "🚗", titulo: "Identificación del vehículo", acento: "acento-teal", completo: true, columnas: 3, grande: true },
  };

  async function handleSave(values) {
    const esNuevo = !editing?.id_vehiculo;
    let creado = null;
    if (editing?.id_vehiculo) {
      await api.put(`/vehiculos/${editing.id_vehiculo}`, values);
    } else {
      creado = await api.post("/vehiculos/", values);
    }
    setEditing(null);
    loadAll();
    notify(esNuevo ? "Vehículo registrado." : "Vehículo actualizado.", "success");
    // Al dar de alta un vehículo nuevo se le ofrece, de una vez, agregarle
    // una foto (recién ahí ya existe su id_vehiculo, antes no se puede) y
    // crear su primera orden — dos cosas que casi siempre siguen después.
    if (esNuevo && creado && hasPermission("servicios.crear")) {
      setOfrecerSiguiente(creado);
    }
  }

  async function handleDelete(v) {
    const ok = await confirmDialog(`¿Eliminar el vehículo con placas ${v.placas_vehiculo || "(sin placas)"}? Esto no se puede deshacer.`, { danger: true, confirmar: "Sí, eliminar" });
    if (!ok) return;
    try {
      await api.del(`/vehiculos/${v.id_vehiculo}`);
      loadAll();
      notify("Vehículo eliminado.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const nomMarcaV = (v) => marcas.find((m) => m.id_marca_vehiculo === v.id_marca_vehiculo)?.nombre_marca || "Sin marca";
  function nombreMarca(id) { return marcas.find((m) => m.id_marca_vehiculo === id)?.nombre_marca || "—"; }
  function nombreModelo(id) { return modelos.find((m) => m.id_modelo_vehiculo === id)?.nombre_modelo || "—"; }
  const porMarca = marcaSel ? vehiculos.filter((v) => nomMarcaV(v) === marcaSel) : vehiculos;
  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (!texto) return porMarca;
    const soloDigitos = texto.replace(/\D/g, "");
    return porMarca.filter((v) => {
      const campos = [
        v.placas_vehiculo,
        nombreMarca(v.id_marca_vehiculo),
        nombreModelo(v.id_modelo_vehiculo),
        v.numero_cuenta,
        v.cliente ? `${v.cliente.nombre_cliente} ${v.cliente.paterno_cliente || ""}` : "",
      ];
      if (campos.some((c) => (c || "").toLowerCase().includes(texto))) return true;
      // Teléfono: compara solo dígitos, así da igual si se busca con o sin guiones/espacios.
      if (soloDigitos && v.cliente?.telefono1 && v.cliente.telefono1.replace(/\D/g, "").includes(soloDigitos)) return true;
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porMarca, q]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/vehiculos" /> Vehículos</h1>
          <div className="subtitle">
            {idCliente ? "Filtrando por cliente seleccionado" : `${vehiculos.length} vehículo(s) registrados`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="vista-toggle vista-toggle-iconos">
            <button type="button" className={`vista-toggle-btn ${vista === "clientes" ? "activo" : ""}`} title="Agrupar por cliente" aria-label="Agrupar por cliente" onClick={() => setVista("clientes")}>
              <Icono nombre="list" size={19} />
            </button>
            <button type="button" className={`vista-toggle-btn ${vista === "lista" ? "activo" : ""}`} title="Vista de lista" aria-label="Vista de lista" onClick={() => setVista("lista")}>
              <Icono nombre="grid" size={19} />
            </button>
          </div>
          {idCliente && (
            <button className="btn btn-secondary" onClick={() => setParams({})}>
              Quitar filtro
            </button>
          )}
          {hasPermission("vehiculos.crear") && (
          <button className="btn btn-primary btn-nuevo" onClick={() => setEditing({ id_cliente: idCliente ? Number(idCliente) : undefined })}>
            <span className="btn-nuevo-icono"><Icono nombre="car" size={22} /><span className="btn-nuevo-mas">+</span></span>Nuevo vehículo</button>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Buscar por placa, marca, modelo, cuenta o cliente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <FiltroChips items={contarPor(vehiculos, nomMarcaV)} valor={marcaSel} onChange={setMarcaSel} total={vehiculos.length} etiquetaTodas="Todas las marcas" />
        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : vista === "clientes" ? (
          <div className="ordenes-lista">
            {visibles.length === 0 && <div className="empty-state">No hay vehículos registrados todavía.</div>}
            {visibles.map((v) => (
              <div
                key={v.id_vehiculo}
                className={`orden-fila fila-acciones ${v.status_ultimo_servicio === "cancelado" ? "est-cancelado" : v.status_ultimo_servicio === "cerrado" ? "est-cerrado" : ""}`}
                style={{ "--acc": colorGrupo(nomMarcaV(v)) }}
                onClick={() => hasPermission("vehiculos.editar") && setEditing(v)}
              >
                <div className="cliente-avatar"><Icono nombre="car" size={22} /></div>
                <div className="orden-main">
                  <div className="orden-titulo">
                    {nombreMarca(v.id_marca_vehiculo)} {nombreModelo(v.id_modelo_vehiculo)} {v.id_year_vehiculo || ""} <span className="cliente-cuenta">{v.placas_vehiculo || "Sin placas"}</span>
                  </div>
                  <div className="orden-meta">
                    <span><Icono nombre="user" size={15} /> {v.cliente ? `${v.cliente.nombre_cliente} ${v.cliente.paterno_cliente || ""}`.trim() : "Sin cliente"}</span>
                    <span><Icono nombre="phone" size={15} /> {v.cliente?.telefono1 || "Sin teléfono"}</span>
                    <span><Icono nombre="chart" size={15} /> {v.km_vehiculo ? `${Number(v.km_vehiculo).toLocaleString("es-MX")} km` : "— km"}</span>
                  </div>
                </div>
                <div className="orden-estado">
                  {v.status_ultimo_servicio ? (
                    <span className={`badge ${STATUS_BADGE[v.status_ultimo_servicio] || "badge-petrol"}`}>
                      {v.status_ultimo_servicio === "abierto" ? (ETIQUETAS_ETAPA[v.etapa_ultimo_servicio] || "Abierto") : v.status_ultimo_servicio === "cerrado" ? "Cerrado" : "Cancelado"}
                    </span>
                  ) : <span className="badge badge-grey">Sin servicios</span>}
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="row-actions">
                    <button type="button" className="btn-icono" title="Fotos" aria-label="Fotos" onClick={() => setFotosDe(v)}><Icono nombre="camera" size={18} /></button>
                    {hasPermission("vehiculos.editar") && (
                      <button type="button" className="btn-icono" title="Editar" aria-label="Editar" onClick={() => setEditing(v)}><Icono nombre="pencil" size={18} /></button>
                    )}
                    {hasPermission("vehiculos.eliminar") && (
                      <button type="button" className="btn-icono btn-icono-peligro" title="Eliminar" aria-label="Eliminar" onClick={() => handleDelete(v)}><Icono nombre="trash" size={18} /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="veh-cuadros">
            {visibles.length === 0 && <div className="empty-state">No hay vehículos registrados todavía.</div>}
            {visibles.map((v) => (
              <div key={v.id_vehiculo} className="veh-tarjeta" style={{ "--acc": colorGrupo(nomMarcaV(v)) }} onClick={() => hasPermission("vehiculos.editar") && setEditing(v)}>
                <div className="veh-tarjeta-foto" onClick={(e) => { e.stopPropagation(); setFotosDe(v); }} title="Ver / agregar fotos">
                  {v.foto_principal ? (
                    <img src={v.foto_principal} alt="" />
                  ) : (
                    <div className="veh-tarjeta-foto-vacia">
                      <Icono nombre="camera" size={26} />
                      <span>Agregar foto</span>
                    </div>
                  )}
                  {v.status_ultimo_servicio && (
                    <span className={`badge ${STATUS_BADGE[v.status_ultimo_servicio] || "badge-petrol"} veh-tarjeta-estado`}>
                      {v.status_ultimo_servicio === "abierto" ? (ETIQUETAS_ETAPA[v.etapa_ultimo_servicio] || "Abierto") : v.status_ultimo_servicio === "cerrado" ? "Cerrado" : "Cancelado"}
                    </span>
                  )}
                </div>
                <div className="veh-tarjeta-cuerpo">
                  <div className="veh-tarjeta-titulo">{nombreMarca(v.id_marca_vehiculo)} {nombreModelo(v.id_modelo_vehiculo)} {v.id_year_vehiculo || ""}</div>
                  <div className="veh-tarjeta-meta">
                    <span><Icono nombre="hash" size={14} /> {v.placas_vehiculo || "Sin placas"}</span>
                    <span><Icono nombre="user" size={14} /> {v.cliente ? `${v.cliente.nombre_cliente} ${v.cliente.paterno_cliente || ""}` : "Sin cliente"}</span>
                    <span><Icono nombre="chart" size={14} /> {v.km_vehiculo ? `${Number(v.km_vehiculo).toLocaleString("es-MX")} km` : "— km"}</span>
                  </div>
                  <div className="veh-tarjeta-pie">
                    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn-icono" title="Fotos" aria-label="Fotos" onClick={() => setFotosDe(v)}><IconoAuto valor="📷" size={18} /></button>
                      {hasPermission("vehiculos.editar") && (
                        <button className="btn-icono" title="Editar" aria-label="Editar" onClick={() => setEditing(v)}><Icono nombre="pencil" size={18} /></button>
                      )}
                      {hasPermission("vehiculos.eliminar") && (
                        <button className="btn-icono btn-icono-peligro" title="Eliminar" aria-label="Eliminar" onClick={() => handleDelete(v)}><Icono nombre="trash" size={18} /></button>
                      )}
                    </div>
                    <div className="veh-tarjeta-contacto">
                      <span className="veh-tarjeta-contacto-nombre">
                        <Icono nombre="user" size={13} />
                        {v.cliente ? `${v.cliente.nombre_cliente} ${v.cliente.paterno_cliente || ""}`.trim() : "Sin cliente"}
                      </span>
                      <span className="veh-tarjeta-contacto-tel" title={v.cliente?.telefono1 || "Sin teléfono registrado"}>
                        <Icono nombre="phone" size={13} />
                        {v.cliente?.telefono1 || "Sin teléfono"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <FormModal
          title={editing.id_vehiculo ? `Editar vehículo — ${editing.numero_cuenta || ""}` : "Nuevo vehículo"}
          icono="🚗"
          subtitulo="Propietario, identificación y estado del vehículo."
          fields={fields}
          grupos={gruposVehiculo}
          initialValues={editing}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
          bloqueExtra={(values) =>
            values.id_vehiculo
              ? {
                  icono: "📷",
                  titulo: "Fotos del vehículo",
                  contenido: <FotoGaleria entidadTipo="vehiculo" entidadId={values.id_vehiculo} puedeEditar={hasPermission("vehiculos.editar")} />,
                }
              : null
          }
        />
      )}

      {fotosDe && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && (setFotosDe(null), loadAll())}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: 18 }}>Fotos — {fotosDe.placas_vehiculo || fotosDe.numero_cuenta}</h2>
            <FotoGaleria
              entidadTipo="vehiculo"
              entidadId={fotosDe.id_vehiculo}
              puedeEditar={hasPermission("vehiculos.editar")}
              onCambio={loadAll}
              onFotoAgregada={() => { loadAll(); setFotosDe(null); }}
            />
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => { setFotosDe(null); loadAll(); }}>Cerrar</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {ofrecerSiguiente && (
        <MensajeModal
          icono="🔧"
          titulo="Vehículo registrado"
          onCerrar={() => setOfrecerSiguiente(null)}
          primario={{
            texto: "Sí, crear orden",
            onClick: () => navigate(`/servicios?id_cliente=${ofrecerSiguiente.id_cliente}&id_vehiculo=${ofrecerSiguiente.id_vehiculo}&abrir_nuevo=1`),
          }}
          secundario={{ texto: "Ahora no", onClick: () => setOfrecerSiguiente(null) }}
        >
          <p>
            {ofrecerSiguiente.placas_vehiculo ? <>El vehículo <b>{ofrecerSiguiente.placas_vehiculo}</b> quedó registrado.</> : "El vehículo quedó registrado."} ¿Quieres crear su primera orden de servicio ahora?
          </p>
        </MensajeModal>
      )}
    </>
  );
}
