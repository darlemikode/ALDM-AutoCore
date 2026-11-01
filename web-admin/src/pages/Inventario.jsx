import { contiene, norm } from "../lib/texto";
import { IconoAuto } from "../components/Icono";
import { useEffect, useState } from "react";
import { api } from "../api";
import Combo, { opMarca } from "../components/Combo";
import DataTable from "../components/DataTable";
import FiltroChips, { colorGrupo, contarPor } from "../components/FiltroChips";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";
import FotoGaleria from "../components/FotoGaleria";
import ModalPortal from "../components/ModalPortal";
import PuntoVenta from "../components/inventario/PuntoVenta";
import VentasMostrador from "../components/inventario/VentasMostrador";
import Etiquetas from "../components/inventario/Etiquetas";
import EntradaMercancia from "../components/inventario/EntradaMercancia";
import { ubicacionTexto } from "../components/inventario/pdf";

/**
 * Inventario — cada renglón es un registro de stock/precio para una
 * refacción del catálogo (Refaccion), con su marca de refacción y
 * proveedor. La compatibilidad de vehículo (una o varias marca+modelo)
 * se administra aparte, dentro del mismo modal, una vez guardado el
 * registro por primera vez — igual que las compatibilidades en
 * Refacciones.
 */
export default function Inventario() {
  const { notify, confirmDialog } = useUI();
  const { hasPermission } = useAuth();
  const [filas, setFilas] = useState([]);
  const [refacciones, setRefacciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [marcasRefaccion, setMarcasRefaccion] = useState([]);
  const [marcasVehiculo, setMarcasVehiculo] = useState([]);
  const [modelosVehiculo, setModelosVehiculo] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [editing, setEditing] = useState(null);
  const [compatNueva, setCompatNueva] = useState({ id_marca_vehiculo: "", id_modelo_vehiculo: "" });
  const [compatibilidadesNuevas, setCompatibilidadesNuevas] = useState([]); // buffer local, solo mientras se está CREANDO (aún no existe id_inventario_refaccion)
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [fMarca, setFMarca] = useState("");
  const [fModelo, setFModelo] = useState("");
  const [fRefaccion, setFRefaccion] = useState("");
  const [soloBajoStock, setSoloBajoStock] = useState(false);
  const [vista, setVista] = useState("cuadros"); // cuadros | lista
  const [fotos, setFotos] = useState({}); // { id_inventario_refaccion: ruta de su foto más reciente }
  const [fotosDe, setFotosDe] = useState(null); // registro cuyas fotos se están viendo
  const [pestana, setPestana] = useState("existencias"); // existencias | venta | entrada | ventas | etiquetas
  const [etiquetaDe, setEtiquetaDe] = useState(null); // id a preseleccionar en Etiquetas
  const [ventasVersion, setVentasVersion] = useState(0);

  async function load() {
    const [inv, refs, cat, marcasRef, marcasVeh, modelosVeh, provs] = await Promise.all([
      api.get("/inventario-refacciones/"),
      api.get("/refacciones/"),
      api.get("/refacciones-categorias/"),
      api.get("/refacciones-marcas/"),
      api.get("/vehiculos-marcas/"),
      api.get("/vehiculos-modelos/"),
      api.get("/proveedores/"),
    ]);
    setFilas(inv);
    setRefacciones(refs);
    setCategorias(cat);
    setMarcasRefaccion(marcasRef);
    setMarcasVehiculo(marcasVeh);
    setModelosVehiculo(modelosVeh);
    setProveedores(provs);
    setLoading(false);
    cargarFotos();
  }

  async function cargarFotos() {
    try { setFotos(await api.get("/fotos/principales?entidad_tipo=inventario")); } catch { /* sin fotos no pasa nada */ }
  }

  useEffect(() => { load(); }, []);

  function estaBajoStock(r) {
    return r.cantidad <= (r.umbral_rojo ?? 1);
  }
  // Estado del stock para la etiqueta de la tarjeta
  function estadoStock(r) {
    if ((r.cantidad || 0) <= 0) return { texto: "Agotado", clase: "badge-red" };
    if (estaBajoStock(r)) return { texto: "Stock crítico", clase: "badge-red" };
    if (r.cantidad <= (r.umbral_naranja ?? 4)) return { texto: "Stock bajo", clase: "badge-amber" };
    return { texto: "En stock", clase: "badge-teal" };
  }
  const dinero = (n) => (n ? `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—");

  const filasFiltradas = filas.filter((r) => {
    const coincideTexto = !q.trim() || contiene(`${r.refaccion?.nombre_refaccion || ""} ${r.marca_refaccion?.nombre_marca || ""} ${r.codigo_barras || ""} ${r.numero_parte || ""} ${ubicacionTexto(r)}`, q);
    const coincideCategoria = !filtroCategoria || (r.refaccion?.categoria || "Sin categoría") === filtroCategoria;
    const coincideRefaccion = !fRefaccion || String(r.id_refaccion) === fRefaccion;
    const coincideVehiculo = (!fMarca && !fModelo) || (r.compatibilidades || []).some((c) =>
      (!fMarca || String(c.id_marca_vehiculo) === fMarca) && (!fModelo || !c.id_modelo_vehiculo || String(c.id_modelo_vehiculo) === fModelo));
    const coincideStock = !soloBajoStock || (r.cantidad || 0) <= (r.umbral_naranja ?? 4);
    return coincideTexto && coincideCategoria && coincideRefaccion && coincideVehiculo && coincideStock;
  });
  // Agrupadas por categoría — igual que el modal de "Agregar refacciones"
  // en la orden, para que ambas pantallas se vean y se naveguen igual.
  const gruposPorCategoria = {};
  filasFiltradas.forEach((r) => {
    const clave = r.refaccion?.categoria || "Sin categoría";
    if (!gruposPorCategoria[clave]) gruposPorCategoria[clave] = [];
    gruposPorCategoria[clave].push(r);
  });
  const categoriasOrdenadas = Object.keys(gruposPorCategoria).sort((a, b) => (a === "Sin categoría" ? 1 : b === "Sin categoría" ? -1 : a.localeCompare(b)));
  const categoriasDisponibles = [...new Set(filas.map((r) => r.refaccion?.categoria || "Sin categoría"))].sort();

  async function guardar(values) {
    const datos = {
      id_refaccion: Number(values.id_refaccion),
      id_marca_refaccion: values.id_marca_refaccion ? Number(values.id_marca_refaccion) : null,
      id_proveedor: values.id_proveedor ? Number(values.id_proveedor) : null,
      numero_parte: values.numero_parte || null,
      ubicacion_fisica: values.ubicacion_fisica || null,
      almacen: values.almacen || null,
      pasillo: values.pasillo || null,
      estanteria: values.estanteria || null,
      nivel: values.nivel || null,
      posicion: values.posicion || null,
      codigo_barras: (values.codigo_barras || "").trim() || null,
      unidad: values.unidad || "pza",
      cantidad: Number(values.cantidad) || 0,
      preciopropio: Number(values.preciopropio) || 0,
      preciocliente: Number(values.preciocliente) || 0,
      umbral_naranja: Number(values.umbral_naranja) || 4,
      umbral_rojo: Number(values.umbral_rojo) || 1,
    };
    try {
      if (editing?.id_inventario_refaccion) {
        await api.put(`/inventario-refacciones/${editing.id_inventario_refaccion}`, datos);
        notify("Registro de inventario actualizado.", "success");
        setEditing(null);
        load();
      } else {
        let nuevo = await api.post("/inventario-refacciones/", datos);
        // Todo producto nuevo queda con código de barras (el que se escaneó o uno interno)
        if (!nuevo.codigo_barras) {
          try { nuevo = await api.post(`/inventario/${nuevo.id_inventario_refaccion}/generar-codigo`, {}); } catch { /* se puede asignar después */ }
        }
        // Las compatibilidades que se hayan ido agregando ANTES de guardar
        // (el registro todavía no existía) se crean todas aquí, de un
        // jalón, ya con el id real.
        for (const c of compatibilidadesNuevas) {
          await api.post("/inventario-refacciones-compatibilidades/", {
            id_inventario_refaccion: nuevo.id_inventario_refaccion,
            id_marca_vehiculo: c.id_marca_vehiculo,
            id_modelo_vehiculo: c.id_modelo_vehiculo,
          });
        }
        setCompatibilidadesNuevas([]);
        notify("Refacción agregada al inventario.", "success");
        setEditing(null);
        load();
      }
    } catch (err) {
      notify(err.message, "error");
      throw err; // FormModal necesita que el error se le devuelva, si no, el botón se queda pegado en "Guardando..." para siempre
    }
  }

  function agregarCompatibilidadLocal() {
    if (!compatNueva.id_marca_vehiculo) return;
    setCompatibilidadesNuevas((prev) => [...prev, {
      tempId: Date.now(),
      id_marca_vehiculo: Number(compatNueva.id_marca_vehiculo),
      id_modelo_vehiculo: compatNueva.id_modelo_vehiculo ? Number(compatNueva.id_modelo_vehiculo) : null,
    }]);
    setCompatNueva({ id_marca_vehiculo: "", id_modelo_vehiculo: "" });
  }
  function quitarCompatibilidadLocal(tempId) {
    setCompatibilidadesNuevas((prev) => prev.filter((c) => c.tempId !== tempId));
  }

  async function agregarCompatibilidad() {
    // El registro ya existe (se está editando uno guardado) — se aplica
    // de inmediato contra el backend.
    if (!compatNueva.id_marca_vehiculo) return;
    try {
      await api.post("/inventario-refacciones-compatibilidades/", {
        id_inventario_refaccion: editing.id_inventario_refaccion,
        id_marca_vehiculo: Number(compatNueva.id_marca_vehiculo),
        id_modelo_vehiculo: compatNueva.id_modelo_vehiculo ? Number(compatNueva.id_modelo_vehiculo) : null,
      });
      const actualizado = await api.get(`/inventario-refacciones/${editing.id_inventario_refaccion}`);
      setEditing(actualizado);
      setCompatNueva({ id_marca_vehiculo: "", id_modelo_vehiculo: "" });
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function quitarCompatibilidad(idCompatibilidad) {
    try {
      await api.del(`/inventario-refacciones-compatibilidades/${idCompatibilidad}`);
      const actualizado = await api.get(`/inventario-refacciones/${editing.id_inventario_refaccion}`);
      setEditing(actualizado);
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function eliminar(r) {
    const ok = await confirmDialog(
      `¿Eliminar el registro de inventario de "${r.refaccion?.nombre_refaccion}"?`,
      { danger: true, confirmar: "Sí, eliminar" }
    );
    if (!ok) return;
    try {
      await api.del(`/inventario-refacciones/${r.id_inventario_refaccion}`);
      load();
      notify("Eliminado.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const columns = [
    { key: "refaccion", label: "Refacción", render: (r) => r.refaccion?.nombre_refaccion || "—" },
    { key: "marca", label: "Marca", render: (r) => r.marca_refaccion?.nombre_marca || "—" },
    { key: "compatibilidad", label: "Compatible con", render: (r) =>
      r.compatibilidades?.length
        ? r.compatibilidades.map((c) => `${c.marca_vehiculo?.nombre_marca || ""} ${c.modelo_vehiculo?.nombre_modelo || ""}`.trim()).join(", ")
        : "— (agrega compatibilidad al editar)"
    },
    { key: "cantidad", label: "Stock", render: (r) => (
      <span style={{ color: estaBajoStock(r) ? "var(--red-600)" : undefined, fontWeight: estaBajoStock(r) ? 700 : undefined }}>{r.cantidad}</span>
    ) },
    { key: "preciocliente", label: "Precio venta", render: (r) => r.preciocliente ? `$${r.preciocliente.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "—" },
    { key: "codigo_barras", label: "Código", render: (r) => r.codigo_barras || "—" },
    { key: "ubicacion_fisica", label: "Ubicación", render: (r) => ubicacionTexto(r) || "—" },
  ];

  // Bloque de compatibilidad (lado derecho del modal): combos arriba y lista debajo
  function bloqueCompatibilidad() {
    const esEdicion = !!editing?.id_inventario_refaccion;
    const lista = esEdicion ? (editing.compatibilidades || []) : compatibilidadesNuevas;
    const marcaDe = (c) => (esEdicion ? c.marca_vehiculo?.nombre_marca : marcasVehiculo.find((m) => m.id_marca_vehiculo === c.id_marca_vehiculo)?.nombre_marca) || "";
    const modeloDe = (c) => (esEdicion ? c.modelo_vehiculo?.nombre_modelo : modelosVehiculo.find((m) => m.id_modelo_vehiculo === c.id_modelo_vehiculo)?.nombre_modelo) || "";
    return (
      <div className="field full inv-compat">
        <div className="inv-compat-combos">
          <Combo placeholder="-- Marca --" value={compatNueva.id_marca_vehiculo}
            onChange={(v) => setCompatNueva({ id_marca_vehiculo: v == null ? "" : String(v), id_modelo_vehiculo: "" })}
            opciones={[{ value: "", label: "-- Marca --" }, ...marcasVehiculo.map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca, ...opMarca(m) }))]} />
          <select value={compatNueva.id_modelo_vehiculo} disabled={!compatNueva.id_marca_vehiculo} onChange={(e) => setCompatNueva({ ...compatNueva, id_modelo_vehiculo: e.target.value })}>
            <option value="">-- Modelo (opcional) --</option>
            {modelosVehiculo.filter((mo) => mo.id_marca_vehiculo === Number(compatNueva.id_marca_vehiculo)).map((mo) => <option key={mo.id_modelo_vehiculo} value={mo.id_modelo_vehiculo}>{mo.nombre_modelo}</option>)}
          </select>
          <button type="button" className="btn btn-agregar" disabled={!compatNueva.id_marca_vehiculo} onClick={esEdicion ? agregarCompatibilidad : agregarCompatibilidadLocal}><Icono nombre="add" size={18} /> Agregar</button>
        </div>
        <div className="inv-compat-lista">
          {lista.length === 0 ? (
            <div className="inv-compat-vacio">Sin vehículos compatibles. Elige marca y modelo y pulsa Agregar.</div>
          ) : lista.map((c) => (
            <div key={esEdicion ? c.id_compatibilidad : c.tempId} className="inv-compat-fila">
              <Icono nombre="car" size={16} />
              <span><b>{marcaDe(c)}</b> {modeloDe(c) || <i style={{ color: "var(--ink-500)" }}>todos los modelos</i>}</span>
              <button type="button" className="btn-icono btn-icono-peligro" title="Quitar" onClick={() => esEdicion ? quitarCompatibilidad(c.id_compatibilidad) : quitarCompatibilidadLocal(c.tempId)}><Icono nombre="trash" size={16} /></button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function fields() {
    return [
      {
        name: "id_refaccion", label: "Refacción", type: "select", required: true, grupo: "general",
        disabled: !!editing?.id_inventario_refaccion,
        options: refacciones.map((r) => ({ value: r.id_refaccion, label: r.nombre_refaccion })),
      },
      {
        name: "id_marca_refaccion", label: "Marca", type: "select", grupo: "general",
        options: marcasRefaccion.map((m) => ({ value: m.id_marca_refaccion, label: m.nombre_marca, ...opMarca(m) })),
        creatable: hasPermission("catalogos.crear")
          ? { endpoint: "/refacciones-marcas/", createField: "nombre_marca", idField: "id_marca_refaccion", label: "marca", onCreated: (n) => setMarcasRefaccion((prev) => [...prev, n]) }
          : null,
      },
      {
        name: "id_proveedor", label: "Proveedor", type: "select", grupo: "general",
        options: proveedores.map((p) => ({ value: p.id_proveedor, label: p.nombre_proveedor })),
      },
      { name: "numero_parte", label: "Número de parte", grupo: "general" },
      { name: "codigo_barras", label: "Código de barras (escanéalo o déjalo vacío para generar uno)", grupo: "general" },
      { name: "unidad", label: "Unidad (pza, litro, juego…)", grupo: "general" },
      { name: "cantidad", label: "Stock (cantidad)", type: "number", required: true, grupo: "precios" },
      { name: "preciopropio", label: "Costo de compra", type: "number", grupo: "precios" },
      { name: "preciocliente", label: "Precio de venta", type: "number", grupo: "precios" },
      { name: "almacen", label: "Almacén / bodega", grupo: "ubicacion" },
      { name: "pasillo", label: "Pasillo", grupo: "ubicacion" },
      { name: "estanteria", label: "Estantería / rack", grupo: "ubicacion" },
      { name: "nivel", label: "Nivel / repisa", grupo: "ubicacion" },
      { name: "posicion", label: "Posición / caja", grupo: "ubicacion" },
      { name: "ubicacion_fisica", label: "Referencia adicional de ubicación", grupo: "ubicacion" },
      { name: "__compat", label: "", type: "custom", full: true, grupo: "compat", render: () => bloqueCompatibilidad() },
      { name: "umbral_naranja", label: "Alerta amarilla a partir de", type: "number", grupo: "precios" },
      { name: "umbral_rojo", label: "Alerta crítica a partir de", type: "number", grupo: "precios" },
    ];
  }

  // Colocación explícita: datos y ubicación a la izquierda, compatibilidad a la derecha
  const gruposInventario = {
    general: { icono: "📦", titulo: "Datos generales", columna: 1, fila: 1 },
    compat: { icono: "🚗", titulo: "Compatible con (marca / modelo)", acento: "acento-ambar", columna: 2, fila: 1, filas: 2 },
    ubicacion: { icono: "📍", titulo: "Ubicación en el almacén", acento: "acento-teal", columna: 1, fila: 2 },
    precios: { icono: "💲", titulo: "Stock, precios y alertas", acento: "acento-ambar", fila: 3, completo: true, columnas: 5 },
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/inventario" /> Inventario</h1>
          <div className="subtitle">Existencias, ubicación, códigos de barras, etiquetas y venta de mostrador</div>
        </div>
        {pestana === "existencias" && <div style={{ display: "flex", gap: 8 }}>
        <div className="vista-toggle vista-toggle-iconos">
          <button type="button" className={`vista-toggle-btn ${vista === "lista" ? "activo" : ""}`} title="Vista de lista" aria-label="Vista de lista" onClick={() => setVista("lista")}>
            <Icono nombre="list" size={19} />
          </button>
          <button type="button" className={`vista-toggle-btn ${vista === "cuadros" ? "activo" : ""}`} title="Vista en cuadros" aria-label="Vista en cuadros" onClick={() => setVista("cuadros")}>
            <Icono nombre="grid" size={19} />
          </button>
        </div>
        {hasPermission("inventario.crear") && (
          <button className="btn btn-primary btn-nuevo" onClick={() => { setEditing({}); setCompatNueva({ id_marca_vehiculo: "", id_modelo_vehiculo: "" }); setCompatibilidadesNuevas([]); }}><span className="btn-nuevo-icono"><Icono nombre="cube" size={22} /><span className="btn-nuevo-mas">+</span></span>Nuevo registro</button>
        )}
        </div>}
      </div>

      <div className="inv-tabs">
        {[
          ["existencias", "Existencias", "cube"],
          ...(hasPermission("inventario.editar") ? [["venta", "Punto de venta", "cash"], ["entrada", "Entrada de mercancía", "inbox"]] : []),
          ["ventas", "Ventas", "document"],
          ["etiquetas", "Etiquetas y códigos", "hash"],
        ].map(([clave, texto, icono]) => (
          <button key={clave} type="button" className={`inv-tab ${pestana === clave ? "activa" : ""}`} onClick={() => setPestana(clave)}><Icono nombre={icono} size={16} /> {texto}</button>
        ))}
      </div>

      {pestana === "venta" && <PuntoVenta filas={filas} fotos={fotos} marcasVehiculo={marcasVehiculo} modelosVehiculo={modelosVehiculo} onVendida={() => { load(); setVentasVersion((v) => v + 1); }} />}
      {pestana === "entrada" && <EntradaMercancia filas={filas} onCambio={load} />}
      {pestana === "ventas" && <VentasMostrador refrescar={ventasVersion} onCambio={load} />}
      {pestana === "etiquetas" && <Etiquetas filas={filas} preseleccion={etiquetaDe} onCambio={load} />}

      {pestana === "existencias" && <div className="panel">
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            className="search-input"
            placeholder="Buscar por refacción, marca, código de barras o ubicación…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button type="button" className={`btn-stock-bajo ${soloBajoStock ? "activo" : ""}`} aria-pressed={soloBajoStock} onClick={() => setSoloBajoStock((v) => !v)}>
            <Icono nombre="warning" size={17} /> Solo stock bajo
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Combo placeholder="Todas las marcas" value={fMarca} onChange={(v) => { setFMarca(v == null ? "" : String(v)); setFModelo(""); }}
              opciones={[{ value: "", label: "Todas las marcas" }, ...marcasVehiculo.map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca, ...opMarca(m) }))]} />
          </div>
          <select style={{ flex: 1, minWidth: 160 }} value={fModelo} disabled={!fMarca} onChange={(e) => setFModelo(e.target.value)}>
            <option value="">Todos los modelos</option>
            {modelosVehiculo.filter((mo) => String(mo.id_marca_vehiculo) === fMarca).map((mo) => <option key={mo.id_modelo_vehiculo} value={mo.id_modelo_vehiculo}>{mo.nombre_modelo}</option>)}
          </select>
          <select style={{ flex: 1, minWidth: 160 }} value={fRefaccion} onChange={(e) => setFRefaccion(e.target.value)}>
            <option value="">Todas las refacciones</option>
            {refacciones.slice().sort((a, b) => a.nombre_refaccion.localeCompare(b.nombre_refaccion)).map((x) => <option key={x.id_refaccion} value={x.id_refaccion}>{x.nombre_refaccion}</option>)}
          </select>
          {(fMarca || fModelo || fRefaccion) && <button type="button" className="btn btn-secondary" onClick={() => { setFMarca(""); setFModelo(""); setFRefaccion(""); }}>Limpiar filtros</button>}
        </div>
        <FiltroChips items={contarPor(filas, (r) => r.refaccion?.categoria || "Sin categoría")} valor={filtroCategoria} onChange={setFiltroCategoria} total={filas.length} />
        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : filasFiltradas.length === 0 ? (
          <div className="empty-state">Aún no hay refacciones en el inventario — da de alta la primera.</div>
        ) : vista === "cuadros" ? (
          <div className="veh-cuadros">
            {filasFiltradas.map((r) => {
              const cat = r.refaccion?.categoria || "Sin categoría";
              const est = estadoStock(r);
              const foto = fotos[r.id_inventario_refaccion];
              return (
                <div key={r.id_inventario_refaccion} className="veh-tarjeta" style={{ "--acc": colorGrupo(cat) }} onClick={() => hasPermission("inventario.editar") && (setEditing(r), setCompatNueva({ id_marca_vehiculo: "", id_modelo_vehiculo: "" }))}>
                  <div className="veh-tarjeta-foto" onClick={(e) => { e.stopPropagation(); setFotosDe(r); }} title="Ver / agregar fotos">
                    {foto ? (
                      <img loading="lazy" decoding="async" src={foto} alt="" />
                    ) : (
                      <div className="veh-tarjeta-foto-vacia">
                        <Icono nombre="camera" size={26} />
                        <span>Agregar foto</span>
                      </div>
                    )}
                    <span className={`badge ${est.clase} veh-tarjeta-estado`}>{est.texto}</span>
                  </div>
                  <div className="veh-tarjeta-cuerpo">
                    <div className="veh-tarjeta-titulo">{r.refaccion?.nombre_refaccion || "—"}{r.marca_refaccion?.nombre_marca ? ` · ${r.marca_refaccion.nombre_marca}` : ""}</div>
                    <div className="veh-tarjeta-meta">
                      <span><Icono nombre="pricetag" size={14} /> {cat}</span>
                      <span><Icono nombre="cube" size={14} /> {r.cantidad} {r.unidad || "pza"} en stock</span>
                      <span title="Ubicación en el almacén"><Icono nombre="pin" size={14} /> {ubicacionTexto(r) || "Sin ubicación"}</span>
                      {r.codigo_barras && <span title="Código de barras"><Icono nombre="hash" size={14} /> {r.codigo_barras}</span>}
                      <span><Icono nombre="car" size={14} /> {r.compatibilidades?.length
                        ? r.compatibilidades.map((c) => `${c.marca_vehiculo?.nombre_marca || ""} ${c.modelo_vehiculo?.nombre_modelo || ""}`.trim()).join(", ")
                        : "Sin compatibilidad"}</span>
                    </div>
                    <div className="veh-tarjeta-pie">
                      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="btn-icono" title="Fotos" aria-label="Fotos" onClick={() => setFotosDe(r)}><IconoAuto valor="📷" size={18} /></button>
                        <button className="btn-icono" title="Imprimir etiqueta" aria-label="Imprimir etiqueta" onClick={() => { setEtiquetaDe(r.id_inventario_refaccion); setPestana("etiquetas"); }}><Icono nombre="hash" size={18} /></button>
                        {hasPermission("inventario.editar") && (
                          <button className="btn-icono" title="Editar" aria-label="Editar" onClick={() => { setEditing(r); setCompatNueva({ id_marca_vehiculo: "", id_modelo_vehiculo: "" }); }}><Icono nombre="pencil" size={18} /></button>
                        )}
                        {hasPermission("inventario.eliminar") && (
                          <button className="btn-icono btn-icono-peligro" title="Eliminar" aria-label="Eliminar" onClick={() => eliminar(r)}><Icono nombre="trash" size={18} /></button>
                        )}
                      </div>
                      <div className="veh-tarjeta-contacto">
                        <span className="veh-tarjeta-contacto-nombre" style={{ color: "var(--teal-600)", fontWeight: 800, fontSize: 15 }}><Icono nombre="cash" size={14} /> Venta {dinero(r.preciocliente)}</span>
                        <span className="veh-tarjeta-contacto-tel" title="Costo de compra"><Icono nombre="card" size={13} /> Costo {dinero(r.preciopropio)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          categoriasOrdenadas.map((cat) => (
            <div key={cat} style={{ marginBottom: 20 }}>
              <div
                className="tarjetas-refaccion-grupo tarjetas-refaccion-grupo-clicable"
                onClick={() => setFiltroCategoria(cat)}
                title="Filtrar solo por esta categoría"
              >
                {cat}
              </div>
              <DataTable
                acentoFila={() => colorGrupo(cat)}
                columns={columns}
                rows={gruposPorCategoria[cat]}
                onEdit={hasPermission("inventario.editar") ? (r) => { setEditing(r); setCompatNueva({ id_marca_vehiculo: "", id_modelo_vehiculo: "" }); } : undefined}
                onDelete={hasPermission("inventario.eliminar") ? eliminar : undefined}
              />
            </div>
          ))
        )}
      </div>}

      {fotosDe && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && (setFotosDe(null), cargarFotos())}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: 18 }}>Fotos — {fotosDe.refaccion?.nombre_refaccion || "Refacción"}</h2>
            <FotoGaleria
              entidadTipo="inventario"
              entidadId={fotosDe.id_inventario_refaccion}
              puedeEditar={hasPermission("inventario.editar")}
              onCambio={cargarFotos}
              onFotoAgregada={() => { cargarFotos(); setFotosDe(null); }}
            />
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => { setFotosDe(null); cargarFotos(); }}>Cerrar</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {editing && (
        <FormModal
          title={editing.id_inventario_refaccion ? "Editar inventario" : "Nuevo registro de inventario"}
          icono="📦"
          subtitulo="Refacción, stock, precios, ubicación y compatibilidad."
          fields={fields}
          grupos={gruposInventario}
          initialValues={editing}
          onSubmit={guardar}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
