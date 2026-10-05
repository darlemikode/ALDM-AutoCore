import { IconoAuto } from "../components/Icono";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FiltroChips, { colorGrupo, contarPor } from "../components/FiltroChips";
import FormModal from "../components/FormModal";
import ModalPortal from "../components/ModalPortal";
import FotoGaleria from "../components/FotoGaleria";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

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
    if (params.get("abrir_nuevo") === "1" && idCliente) {
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
    if (esNuevo && creado) {
      setOfrecerSiguiente(creado);
    }
  }

  async function handleDelete(v) {
    const ok = await confirmDialog(`¿Eliminar el vehículo con placas ${v.placas_vehiculo || "(sin placas)"}? Esto no se puede deshacer.`, { danger: true });
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
  const visibles = marcaSel ? vehiculos.filter((v) => nomMarcaV(v) === marcaSel) : vehiculos;
  function nombreMarca(id) { return marcas.find((m) => m.id_marca_vehiculo === id)?.nombre_marca || "—"; }
  function nombreModelo(id) { return modelos.find((m) => m.id_modelo_vehiculo === id)?.nombre_modelo || "—"; }

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
          {idCliente && (
            <button className="btn btn-secondary" onClick={() => setParams({})}>
              Quitar filtro
            </button>
          )}
          <button className="btn btn-primary btn-nuevo" onClick={() => setEditing({ id_cliente: idCliente ? Number(idCliente) : undefined })}>
            <span className="btn-nuevo-icono"><Icono nombre="car" size={22} /><span className="btn-nuevo-mas">+</span></span>Nuevo vehículo</button>
        </div>
      </div>

      <div className="panel">
        <FiltroChips items={contarPor(vehiculos, nomMarcaV)} valor={marcaSel} onChange={setMarcaSel} total={vehiculos.length} etiquetaTodas="Todas las marcas" />
        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : (
          <div className="ordenes-lista">
            {visibles.length === 0 && <div className="empty-state">No hay vehículos registrados todavía.</div>}
            {visibles.map((v) => (
              <div key={v.id_vehiculo} className="orden-fila fila-acciones" style={{ "--acc": colorGrupo(nomMarcaV(v)) }} onClick={() => setEditing(v)}>
                <div className="cliente-avatar"><Icono nombre="car" size={26} /></div>
                <div className="orden-main">
                  <div className="orden-titulo">{nombreMarca(v.id_marca_vehiculo)} {nombreModelo(v.id_modelo_vehiculo)} {v.id_year_vehiculo || ""}</div>
                  <div className="orden-meta">
                    <span><Icono nombre="hash" size={15} /> {v.placas_vehiculo || "Sin placas"}</span>
                    <span><Icono nombre="user" size={15} /> {v.cliente ? `${v.cliente.nombre_cliente} ${v.cliente.paterno_cliente || ""}` : "Sin cliente"}</span>
                    <span><Icono nombre="chart" size={15} /> {v.km_vehiculo ? `${Number(v.km_vehiculo).toLocaleString("es-MX")} km` : "— km"}</span>
                  </div>
                </div>
                <div className="orden-estado"><span className="cliente-cuenta">{v.numero_cuenta}</span></div>
                <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn-icono" title="Fotos" aria-label="Fotos" onClick={() => setFotosDe(v)}><IconoAuto valor="📷" size={18} /></button>
                  <button className="btn-icono" title="Editar" aria-label="Editar" onClick={() => setEditing(v)}><Icono nombre="pencil" size={18} /></button>
                  {hasPermission("vehiculos.eliminar") && (
                    <button className="btn-icono btn-icono-peligro" title="Eliminar" aria-label="Eliminar" onClick={() => handleDelete(v)}><Icono nombre="trash" size={18} /></button>
                  )}
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
        />
      )}

      {fotosDe && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setFotosDe(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: 18 }}>Fotos — {fotosDe.placas_vehiculo || fotosDe.numero_cuenta}</h2>
            <FotoGaleria entidadTipo="vehiculo" entidadId={fotosDe.id_vehiculo} puedeEditar={hasPermission("vehiculos.editar")} />
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setFotosDe(null)}>Cerrar</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {ofrecerSiguiente && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setOfrecerSiguiente(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 style={{ fontSize: 18 }}>Vehículo registrado </h2>
            <p style={{ color: "var(--ink-500)", fontSize: 13.5, lineHeight: 1.5 }}>
              ¿Quieres crear su primera orden de una vez?
            </p>
            <div className="modal-actions" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-secondary" onClick={() => setOfrecerSiguiente(null)}>Ahora no</button>
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/servicios?id_cliente=${ofrecerSiguiente.id_cliente}&id_vehiculo=${ofrecerSiguiente.id_vehiculo}&abrir_nuevo=1`)}
              >
                <IconoAuto valor="🔧" size={18} /> Crear orden
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
