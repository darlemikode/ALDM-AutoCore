import { contiene, norm } from "../lib/texto";
import { IconoAuto } from "../components/Icono";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { opMarca } from "../components/Combo";
import { Icono } from "../components/Icono";
import "./catalogos.css";
import LogoMarca from "../components/LogoMarca";
import ImagenModelo from "../components/ImagenModelo";
import ImagenMarca from "../components/ImagenMarca";
import ColorAuto, { hexDeColor } from "../components/ColorAuto";
import ModalPortal from "../components/ModalPortal";

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
    colorRef: true, label: "Colores de vehículo", grupo: "Vehículos", icono: "🎨", descripcion: "Colores que se eligen al registrar un vehículo.",
    endpoint: "/colores-vehiculos", idField: "id_color", nombreField: "nombre_color",
    fields: [
      { name: "nombre_color", label: "Nombre", required: true },
      {
        name: "codigo_hex", label: "Color de referencia", type: "custom", full: true,
        render: (valor, set) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <ColorAuto nombre="" hex={valor || "#9AA0A6"} size={90} />
            <input type="color" value={valor && /^#[0-9a-fA-F]{6}$/.test(valor) ? valor : "#9aa0a6"} onChange={(e) => set(e.target.value.toUpperCase())} style={{ width: 64, height: 42, padding: 2 }} aria-label="Elegir color" />
            <input value={valor || ""} placeholder="#C8102E" maxLength={7} onChange={(e) => set(e.target.value)} style={{ width: 110 }} />
            {valor && <button type="button" className="btn btn-secondary btn-sm" onClick={() => set("")}>Quitar</button>}
          </div>
        ),
      },
    ],
  },
  marcasVehiculos: {
    label: "Marcas de vehículo", grupo: "Vehículos", icono: "🏷", descripcion: "Armadoras (Nissan, Chevrolet, VW…).",
    logo: true, endpoint: "/vehiculos-marcas", idField: "id_marca_vehiculo", nombreField: "nombre_marca", notaField: "comentarios",
    fields: [{ name: "nombre_marca", label: "Nombre", required: true }, { name: "comentarios", label: "Comentarios", type: "textarea", full: true }],
  },
  modelosVehiculos: {
    label: "Modelos de vehículo", grupo: "Vehículos", icono: "🚙", descripcion: "Modelos de cada marca (Versa, Aveo, Jetta…).",
    logoPadre: true, endpoint: "/vehiculos-modelos", idField: "id_modelo_vehiculo", nombreField: "nombre_modelo", notaField: "comentario",
    padre: { dep: "marcasVehiculos", campo: "id_marca_vehiculo", nombre: "nombre_marca", idField: "id_marca_vehiculo", label: "Marca", plural: "marcas" },
    fields: (deps) => [
      { name: "nombre_modelo", label: "Nombre", required: true },
      { name: "id_marca_vehiculo", label: "Marca", type: "select", required: true, options: deps.marcasVehiculos.map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca, ...opMarca(m) })) },
      { name: "comentario", label: "Comentario", type: "textarea", full: true },
    ],
    deps: ["marcasVehiculos"],
  },
  marcasRefacciones: {
    logoRefaccion: true, label: "Marcas de refacciones", grupo: "Refacciones y herramientas", icono: "⚙️", descripcion: "Fabricantes de refacciones (Bosch, Brembo, NGK…).",
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

// Foto del modelo dentro del formulario de edición: ver la actual (o la sugerida), subir una propia o quitarla.
function CampoFotoModelo({ fila, marca, endpoint, idField, onCambio, variante }) {
  const { notify } = useUI();
  const [imagen, setImagen] = useState(fila?.imagen || null);
  const [trabajando, setTrabajando] = useState(false);
  const id = fila?.[idField];
  if (!id) return <div className="field-hint">Guarda el registro primero; después podrás agregar su imagen desde Editar.</div>;

  async function subir(archivo) {
    if (!archivo) return;
    const fd = new FormData();
    fd.append("archivo", archivo);
    setTrabajando(true);
    try {
      const r = await api.postForm(`${endpoint}/${id}/imagen`, fd);
      setImagen(r.imagen); onCambio(id, r.imagen);
      notify("Foto actualizada.", "success");
    } catch (err) { notify(err.message, "error"); } finally { setTrabajando(false); }
  }
  async function quitar() {
    setTrabajando(true);
    try {
      await api.del(`${endpoint}/${id}/imagen`);
      setImagen(null); onCambio(id, null);
      notify("Se usará la imagen sugerida.", "success");
    } catch (err) { notify(err.message, "error"); } finally { setTrabajando(false); }
  }
  return (
    <div className="cat-campo-foto">
      {variante === "marca"
        ? <ImagenMarca marca={fila.nombre_marca} imagen={imagen} size={120} />
        : <ImagenModelo marca={marca} modelo={fila.nombre_modelo} imagen={imagen} size={120} />}
      <div className="cat-campo-foto-acc">
        <label className="btn btn-secondary btn-sm cat-foto-btn">
          {trabajando ? "Subiendo…" : imagen ? "📷 Cambiar foto" : "📷 Subir foto"}
          <input type="file" accept="image/*" hidden disabled={trabajando} onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {imagen && <button type="button" className="btn btn-secondary btn-sm" disabled={trabajando} onClick={quitar}>Quitar mi foto</button>}
        <div className="field-hint">{imagen ? "Esta es tu foto propia." : "Se muestra una imagen sugerida de internet (puede faltar). Sube la tuya para reemplazarla."}</div>
      </div>
    </div>
  );
}

export default function Catalogos({ admin = false }) {
  const ruta = (ep) => (admin ? "/superadmin/catalogos" : "") + ep;
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
  const [vista, setVista] = useState("lista");
  const listaRef = useRef(null);
  const [verImagen, setVerImagen] = useState(null);
  const [mostrarSubir, setMostrarSubir] = useState(false);

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
    Promise.allSettled(CLAVES.map((k) => api.get(ruta(CATALOGS[k].endpoint) + "/"))).then((res) => {
      const c = {};
      res.forEach((r, i) => { if (r.status === "fulfilled") c[CLAVES[i]] = r.value.length; });
      setConteos(c);
    });
  }, []);

  // Si se cambia de catálogo antes de que termine de llegar la respuesta
  // anterior, esa respuesta vieja puede llegar después y pisar los datos
  // nuevos con un "nombreField" que ya no corresponde (texto en blanco).
  // sigueVigente() evita aplicar una respuesta de un catálogo que ya no es
  // el que está en pantalla.
  async function load(sigueVigente = () => true) {
    setLoading(true);
    try {
      const depData = {};
      for (const name of config.deps || []) {
        depData[name] = await api.get(ruta(CATALOGS[name].endpoint) + "/");
      }
      if (!sigueVigente()) return;
      setDeps(depData);
      const datos = await api.get(ruta(config.endpoint) + "/");
      if (!sigueVigente()) return;
      setRows(datos);
      setConteos((c) => ({ ...c, [tab]: datos.length }));
    } catch (err) {
      if (sigueVigente()) notify(err.message, "error");
    } finally {
      if (sigueVigente()) setLoading(false);
    }
  }

  useEffect(() => {
    let vigente = true;
    setBusqueda("");
    setFiltroPadre("");
    setNuevoNombre("");
    setVista(CATALOGS[tab].logo || CATALOGS[tab].logoRefaccion || CATALOGS[tab].colorRef ? "cuadro" : "lista");
    load(() => vigente);
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const fieldsBase = typeof config.fields === "function" ? config.fields(depsSeguros) : config.fields;
  const campoFoto = (extra) => ({
    name: "_foto", label: extra.etiqueta, type: "custom", full: true,
    render: () => (
      <CampoFotoModelo
        key={editing[config.idField] || "nuevo"} fila={editing} endpoint={ruta(config.endpoint)} idField={config.idField}
        variante={extra.variante} marca={extra.marca}
        onCambio={(id, img) => setRows((rs) => rs.map((x) => (x[config.idField] === id ? { ...x, imagen: img } : x)))}
      />
    ),
  });
  const fields = !editing ? fieldsBase
    : config.logoPadre ? [...fieldsBase, campoFoto({ etiqueta: "Foto del modelo", variante: "modelo", marca: (depsSeguros.marcasVehiculos || []).find((m) => m.id_marca_vehiculo === editing.id_marca_vehiculo)?.nombre_marca || "" })]
    : config.logoRefaccion ? [...fieldsBase, campoFoto({ etiqueta: "Logo de la marca", variante: "marca" })]
    : fieldsBase;
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
      await api.put(`${ruta(config.endpoint)}/${editing[config.idField]}`, values);
      notify("Registro actualizado.", "success");
    } else {
      await api.post(`${ruta(config.endpoint)}/`, values);
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
      await api.post(`${ruta(config.endpoint)}/`, payload);
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
    const ok = await confirmDialog(`¿Eliminar "${row[config.nombreField]}" de ${config.label}?`, { danger: true, confirmar: "Sí, eliminar" });
    if (!ok) return;
    try {
      await api.del(`${ruta(config.endpoint)}/${row[config.idField]}`);
      load();
      notify("Registro eliminado.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <>
      {!admin && <div className="page-header">
        <div className="page-header-titulo">
          <div>
            <h1><IconoModulo ruta="/catalogos" /> Catálogos generales</h1>
            <div className="subtitle">
              Listas usadas en clientes, vehículos y refacciones
              {!puedeEditar && <span className="role-badge">Solo lectura</span>}
            </div>
          </div>
        </div>
      </div>}

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
            <div className="cat-vista" role="group" aria-label="Vista">
              <button type="button" className={vista === "lista" ? "on" : ""} onClick={() => setVista("lista")} title="Vista de lista">☰ Lista</button>
              <button type="button" className={vista === "cuadro" ? "on" : ""} onClick={() => setVista("cuadro")} title="Vista en cuadro">▦ Cuadro</button>
            </div>
            {config.padre && (
              <select value={filtroPadre} onChange={(e) => setFiltroPadre(e.target.value)}>
                <option value="">{config.padre.label === "Marca" ? "Todas las" : "Todos los"} {config.padre.plural}</option>
                {[...padres]
                  .sort((a, b) => String(a[config.padre.nombre]).localeCompare(String(b[config.padre.nombre]), "es"))
                  .map((p) => <option key={p[config.padre.idField]} value={p[config.padre.idField]}>{p[config.padre.nombre]}</option>)}
              </select>
            )}
          </div>

          <div className="modulo-card cat-modulo" style={acentoDe(indice)}>
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

            <div className="cat-lista" ref={listaRef} onScroll={(e) => setMostrarSubir(e.currentTarget.scrollTop > 160)}>
              {loading ? (
                <div className="loading-text">Cargando…</div>
              ) : filtradas.length === 0 ? (
                <div className="empty-state">{rows.length ? "Ningún registro coincide con la búsqueda." : "Sin registros en este catálogo."}</div>
              ) : vista === "cuadro" ? (
                <div className="cat-cuadro">
                  {filtradas.map((r) => (
                    <div className="cat-marca" key={r[config.idField]}>
                      <div className="cat-marca-logo">{config.logo ? <LogoMarca nombre={r[config.nombreField]} /> : config.logoPadre ? <ImagenModelo marca={nombrePadre(r)} modelo={r[config.nombreField]} imagen={r.imagen} size={84} onAbrir={setVerImagen} /> : config.logoRefaccion ? <ImagenMarca marca={r[config.nombreField]} imagen={r.imagen} size={84} onAbrir={setVerImagen} /> : config.colorRef ? <ColorAuto nombre={r[config.nombreField]} hex={r.codigo_hex} size={84} /> : <span className="cat-marca-inicial">{String(r[config.nombreField] || "?").trim().charAt(0).toUpperCase()}</span>}</div>
                      <div className="cat-marca-nombre" title={r[config.nombreField]}>{r[config.nombreField]}</div>
                      {config.padre && <div className="cat-marca-sub">{nombrePadre(r)}</div>}
                      {(puedeEditar || puedeEliminar) && (
                        <div className="cat-marca-acc">
                          {puedeEditar && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(r)}>Editar</button>}
                          {puedeEliminar && <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>Eliminar</button>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                filtradas.map((r) => (
                  <div className="cat-item" key={r[config.idField]}>
                    {config.logo || config.logoPadre || config.logoRefaccion || config.colorRef ? <span className={"cat-item-logo" + (config.logoPadre ? " modelo" : "")}>{config.logoPadre ? <ImagenModelo size={34} marca={nombrePadre(r)} modelo={r[config.nombreField]} imagen={r.imagen} onAbrir={setVerImagen} /> : config.logoRefaccion ? <ImagenMarca size={34} marca={r[config.nombreField]} imagen={r.imagen} onAbrir={setVerImagen} /> : config.colorRef ? <ColorAuto size={34} nombre={r[config.nombreField]} hex={r.codigo_hex} /> : <LogoMarca size={26} nombre={r[config.nombreField]} />}</span> : <span className="cat-item-punto" />}
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
              {mostrarSubir && (
                <button type="button" className="cat-subir" title="Volver arriba" aria-label="Volver arriba" onClick={() => listaRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>↑ Subir</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {verImagen && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setVerImagen(null)}>
            <div className="cat-visor" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={() => setVerImagen(null)}><Icono nombre="close" size={20} /></button>
              <img src={verImagen.url} alt={verImagen.titulo} onError={(e) => { if (e.currentTarget.src !== verImagen.respaldo) e.currentTarget.src = verImagen.respaldo; }} />
              <div className="cat-visor-titulo">{verImagen.titulo}</div>
            </div>
          </div>
        </ModalPortal>
      )}

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
