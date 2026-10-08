import { contiene, norm } from "../lib/texto";
import { IconoAuto } from "../components/Icono";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

// Mismo ciclo de acentos que Roles y Super Admin — cada catálogo toma un color.
const COLORES = ["petrol", "teal", "warn", "violet", "blue"];
function acentoDe(indice) {
  const c = COLORES[indice % COLORES.length];
  return { "--acc": `var(--${c}-600)`, "--acc-soft": `var(--${c}-100)` };
}

// Configuración de cada catálogo simple: endpoint, llave primaria, campo de
// nombre, campos del formulario y (si aplica) de qué otro catálogo depende.
const CATALOGS = {
  paises: {
    label: "Países", grupo: "Ubicación", icono: "🌎", descripcion: "Países disponibles para domicilios de clientes y proveedores.",
    endpoint: "/paises", idField: "id_pais", nombreField: "nombre_pais",
    fields: [{ name: "nombre_pais", label: "Nombre", required: true }],
  },
  estados: {
    label: "Estados", grupo: "Ubicación", icono: "🗺️", descripcion: "Estados de cada país.",
    endpoint: "/estados", idField: "id_estado", nombreField: "nombre_estado",
    padre: { dep: "paises", campo: "id_pais", nombre: "nombre_pais", idField: "id_pais", label: "País", plural: "países" },
    fields: (deps) => [
      { name: "nombre_estado", label: "Nombre", required: true },
      { name: "id_pais", label: "País", type: "select", required: true, options: deps.paises.map((p) => ({ value: p.id_pais, label: p.nombre_pais })) },
    ],
    deps: ["paises"],
  },
  ciudades: {
    label: "Ciudades", grupo: "Ubicación", icono: "🏙️", descripcion: "Ciudades de cada estado — alimentan el autollenado por código postal.",
    endpoint: "/ciudades", idField: "id_ciudad", nombreField: "nombre_ciudad",
    padre: { dep: "estados", campo: "id_estado", nombre: "nombre_estado", idField: "id_estado", label: "Estado", plural: "estados" },
    fields: (deps) => [
      { name: "nombre_ciudad", label: "Nombre", required: true },
      { name: "id_estado", label: "Estado", type: "select", required: true, options: deps.estados.map((e) => ({ value: e.id_estado, label: e.nombre_estado })) },
    ],
    deps: ["estados"],
  },
  colores: {
    label: "Colores de vehículo", grupo: "Vehículos", icono: "🎨", descripcion: "Colores que se eligen al registrar un vehículo.",
    endpoint: "/colores-vehiculos", idField: "id_color", nombreField: "nombre_color",
    fields: [{ name: "nombre_color", label: "Nombre", required: true }],
  },
  marcasVehiculos: {
    label: "Marcas de vehículo", grupo: "Vehículos", icono: "🏷", descripcion: "Armadoras (Nissan, Chevrolet, VW…).",
    endpoint: "/vehiculos-marcas", idField: "id_marca_vehiculo", nombreField: "nombre_marca", notaField: "comentarios",
    fields: [{ name: "nombre_marca", label: "Nombre", required: true }, { name: "comentarios", label: "Comentarios", type: "textarea", full: true }],
  },
  modelosVehiculos: {
    label: "Modelos de vehículo", grupo: "Vehículos", icono: "🚙", descripcion: "Modelos de cada marca (Versa, Aveo, Jetta…).",
    endpoint: "/vehiculos-modelos", idField: "id_modelo_vehiculo", nombreField: "nombre_modelo", notaField: "comentario",
    padre: { dep: "marcasVehiculos", campo: "id_marca_vehiculo", nombre: "nombre_marca", idField: "id_marca_vehiculo", label: "Marca", plural: "marcas" },
    fields: (deps) => [
      { name: "nombre_modelo", label: "Nombre", required: true },
      { name: "id_marca_vehiculo", label: "Marca", type: "select", required: true, options: deps.marcasVehiculos.map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca })) },
      { name: "comentario", label: "Comentario", type: "textarea", full: true },
    ],
    deps: ["marcasVehiculos"],
  },
  marcasRefacciones: {
    label: "Marcas de refacciones", grupo: "Refacciones y herramientas", icono: "⚙️", descripcion: "Fabricantes de refacciones (Bosch, Brembo, NGK…).",
    endpoint: "/refacciones-marcas", idField: "id_marca_refaccion", nombreField: "nombre_marca", notaField: "comentarios",
    fields: [{ name: "nombre_marca", label: "Nombre", required: true }, { name: "comentarios", label: "Comentarios", type: "textarea", full: true }],
  },
  categoriasRefacciones: {
    label: "Categorías de refacción", grupo: "Refacciones y herramientas", icono: "🗂️", descripcion: "Agrupan el catálogo de refacciones (Frenos, Suspensión…).",
    endpoint: "/refacciones-categorias", idField: "id_categoria_refaccion", nombreField: "nombre_categoria",
    fields: [{ name: "nombre_categoria", label: "Nombre", required: true }],
  },
  marcasHerramientas: {
    label: "Marcas de herramientas", grupo: "Refacciones y herramientas", icono: "🛠️", descripcion: "Fabricantes del inventario de herramientas.",
    endpoint: "/herramientas-marcas", idField: "id_herramienta_marca", nombreField: "nombre_marca", notaField: "comentario",
    fields: [{ name: "nombre_marca", label: "Nombre", required: true }, { name: "comentario", label: "Comentario", type: "textarea", full: true }],
  },
  tiposServicio: {
    label: "Tipos de servicio", grupo: "Servicios", icono: "🔧", descripcion: "Tipos de mantenimiento que se eligen al abrir una orden.",
    endpoint: "/tipos-servicio", idField: "id_tipo_servicio", nombreField: "nombre_tipo",
    fields: [{ name: "nombre_tipo", label: "Nombre", required: true }],
  },
};

const CLAVES = Object.keys(CATALOGS);
// Esenciales: lo que el taller usa a diario. El resto (ubicación global y
// marcas de herramientas) va colapsado en "Más catálogos".
const esAvanzado = (k) => CATALOGS[k].grupo === "Ubicación" || CATALOGS[k].label === "Marcas de herramientas";
const CLAVES_ESENCIALES = CLAVES.filter((k) => !esAvanzado(k));
const CLAVES_AVANZADAS = CLAVES.filter(esAvanzado);
const GRUPOS = [...new Set(CLAVES_ESENCIALES.map((k) => CATALOGS[k].grupo))];

export default function Catalogos() {
  const { confirmDialog, notify } = useUI();
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState(CLAVES_ESENCIALES[0]);
  const [verMas, setVerMas] = useState(false);
  const [rows, setRows] = useState([]);
  const [deps, setDeps] = useState({});
  const [conteos, setConteos] = useState({});
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroPadre, setFiltroPadre] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [guardandoRapido, setGuardandoRapido] = useState(false);

  const puedeCrear = hasPermission("catalogos.crear");
  const puedeEditar = hasPermission("catalogos.editar");
  const puedeEliminar = hasPermission("catalogos.eliminar");

  const config = CATALOGS[tab];
  const tarjeta = (k) => {
    const c = CATALOGS[k];
    const n = conteos[k];
    return (
      <button
        type="button"
        key={k}
        onClick={() => setTab(k)}
        className={`rol-card ${tab === k ? "activo" : ""}`}
        style={acentoDe(CLAVES.indexOf(k))}
      >
        <span className="rol-card-icono"><IconoAuto valor={c.icono} size={18} /></span>
        <span className="rol-card-info">
          <span className="rol-card-nombre">{c.label}</span>
          <span className="rol-card-meta">{n === undefined ? "…" : `${n} registro${n === 1 ? "" : "s"}`}</span>
        </span>
      </button>
    );
  };

  const indice = CLAVES.indexOf(tab);
  // Al cambiar de catálogo, React repinta de inmediato con el "deps" del
  // catálogo ANTERIOR (el nuevo todavía se está pidiendo) — aquí se rellenan
  // con [] los que falten para que config.fields(deps) no truene.
  const depsSeguros = {};
  for (const nombreDep of config.deps || []) {
    depsSeguros[nombreDep] = deps[nombreDep] || [];
  }

  // Conteo de todos los catálogos para la lista de la izquierda
  useEffect(() => {
    Promise.allSettled(CLAVES.map((k) => api.get(CATALOGS[k].endpoint + "/"))).then((res) => {
      const c = {};
      res.forEach((r, i) => { if (r.status === "fulfilled") c[CLAVES[i]] = r.value.length; });
      setConteos(c);
    });
  }, []);

  async function load() {
    try {
      const depData = {};
      for (const name of config.deps || []) {
        depData[name] = await api.get(CATALOGS[name].endpoint + "/");
      }
      setDeps(depData);
      const datos = await api.get(config.endpoint + "/");
      setRows(datos);
      setConteos((c) => ({ ...c, [tab]: datos.length }));
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setBusqueda("");
    setFiltroPadre("");
    setNuevoNombre("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const fields = typeof config.fields === "function" ? config.fields(depsSeguros) : config.fields;
  const padres = config.padre ? depsSeguros[config.padre.dep] || [] : [];
  const nombrePadre = (row) => padres.find((p) => p[config.padre.idField] === row[config.padre.campo])?.[config.padre.nombre] || "—";

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rows
      .filter((r) => !filtroPadre || String(r[config.padre?.campo]) === filtroPadre)
      .filter((r) => !q || contiene(r[config.nombreField], q))
      .sort((a, b) => String(a[config.nombreField]).localeCompare(String(b[config.nombreField]), "es"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, busqueda, filtroPadre, tab]);

  async function handleSave(values) {
    if (editing?.[config.idField]) {
      await api.put(`${config.endpoint}/${editing[config.idField]}`, values);
      notify("Registro actualizado.", "success");
    } else {
      await api.post(`${config.endpoint}/`, values);
      notify("Registro agregado.", "success");
    }
    setEditing(null);
    load();
  }

  // Alta rápida: escribir el nombre y Enter. Si el catálogo depende de otro
  // (ej. Modelos → Marca), usa el filtro elegido como padre.
  async function altaRapida(e) {
    e.preventDefault();
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    if (config.padre && !filtroPadre) {
      setEditing({ [config.nombreField]: nombre });
      return;
    }
    if (rows.some((r) => String(r[config.nombreField]).toLowerCase() === nombre.toLowerCase())) {
      notify(`"${nombre}" ya existe en ${config.label}.`, "error");
      return;
    }
    setGuardandoRapido(true);
    try {
      const payload = { [config.nombreField]: nombre };
      if (config.padre) payload[config.padre.campo] = Number(filtroPadre);
      await api.post(`${config.endpoint}/`, payload);
      setNuevoNombre("");
      notify(`"${nombre}" agregado.`, "success");
      load();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardandoRapido(false);
    }
  }

  async function handleDelete(row) {
    const ok = await confirmDialog(`¿Eliminar "${row[config.nombreField]}" de ${config.label}?`, { danger: true });
    if (!ok) return;
    try {
      await api.del(`${config.endpoint}/${row[config.idField]}`);
      load();
      notify("Registro eliminado.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-titulo">
          <div>
            <h1><IconoModulo ruta="/catalogos" /> Catálogos generales</h1>
            <div className="subtitle">
              Listas usadas en clientes, vehículos y refacciones
              {!puedeEditar && <span className="role-badge">Solo lectura</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="roles-layout cat-layout">
        <div className="roles-lista">
          {GRUPOS.map((grupo) => (
            <div key={grupo} className="cat-grupo">
              <div className="cat-grupo-titulo">{grupo}</div>
              {CLAVES_ESENCIALES.filter((k) => CATALOGS[k].grupo === grupo).map(tarjeta)}
            </div>
          ))}
          <div className="cat-grupo">
            <button type="button" className="cat-grupo-titulo" style={{ background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0 }} onClick={() => setVerMas((v) => !v)}>
              {verMas || CLAVES_AVANZADAS.includes(tab) ? "▾" : "▸"} Más catálogos (ubicación y herramientas)
            </button>
            {(verMas || CLAVES_AVANZADAS.includes(tab)) && CLAVES_AVANZADAS.map(tarjeta)}
          </div>
        </div>

        <div className="panel">
          <div className="cat-cabecera">
            <div>
              <h2><IconoAuto valor={config.icono} size={18} /> {config.label}</h2>
              <div className="cat-descripcion">{config.descripcion}</div>
            </div>
            {puedeCrear && (
              <button className="btn btn-primary btn-nuevo" onClick={() => setEditing(config.padre && filtroPadre ? { [config.padre.campo]: Number(filtroPadre) } : {})}>
                <span className="btn-nuevo-icono"><Icono nombre="doc-add" size={22} /><span className="btn-nuevo-mas">+</span></span>Nuevo registro</button>
            )}
          </div>

          <div className="cat-filtros">
            <input className="search-input" placeholder={`Buscar en ${config.label.toLowerCase()}…`} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            {config.padre && (
              <select value={filtroPadre} onChange={(e) => setFiltroPadre(e.target.value)}>
                <option value="">{config.padre.label === "Marca" ? "Todas las" : "Todos los"} {config.padre.plural}</option>
                {[...padres]
                  .sort((a, b) => String(a[config.padre.nombre]).localeCompare(String(b[config.padre.nombre]), "es"))
                  .map((p) => <option key={p[config.padre.idField]} value={p[config.padre.idField]}>{p[config.padre.nombre]}</option>)}
              </select>
            )}
          </div>

          <div className="modulo-card" style={acentoDe(indice)}>
            <div className="modulo-card-header">
              <span className="modulo-card-icono"><IconoAuto valor={config.icono} size={18} /></span>
              <span className="modulo-card-titulo">
                {config.label}
                {config.padre && filtroPadre && ` · ${padres.find((p) => String(p[config.padre.idField]) === filtroPadre)?.[config.padre.nombre] || ""}`}
              </span>
              <span className="modulo-card-contador">{filtradas.length}{filtradas.length !== rows.length ? `/${rows.length}` : ""}</span>
            </div>

            {puedeCrear && (
              <form className="cat-alta-rapida" onSubmit={altaRapida}>
                <input
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder={config.padre && !filtroPadre
                    ? `Nuevo registro — filtra por ${config.padre.label.toLowerCase()} para agregarlo directo…`
                    : `Escribe un nombre y presiona Enter para agregarlo…`}
                />
                <button type="submit" className="btn btn-secondary btn-sm" disabled={guardandoRapido || !nuevoNombre.trim()}>
                  {guardandoRapido ? "Agregando…" : "+ Agregar"}
                </button>
              </form>
            )}

            <div className="cat-lista">
              {loading ? (
                <div className="loading-text">Cargando…</div>
              ) : filtradas.length === 0 ? (
                <div className="empty-state">{rows.length ? "Ningún registro coincide con la búsqueda." : "Sin registros en este catálogo."}</div>
              ) : (
                filtradas.map((r) => (
                  <div className="cat-item" key={r[config.idField]}>
                    <span className="cat-item-punto" />
                    <div className="cat-item-info">
                      <div className="cat-item-nombre">{r[config.nombreField]}</div>
                      {(config.padre || (config.notaField && r[config.notaField])) && (
                        <div className="cat-item-meta">
                          {config.padre && <span className="cat-item-tag">{config.padre.label}: {nombrePadre(r)}</span>}
                          {config.notaField && r[config.notaField] && <span>{r[config.notaField]}</span>}
                        </div>
                      )}
                    </div>
                    <div className="row-actions">
                      {puedeEditar && <button className="btn btn-secondary btn-sm" onClick={() => setEditing(r)}>Editar</button>}
                      {puedeEliminar && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>Eliminar</button>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <FormModal
          title={editing[config.idField] ? `Editar — ${config.label}` : `Nuevo — ${config.label}`}
          icono={config.icono}
          subtitulo={config.descripcion}
          fields={fields}
          initialValues={editing}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
