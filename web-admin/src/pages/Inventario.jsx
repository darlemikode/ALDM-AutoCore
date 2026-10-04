import { IconoAuto } from "../components/Icono";
import { useEffect, useState } from "react";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FiltroChips, { colorGrupo, contarPor } from "../components/FiltroChips";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

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

  async function load() {
    setLoading(true);
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
  }

  useEffect(() => { load(); }, []);

  function estaBajoStock(r) {
    return r.cantidad <= (r.umbral_rojo ?? 1);
  }

  const filasFiltradas = filas.filter((r) => {
    const coincideTexto = !q.trim() || `${r.refaccion?.nombre_refaccion || ""} ${r.marca_refaccion?.nombre_marca || ""}`.toLowerCase().includes(q.toLowerCase());
    const coincideCategoria = !filtroCategoria || (r.refaccion?.categoria || "Sin categoría") === filtroCategoria;
    return coincideTexto && coincideCategoria;
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
      cantidad: Number(values.cantidad) || 0,
      preciopropio: Number(values.preciopropio) || 0,
      preciocliente: Number(values.preciocliente) || 0,
      umbral_naranja: Number(values.umbral_naranja) || 4,
      umbral_rojo: Number(values.umbral_rojo) || 1,
    };
    try {
      if (editing?.id_inventario_refaccion) {
        const actualizado = await api.put(`/inventario-refacciones/${editing.id_inventario_refaccion}`, datos);
        setEditing(actualizado);
        notify("Registro de inventario actualizado.", "success");
        load();
      } else {
        const nuevo = await api.post("/inventario-refacciones/", datos);
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
      { danger: true }
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
    { key: "ubicacion_fisica", label: "Ubicación", render: (r) => r.ubicacion_fisica || "—" },
  ];

  function fields() {
    return [
      {
        name: "id_refaccion", label: "Refacción", type: "select", required: true, grupo: "general",
        disabled: !!editing?.id_inventario_refaccion,
        options: refacciones.map((r) => ({ value: r.id_refaccion, label: r.nombre_refaccion })),
      },
      {
        name: "id_marca_refaccion", label: "Marca", type: "select", grupo: "general",
        options: marcasRefaccion.map((m) => ({ value: m.id_marca_refaccion, label: m.nombre_marca })),
        creatable: hasPermission("catalogos.crear")
          ? { endpoint: "/refacciones-marcas/", createField: "nombre_marca", idField: "id_marca_refaccion", label: "marca", onCreated: (n) => setMarcasRefaccion((prev) => [...prev, n]) }
          : null,
      },
      {
        name: "id_proveedor", label: "Proveedor", type: "select", grupo: "general",
        options: proveedores.map((p) => ({ value: p.id_proveedor, label: p.nombre_proveedor })),
      },
      { name: "numero_parte", label: "Número de parte", grupo: "general" },
      { name: "cantidad", label: "Stock (cantidad)", type: "number", required: true, grupo: "precios" },
      { name: "preciopropio", label: "Costo de compra", type: "number", grupo: "precios" },
      { name: "preciocliente", label: "Precio de venta", type: "number", grupo: "precios" },
      { name: "ubicacion_fisica", label: "Ubicación física", grupo: "precios" },
      { name: "umbral_naranja", label: "Alerta amarilla a partir de", type: "number", grupo: "alertas" },
      { name: "umbral_rojo", label: "Alerta crítica a partir de", type: "number", grupo: "alertas" },
    ];
  }

  const gruposInventario = {
    general: { icono: "📦", titulo: "Datos generales" },
    precios: { icono: "💲", titulo: "Stock y precios", acento: "acento-ambar" },
    alertas: { icono: "🚦", titulo: "Alertas de stock", acento: "acento-teal" },
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/inventario" /> Inventario</h1>
          <div className="subtitle">Stock y precio por refacción, con las marcas/modelos de vehículo con las que es compatible</div>
        </div>
        {hasPermission("refacciones.crear") && (
          <button className="btn btn-primary btn-nuevo" onClick={() => { setEditing({}); setCompatNueva({ id_marca_vehiculo: "", id_modelo_vehiculo: "" }); setCompatibilidadesNuevas([]); }}><span className="btn-nuevo-icono"><Icono nombre="cube" size={22} /><span className="btn-nuevo-mas">+</span></span>Nuevo registro</button>
        )}
      </div>

      <div className="panel">
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            className="search-input"
            placeholder="Buscar por refacción o marca…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
        </div>
        <FiltroChips items={contarPor(filas, (r) => r.refaccion?.categoria || "Sin categoría")} valor={filtroCategoria} onChange={setFiltroCategoria} total={filas.length} />
        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : filasFiltradas.length === 0 ? (
          <div className="empty-state">Aún no hay refacciones en el inventario — da de alta la primera.</div>
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
                onEdit={hasPermission("refacciones.editar") ? (r) => { setEditing(r); setCompatNueva({ id_marca_vehiculo: "", id_modelo_vehiculo: "" }); } : undefined}
                onDelete={hasPermission("refacciones.eliminar") ? eliminar : undefined}
              />
            </div>
          ))
        )}
      </div>

      {editing && (
        <FormModal
          title={editing.id_inventario_refaccion ? "Editar inventario" : "Nuevo registro de inventario"}
          icono="📦"
          subtitulo="Refacción, stock, precios y alertas."
          fields={fields}
          grupos={gruposInventario}
          initialValues={editing}
          onSubmit={guardar}
          onClose={() => setEditing(null)}
          footerExtra={(() => {
            const esEdicion = !!editing.id_inventario_refaccion;
            const lista = esEdicion ? (editing.compatibilidades || []) : compatibilidadesNuevas;
            return (
              <div className="field full" style={{ marginTop: 4 }}>
                <label>Compatible con (marca / modelo de vehículo) — puedes agregar varios</label>
                {lista.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {lista.map((c) => (
                      <div key={esEdicion ? c.id_compatibilidad : c.tempId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--ink-300)" }}>
                        <span style={{ fontSize: 13.5 }}>
                          {esEdicion ? c.marca_vehiculo?.nombre_marca : marcasVehiculo.find((m) => m.id_marca_vehiculo === c.id_marca_vehiculo)?.nombre_marca}{" "}
                          {esEdicion ? (c.modelo_vehiculo?.nombre_modelo || "") : (modelosVehiculo.find((m) => m.id_modelo_vehiculo === c.id_modelo_vehiculo)?.nombre_modelo || "")}
                        </span>
                        <button type="button" title="Quitar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--red-600)" }} onClick={() => esEdicion ? quitarCompatibilidad(c.id_compatibilidad) : quitarCompatibilidadLocal(c.tempId)}><IconoAuto valor="🗑️" size={18} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <select style={{ flex: 1 }} value={compatNueva.id_marca_vehiculo} onChange={(e) => setCompatNueva({ id_marca_vehiculo: e.target.value, id_modelo_vehiculo: "" })}>
                    <option value="">-- Marca --</option>
                    {marcasVehiculo.map((m) => <option key={m.id_marca_vehiculo} value={m.id_marca_vehiculo}>{m.nombre_marca}</option>)}
                  </select>
                  <select style={{ flex: 1 }} value={compatNueva.id_modelo_vehiculo} disabled={!compatNueva.id_marca_vehiculo} onChange={(e) => setCompatNueva({ ...compatNueva, id_modelo_vehiculo: e.target.value })}>
                    <option value="">-- Modelo (opcional) --</option>
                    {modelosVehiculo.filter((mo) => mo.id_marca_vehiculo === Number(compatNueva.id_marca_vehiculo)).map((mo) => <option key={mo.id_modelo_vehiculo} value={mo.id_modelo_vehiculo}>{mo.nombre_modelo}</option>)}
                  </select>
                  <button type="button" className="btn btn-agregar" onClick={esEdicion ? agregarCompatibilidad : agregarCompatibilidadLocal}><Icono nombre="add" size={18} /> Compatible con</button>
                </div>
              </div>
            );
          })()}
        />
      )}
    </>
  );
}
