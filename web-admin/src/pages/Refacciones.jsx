import { IconoAuto } from "../components/Icono";
import { useEffect, useState, useRef } from "react";
import { api } from "../api";
import { Icono } from "../components/Icono";
import LogoMarca from "../components/LogoMarca";
import "./refacciones.css";
import Combo, { opMarca } from "../components/Combo";
import FiltroChips, { colorGrupo as colorCategoria } from "../components/FiltroChips";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import IconoModulo from "../components/IconoModulo";

// Dato que se edita con un toque: texto, número o lista
function Editable({ valor, mostrar, tipo = "text", opciones, puede, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  if (!puede) return <>{mostrar}</>;
  const abrir = () => { setBorrador(valor ?? ""); setEditando(true); };
  const guardar = (nuevo) => {
    setEditando(false);
    if (String(nuevo ?? "") !== String(valor ?? "")) onGuardar(nuevo);
  };
  if (editando) {
    if (opciones) {
      return (
        <select className="inline-input" autoFocus value={borrador} onChange={(e) => guardar(e.target.value)} onBlur={() => setEditando(false)}>
          <option value="">— Ninguna —</option>
          {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <input
        className="inline-input" autoFocus type={tipo} value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={() => guardar(borrador)}
        onKeyDown={(e) => { if (e.key === "Enter") guardar(borrador); if (e.key === "Escape") setEditando(false); }}
      />
    );
  }
  return (
    <span className="inline-ed" role="button" tabIndex={0} title="Toca para cambiar" onClick={abrir} onKeyDown={(e) => e.key === "Enter" && abrir()}>
      {mostrar}<span className="inline-ed-lapiz"><Icono nombre="pencil" size={13} /></span>
    </span>
  );
}

export default function Refacciones() {
  const { confirmDialog, notify } = useUI();
  const { hasPermission } = useAuth();
  const [refacciones, setRefacciones] = useState([]);
  const [categoriasRefaccion, setCategoriasRefaccion] = useState([]);
  const [marcasVehiculo, setMarcasVehiculo] = useState([]);
  const [modelosVehiculo, setModelosVehiculo] = useState([]);
  const [q, setQ] = useState("");
  const [vista, setVista] = useState(() => localStorage.getItem("sm_refacciones_vista") || "lista"); // lista | cuadros
  useEffect(() => { localStorage.setItem("sm_refacciones_vista", vista); }, [vista]);  // se recuerda la vista elegida
  const [editing, setEditing] = useState(null);
  const [compatNueva, setCompatNueva] = useState({ id_marca_vehiculo: "", id_modelo_vehiculo: "" });
  const [loading, setLoading] = useState(true);
  const [catSel, setCatSel] = useState([]);
  const PAGINA = 30; // la lista se trae por bloques de 30 al ir bajando
  const [conteoCat, setConteoCat] = useState({});
  const [totalGeneral, setTotalGeneral] = useState(0);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [existentes, setExistentes] = useState([]); // lista ligera (nombre/categoría) para detectar duplicados al capturar
  const centinela = useRef(null);
  const cuantos = useRef(0);
  const qRef = useRef("");
  const catRef = useRef([]);
  const peticion = useRef(0); // descarta respuestas viejas
  const filtro = () => {
    const p = new URLSearchParams();
    if (qRef.current) p.set("q", qRef.current);
    if (catRef.current.length) p.set("categorias", catRef.current.join("|"));
    return p.toString();
  };
  const totalVisible = catSel.length ? catSel.reduce((a, n) => a + (conteoCat[n] || 0), 0) : totalGeneral;

  // Solo la lista depende de la búsqueda: con cada letra se pide únicamente ella
  async function cargarLista() {
    const limite = Math.min(2000, Math.max(PAGINA, cuantos.current));
    const mia = ++peticion.current;
    try {
      const r = await api.get(`/refacciones/?${filtro()}&limite=${limite}`);
      if (mia !== peticion.current) return;
      cuantos.current = r.length;
      setRefacciones(r);
    } catch (err) {
      if (mia === peticion.current) notify(err.message || "No se pudieron cargar las refacciones.", "error");
    }
    setLoading(false);
  }
  async function cargarResumen() {
    try {
      const p = new URLSearchParams();
      if (qRef.current) p.set("q", qRef.current);
      const r = await api.get(`/refacciones/resumen-categorias?${p}`);
      setConteoCat(r.categorias || {});
      setTotalGeneral(r.total || 0);
    } catch { /* los chips quedan como estaban */ }
  }
  function load() { return Promise.all([cargarLista(), cargarResumen()]); }
  async function cargarMas() {
    if (cargandoMas || refacciones.length >= totalVisible) return;
    setCargandoMas(true);
    try {
      const mas = await api.get(`/refacciones/?${filtro()}&limite=${PAGINA}&offset=${refacciones.length}`);
      cuantos.current = refacciones.length + mas.length;
      setRefacciones((prev) => [...prev, ...mas.filter((m) => !prev.some((p) => p.id_refaccion === m.id_refaccion))]);
    } finally { setCargandoMas(false); }
  }
  useEffect(() => {
    const el = centinela.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting) cargarMas(); }, { rootMargin: "300px" });
    obs.observe(el);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  });
  // La lista ligera solo se necesita con el formulario abierto
  useEffect(() => {
    if (!editing) return;
    api.get("/refacciones/ligero").then(setExistentes).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!editing]);
  // Los catálogos se piden una sola vez y en paralelo con la lista (sin bloquearla)
  async function cargarCatalogos() {
    // Las marcas de refacción no se usan en esta pantalla: no se piden.
    setCategoriasRefaccion(await api.get("/refacciones-categorias/"));
  }
  useEffect(() => { cargarCatalogos().catch(() => {}); }, []);

  // Marcas/modelos de vehículo solo sirven para la sección "Compatible con" de una refacción ya guardada:
  // se piden al abrirla (una vez), no al entrar a la pantalla. Los proveedores no se usaban aquí.
  const vehiculosPedidos = useRef(false);
  useEffect(() => {
    if (!editing?.id_refaccion || vehiculosPedidos.current) return;
    vehiculosPedidos.current = true;
    Promise.all([api.get("/vehiculos-marcas/"), api.get("/vehiculos-modelos/")])
      .then(([mv, mo]) => { setMarcasVehiculo(mv); setModelosVehiculo(mo); })
      .catch(() => { vehiculosPedidos.current = false; });
  }, [editing]);

  useEffect(() => {
    qRef.current = q.trim();
    catRef.current = catSel;
    cuantos.current = 0; // al cambiar búsqueda o categorías se vuelve al primer bloque
    const t = setTimeout(cargarLista, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, catSel]);
  useEffect(() => {
    const t = setTimeout(cargarResumen, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useActualizacionGlobal("refacciones", load);

  function fields(values) {
    return [
      { name: "nombre_refaccion", label: "Nombre", required: true, full: true, grupo: "general" },
      { name: "preciocliente_refaccion", label: "Precio", type: "number", grupo: "general", full: true },
      {
        name: "__id_categoria", label: "Categoría", type: "select", required: true, grupo: "general", full: true, grande: true,
        options: categoriasRefaccion.map((c) => ({ value: c.id_categoria_refaccion, label: c.nombre_categoria })),
        creatable: hasPermission("catalogos.crear")
          ? {
              endpoint: "/refacciones-categorias/", createField: "nombre_categoria", idField: "id_categoria_refaccion", label: "categoría",
              onCreated: (nueva) => setCategoriasRefaccion((prev) => [...prev, nueva]),
            }
          : null,
      },
    ];
  }

  const gruposRefaccion = {
    general: { icono: "⚙️", titulo: "Datos generales" },
  };

  // Al elegir una categoría se muestran las refacciones que ya existen en ella
  function bloqueExistentes(values) {
    const cat = categoriasRefaccion.find((c) => String(c.id_categoria_refaccion) === String(values.__id_categoria ?? ""));
    const lista = cat ? existentes.filter((r) => r.categoria === cat.nombre_categoria && r.id_refaccion !== editing?.id_refaccion) : [];
    return {
      icono: "📋", acento: "acento-teal",
      titulo: cat ? `Ya existen en ${cat.nombre_categoria}` : "Refacciones existentes",
      contenido: !cat ? (
        <div className="existentes-vacio">Elige una categoría para ver las refacciones que ya tienes en ella.</div>
      ) : lista.length === 0 ? (
        <div className="existentes-vacio">Aún no hay refacciones en esta categoría.</div>
      ) : (
        <ul className="existentes-lista">
          {lista.map((r) => <li key={r.id_refaccion}>{r.nombre_refaccion}</li>)}
        </ul>
      ),
    };
  }

  const recienAgregadas = useRef(new Set());

  async function handleSave(values, opciones = {}) {
    const { __id_categoria, ...capturados } = values;
    // No se permite repetir un nombre en la misma categoría (sin importar mayúsculas ni acentos)
    const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const nombreCat = __id_categoria ? categoriasRefaccion.find((c) => c.id_categoria_refaccion === Number(__id_categoria))?.nombre_categoria || null : null;
    const clave = `${norm(nombreCat)}|${norm(capturados.nombre_refaccion)}`;
    const ligeras = await api.get("/refacciones/ligero").catch(() => existentes);
    const yaEsta = ligeras.some((r) => r.id_refaccion !== editing?.id_refaccion && `${norm(r.categoria)}|${norm(r.nombre_refaccion)}` === clave)
      || (!editing?.id_refaccion && recienAgregadas.current.has(clave));
    if (yaEsta) throw new Error(`"${capturados.nombre_refaccion}" ya existe${nombreCat ? ` en ${nombreCat}` : ""}.`);
    // Mismo nombre en OTRA categoría: se avisa para evitar duplicados
    const enOtras = [...new Set(ligeras
      .filter((r) => r.id_refaccion !== editing?.id_refaccion && norm(r.nombre_refaccion) === norm(capturados.nombre_refaccion) && norm(r.categoria) !== norm(nombreCat))
      .map((r) => r.categoria || "Sin categoría"))];
    if (enOtras.length) {
      const ok = await confirmDialog(`"${capturados.nombre_refaccion}" ya está registrada en ${enOtras.join(", ")}. ¿La agregas también en ${nombreCat || "esta categoría"}?`, { title: "Ya existe en otra categoría", confirmar: "Sí, agregar" });
      if (!ok) throw new Error(`No se guardó: "${capturados.nombre_refaccion}" ya existe en ${enOtras.join(", ")}.`);
    }
    // Los datos de stock, precios y proveedor viven en Inventario: al editar se conservan tal cual
    const precio = Math.max(0, parseFloat(capturados.preciocliente_refaccion) || 0);
    const datos = editing?.id_refaccion ? { ...baseDe(editing), nombre_refaccion: capturados.nombre_refaccion, preciocliente_refaccion: precio } : { nombre_refaccion: capturados.nombre_refaccion, preciocliente_refaccion: precio };
    datos.categoria = __id_categoria ? categoriasRefaccion.find((c) => c.id_categoria_refaccion === Number(__id_categoria))?.nombre_categoria || null : null;
    if (editing?.id_refaccion) {
      await api.put(`/refacciones/${editing.id_refaccion}`, datos);
      notify("Refacción actualizada.", "success");
    } else {
      await api.post("/refacciones/", datos);
      recienAgregadas.current.add(clave);
      notify("Refacción creada.", "success");
    }
    // Se muestra la categoría donde quedó la refacción
    catRef.current = [datos.categoria || "Sin categoría"];
    cuantos.current = 0;
    setCatSel(catRef.current);
    if (!opciones.otra) setEditing(null);
    load();
  }

  async function agregarCompatibilidad() {
    if (!compatNueva.id_marca_vehiculo) return;
    try {
      const actualizada = await api.post(`/refacciones/${editing.id_refaccion}/compatibilidades`, {
        id_marca_vehiculo: Number(compatNueva.id_marca_vehiculo),
        id_modelo_vehiculo: compatNueva.id_modelo_vehiculo ? Number(compatNueva.id_modelo_vehiculo) : null,
      });
      setEditing(actualizada);
      setCompatNueva({ id_marca_vehiculo: "", id_modelo_vehiculo: "" });
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function quitarCompatibilidad(idCompatibilidad) {
    try {
      const actualizada = await api.del(`/refacciones/${editing.id_refaccion}/compatibilidades/${idCompatibilidad}`);
      setEditing(actualizada);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  function abrirParaEditar(row) {
    const categoriaEncontrada = categoriasRefaccion.find((c) => c.nombre_categoria === row.categoria);
    setEditing({ ...row, __id_categoria: categoriaEncontrada?.id_categoria_refaccion || "" });
  }

  async function handleDelete(r) {
    const ok = await confirmDialog(`¿Eliminar "${r.nombre_refaccion}" del inventario?`, { danger: true, confirmar: "Sí, eliminar" });
    if (!ok) return;
    try {
      await api.del(`/refacciones/${r.id_refaccion}`);
      load();
      notify("Refacción eliminada.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  // Cambia un solo dato desde la lista (el API pide la refacción completa)
  async function actualizarCampo(r, cambios) {
    const base = baseDe(r);
    try {
      const nueva = await api.put(`/refacciones/${r.id_refaccion}`, { ...base, ...cambios });
      setRefacciones((prev) => prev.map((x) => (x.id_refaccion === r.id_refaccion ? { ...x, ...nueva } : x)));
      notify("Actualizado.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  function baseDe(r) {
    return {
      id_marca_refaccion: r.id_marca_refaccion, id_proveedor: r.id_proveedor, nombre_refaccion: r.nombre_refaccion,
      numero_refaccion: r.numero_refaccion, categoria: r.categoria, subcategoria: r.subcategoria,
      preciopropio_refaccion: r.preciopropio_refaccion, preciocliente_refaccion: r.preciocliente_refaccion,
      cantidad_refaccion: r.cantidad_refaccion, umbral_naranja: r.umbral_naranja, umbral_rojo: r.umbral_rojo,
      posicion: r.posicion, id_marca_vehiculo_compatible: r.id_marca_vehiculo_compatible,
      id_modelo_vehiculo_compatible: r.id_modelo_vehiculo_compatible, sku_interno: r.sku_interno,
      codigo_barras: r.codigo_barras, ubicacion_fisica: r.ubicacion_fisica, zona_abc: r.zona_abc,
      proveedores_ids: (r.proveedores_ids || []).filter((x) => x !== r.id_proveedor),
    };
  }

  const puedeEditar = hasPermission("refacciones.editar");
  const visibles = refacciones; // el servidor ya filtra por búsqueda y categorías

  // Marcas de vehículo compatibles (sin repetir) para mostrar sus logos
  function marcasCompatibles(r) {
    const vistos = new Map();
    for (const c of r.compatibilidades || []) if (c.marca_vehiculo) vistos.set(c.marca_vehiculo.id_marca_vehiculo, c.marca_vehiculo.nombre_marca);
    if (r.marca_vehiculo_compatible) vistos.set(r.marca_vehiculo_compatible.id_marca_vehiculo, r.marca_vehiculo_compatible.nombre_marca);
    return [...vistos.values()];
  }
  function LogosCompatibles({ r }) {
    const ms = marcasCompatibles(r);
    if (ms.length === 0) return <span style={{ color: "var(--ink-500)" }}>—</span>;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {ms.slice(0, 5).map((n) => <span key={n} style={{ background: "#fff", borderRadius: 7, padding: 2, display: "inline-flex" }}><LogoMarca nombre={n} size={24} /></span>)}
        {ms.length > 5 && <small style={{ color: "var(--ink-500)", fontWeight: 700 }}>+{ms.length - 5}</small>}
      </span>
    );
  }

  const fmt = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/refacciones" /> Refacciones</h1>
          <div className="subtitle">Inventario de partes del taller</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="vista-toggle vista-toggle-iconos">
            <button type="button" className={`vista-toggle-btn ${vista === "lista" ? "activo" : ""}`} title="Vista de lista" aria-label="Vista de lista" onClick={() => setVista("lista")}>
              <Icono nombre="list" size={19} />
            </button>
            <button type="button" className={`vista-toggle-btn ${vista === "cuadros" ? "activo" : ""}`} title="Vista de cuadros" aria-label="Vista de cuadros" onClick={() => setVista("cuadros")}>
              <Icono nombre="grid" size={19} />
            </button>
          </div>
          {hasPermission("refacciones.crear") && <button className="btn btn-primary btn-nuevo" onClick={() => setEditing({})}><span className="btn-nuevo-icono"><Icono nombre="cube" size={22} /><span className="btn-nuevo-mas">+</span></span>Nueva refacción</button>}
        </div>
      </div>

      <div className="panel ref-pagina">
        <div className="toolbar">
          <input className="search-input" placeholder="Buscar por nombre o número de parte…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <FiltroChips multiple items={conteoCat} valor={catSel} onChange={setCatSel} total={totalGeneral} />

        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : visibles.length === 0 ? (
          <div className="empty-state">No hay refacciones registradas.</div>
        ) : vista === "cuadros" ? (
          <div className="veh-cuadros" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {visibles.map((r) => {
              const cat = r.categoria || "Sin categoría";
              const col = colorCategoria(cat);
              return (
                <div key={r.id_refaccion} className="veh-tarjeta" style={{ "--acc": col }}
                  title={puedeEditar ? "Clic para editar la refacción" : undefined}
                  onClick={() => puedeEditar && abrirParaEditar(r)}>
                  <div className="veh-tarjeta-cuerpo">
                    <div className="veh-tarjeta-titulo refaccion-nombre">{r.nombre_refaccion}</div>
                    <div className="veh-tarjeta-meta">
                      <span className="ref-parte"><Icono nombre="hash" size={14} /> {r.numero_refaccion || "Sin n.º de parte"}</span>
                      <span><span className="cat-pill" style={{ "--c": col }}>{cat}</span></span>
                      <span className="ref-precio">{fmt(r.preciocliente_refaccion)}</span>
                      <span><LogosCompatibles r={r} /></span>
                    </div>
                    <div className="veh-tarjeta-pie">
                      {/* stopPropagation: los botones no deben disparar también el clic de la tarjeta */}
                      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        {puedeEditar && (
                          <button className="btn-icono" title="Editar" aria-label="Editar" onClick={() => abrirParaEditar(r)}><Icono nombre="pencil" size={18} /></button>
                        )}
                        {hasPermission("refacciones.eliminar") && (
                          <button className="btn-icono btn-icono-peligro" title="Eliminar" aria-label="Eliminar" onClick={() => handleDelete(r)}><Icono nombre="trash" size={18} /></button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ordenes-lista">
            {visibles.map((r) => {
              const cat = r.categoria || "Sin categoría";
              const col = colorCategoria(cat);
              return (
                <div key={r.id_refaccion} className="orden-fila fila-tabla" style={{ "--acc": col, cursor: puedeEditar ? "pointer" : undefined }} title={puedeEditar ? "Clic para editar la refacción" : undefined} onClick={() => puedeEditar && abrirParaEditar(r)}>
                  <div className="orden-main">
                    <div className="orden-titulo refaccion-nombre">{r.nombre_refaccion}</div>
                    <div className="fila-datos">
                      <div className="fila-dato"><span className="fila-dato-etq">N.º de parte</span><span className="fila-dato-val">{r.numero_refaccion || "—"}</span></div>
                      <div className="fila-dato"><span className="fila-dato-etq">Categoría</span><span className="fila-dato-val"><span className="cat-pill" style={{ "--c": col }}>{cat}</span></span></div>
                      <div className="fila-dato"><span className="fila-dato-etq">Precio</span><span className="fila-dato-val">{fmt(r.preciocliente_refaccion)}</span></div>
                      <div className="fila-dato"><span className="fila-dato-etq">Compatible con</span><span className="fila-dato-val" style={{ overflow: "visible", maxWidth: "none" }}><LogosCompatibles r={r} /></span></div>
                    </div>
                  </div>
                  <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        {puedeEditar && (
                          <button className="btn-icono" title="Editar todo" aria-label="Editar" onClick={() => abrirParaEditar(r)}><Icono nombre="pencil" size={18} /></button>
                        )}
                        {hasPermission("refacciones.eliminar") && (
                          <button className="btn-icono btn-icono-peligro" title="Eliminar" aria-label="Eliminar" onClick={() => handleDelete(r)}><Icono nombre="trash" size={18} /></button>
                        )}
                      </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && refacciones.length > 0 && (
          <div ref={centinela} style={{ textAlign: "center", padding: 10, fontSize: 12, opacity: .65 }}>
            {refacciones.length < totalVisible ? (cargandoMas ? "Cargando más…" : <button type="button" className="btn btn-secondary btn-sm" onClick={cargarMas}>Mostrar más ({totalVisible - refacciones.length} restantes)</button>) : ""}
          </div>
        )}
      </div>

      {editing && (
        <FormModal
          title={editing.id_refaccion ? "Editar refacción" : "Nueva refacción"}
          icono="⚙️"
          subtitulo="Datos de la refacción, proveedor y stock."
          fields={fields}
          grupos={gruposRefaccion}
          bloqueExtra={bloqueExistentes}
          permitirOtra={!editing.id_refaccion}
          initialValues={editing}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
          footerExtra={
            editing.id_refaccion ? (
              <div className="field full" style={{ marginTop: 4 }}>
                <label>Compatible con (marca / modelo) — puedes agregar varios</label>
                {(editing.compatibilidades || []).length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {editing.compatibilidades.map((c) => (
                      <div key={c.id_compatibilidad} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--ink-300)" }}>
                        <span style={{ fontSize: 13.5 }}>{c.marca_vehiculo?.nombre_marca} {c.modelo_vehiculo?.nombre_modelo || ""}</span>
                        <button type="button" title="Quitar" className="link-quitar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--red-600)" }} onClick={() => quitarCompatibilidad(c.id_compatibilidad)}><IconoAuto valor="🗑️" size={18} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Combo placeholder="-- Marca --" value={compatNueva.id_marca_vehiculo}
                      onChange={(v) => setCompatNueva({ id_marca_vehiculo: v == null ? "" : String(v), id_modelo_vehiculo: "" })}
                      opciones={[{ value: "", label: "-- Marca --" }, ...marcasVehiculo.map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca, ...opMarca(m) }))]} />
                  </div>
                  <select style={{ flex: 1 }} value={compatNueva.id_modelo_vehiculo} disabled={!compatNueva.id_marca_vehiculo} onChange={(e) => setCompatNueva({ ...compatNueva, id_modelo_vehiculo: e.target.value })}>
                    <option value="">-- Modelo (opcional) --</option>
                    {modelosVehiculo.filter((mo) => mo.id_marca_vehiculo === Number(compatNueva.id_marca_vehiculo)).map((mo) => <option key={mo.id_modelo_vehiculo} value={mo.id_modelo_vehiculo}>{mo.nombre_modelo}</option>)}
                  </select>
                  <button type="button" className="btn btn-agregar" onClick={agregarCompatibilidad}><Icono nombre="add" size={18} /> Agregar</button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 4 }}>
                Guarda la refacción primero — después podrás agregar aquí mismo las marcas/modelos con los que es compatible.
              </div>
            )
          }
        />
      )}
    </>
  );
}
