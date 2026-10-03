import { useEffect, useState } from "react";
import { api } from "../api";
import { Icono } from "../components/Icono";
import FiltroChips, { colorGrupo as colorCategoria, contarPor } from "../components/FiltroChips";
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
  const [marcas, setMarcas] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [categoriasRefaccion, setCategoriasRefaccion] = useState([]);
  const [marcasVehiculo, setMarcasVehiculo] = useState([]);
  const [modelosVehiculo, setModelosVehiculo] = useState([]);
  const [q, setQ] = useState("");
  const [soloBajoStock, setSoloBajoStock] = useState(false);
  const [editing, setEditing] = useState(null);
  const [compatNueva, setCompatNueva] = useState({ id_marca_vehiculo: "", id_modelo_vehiculo: "" });
  const [loading, setLoading] = useState(true);
  const [catSel, setCatSel] = useState("");

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (soloBajoStock) params.set("bajo_stock", "true");
    const [r, m, p, cat, marcasVeh, modelosVeh] = await Promise.all([
      api.get(`/refacciones/?${params}`),
      api.get("/refacciones-marcas/"),
      api.get("/proveedores/"),
      api.get("/refacciones-categorias/"),
      api.get("/vehiculos-marcas/"),
      api.get("/vehiculos-modelos/"),
    ]);
    setRefacciones(r);
    setMarcas(m);
    setProveedores(p);
    setCategoriasRefaccion(cat);
    setMarcasVehiculo(marcasVeh);
    setModelosVehiculo(modelosVeh);
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, soloBajoStock]);

  useActualizacionGlobal("refacciones", load);

  function fields(values) {
    return [
      { name: "nombre_refaccion", label: "Nombre", required: true, full: true, grupo: "general" },
      { name: "numero_refaccion", label: "Número de parte", grupo: "general" },
      {
        name: "__id_categoria", label: "Categoría", type: "select", grupo: "general",
        options: categoriasRefaccion.map((c) => ({ value: c.id_categoria_refaccion, label: c.nombre_categoria })),
        creatable: hasPermission("catalogos.crear")
          ? {
              endpoint: "/refacciones-categorias/", createField: "nombre_categoria", idField: "id_categoria_refaccion", label: "categoría",
              onCreated: (nueva) => setCategoriasRefaccion((prev) => [...prev, nueva]),
            }
          : null,
      },
      {
        name: "id_proveedor", label: "Proveedor", type: "select", grupo: "proveedor",
        options: proveedores.map((p) => ({ value: p.id_proveedor, label: p.nombre_proveedor })),
        creatable: hasPermission("proveedores.crear")
          ? {
              endpoint: "/proveedores/", createField: "nombre_proveedor", idField: "id_proveedor", label: "proveedor",
              onCreated: (nuevo) => setProveedores((prev) => [...prev, nuevo]),
            }
          : null,
      },
      { name: "cantidad_refaccion", label: "Cantidad en stock", type: "number", grupo: "precios" },
      { name: "preciopropio_refaccion", label: "Precio de costo", type: "number", grupo: "precios" },
      { name: "preciocliente_refaccion", label: "Precio al cliente", type: "number", grupo: "precios" },
    ];
  }

  const gruposRefaccion = {
    general: { icono: "⚙️", titulo: "Datos generales" },
    proveedor: { icono: "🚚", titulo: "Proveedor", acento: "acento-teal" },
    precios: { icono: "💲", titulo: "Stock y precios", acento: "acento-ambar" },
  };

  async function handleSave(values) {
    const { __id_categoria, ...datos } = values;
    datos.categoria = __id_categoria ? categoriasRefaccion.find((c) => c.id_categoria_refaccion === Number(__id_categoria))?.nombre_categoria || null : null;
    if (editing?.id_refaccion) {
      await api.put(`/refacciones/${editing.id_refaccion}`, datos);
      notify("Refacción actualizada.", "success");
    } else {
      await api.post("/refacciones/", datos);
      notify("Refacción creada.", "success");
    }
    setEditing(null);
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
    const ok = await confirmDialog(`¿Eliminar "${r.nombre_refaccion}" del inventario?`, { danger: true });
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
    const base = {
      id_marca_refaccion: r.id_marca_refaccion, id_proveedor: r.id_proveedor, nombre_refaccion: r.nombre_refaccion,
      numero_refaccion: r.numero_refaccion, categoria: r.categoria, subcategoria: r.subcategoria,
      preciopropio_refaccion: r.preciopropio_refaccion, preciocliente_refaccion: r.preciocliente_refaccion,
      cantidad_refaccion: r.cantidad_refaccion, umbral_naranja: r.umbral_naranja, umbral_rojo: r.umbral_rojo,
      posicion: r.posicion, id_marca_vehiculo_compatible: r.id_marca_vehiculo_compatible,
      id_modelo_vehiculo_compatible: r.id_modelo_vehiculo_compatible, sku_interno: r.sku_interno,
      codigo_barras: r.codigo_barras, ubicacion_fisica: r.ubicacion_fisica, zona_abc: r.zona_abc,
    };
    try {
      const nueva = await api.put(`/refacciones/${r.id_refaccion}`, { ...base, ...cambios });
      setRefacciones((prev) => prev.map((x) => (x.id_refaccion === r.id_refaccion ? { ...x, ...nueva } : x)));
      notify("Actualizado.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const puedeEditar = hasPermission("refacciones.editar");
  const conteoCat = contarPor(refacciones, (r) => r.categoria || "Sin categoría");
  const visibles = catSel ? refacciones.filter((r) => (r.categoria || "Sin categoría") === catSel) : refacciones;

  function nombreMarca(id) { return marcas.find((m) => m.id_marca_refaccion === id)?.nombre_marca || "—"; }
  const fmt = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/refacciones" /> Refacciones</h1>
          <div className="subtitle">Inventario de partes del taller</div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>⚙️ Nueva refacción</button>
      </div>

      <div className="panel">
        <div className="toolbar">
          <input className="search-input" placeholder="Buscar por nombre o número de parte…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className={`btn btn-sm ${soloBajoStock ? "btn-primary" : "btn-secondary"}`} onClick={() => setSoloBajoStock((v) => !v)}>
            Solo stock bajo
          </button>
        </div>

        <FiltroChips items={conteoCat} valor={catSel} onChange={setCatSel} total={refacciones.length} />

        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : visibles.length === 0 ? (
          <div className="empty-state">No hay refacciones registradas.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Nombre</th><th>Número de parte</th><th>Categoría</th><th>Marca</th><th>Stock</th><th>Precio cliente</th><th></th></tr>
            </thead>
            <tbody>
              {visibles.map((r) => {
                const cat = r.categoria || "Sin categoría";
                const col = colorCategoria(cat);
                return (
                  <tr key={r.id_refaccion} style={{ "--acc": col }}>
                    <td><Editable puede={puedeEditar} valor={r.nombre_refaccion} mostrar={r.nombre_refaccion} onGuardar={(v) => v.trim() && actualizarCampo(r, { nombre_refaccion: v.trim() })} /></td>
                    <td><Editable puede={puedeEditar} valor={r.numero_refaccion} mostrar={r.numero_refaccion || "—"} onGuardar={(v) => actualizarCampo(r, { numero_refaccion: v.trim() || null })} /></td>
                    <td>
                      <Editable
                        puede={puedeEditar} valor={categoriasRefaccion.find((c) => c.nombre_categoria === r.categoria)?.id_categoria_refaccion ?? ""}
                        opciones={categoriasRefaccion.map((c) => ({ value: c.id_categoria_refaccion, label: c.nombre_categoria }))}
                        mostrar={<span className="cat-pill" style={{ "--c": col }}>{cat}</span>}
                        onGuardar={(v) => actualizarCampo(r, { categoria: v ? categoriasRefaccion.find((c) => c.id_categoria_refaccion === Number(v))?.nombre_categoria || null : null })}
                      />
                    </td>
                    <td>
                      <Editable
                        puede={puedeEditar} valor={r.id_marca_refaccion ?? ""}
                        opciones={marcas.map((m) => ({ value: m.id_marca_refaccion, label: m.nombre_marca }))}
                        mostrar={nombreMarca(r.id_marca_refaccion)}
                        onGuardar={(v) => actualizarCampo(r, { id_marca_refaccion: v ? Number(v) : null })}
                      />
                    </td>
                    <td>
                      <Editable puede={puedeEditar} tipo="number" valor={r.cantidad_refaccion}
                        mostrar={<span className={`badge ${r.cantidad_refaccion <= 3 ? "badge-red" : "badge-teal"}`}>{r.cantidad_refaccion}</span>}
                        onGuardar={(v) => actualizarCampo(r, { cantidad_refaccion: Math.max(0, parseInt(v, 10) || 0) })} />
                    </td>
                    <td>
                      <Editable puede={puedeEditar} tipo="number" valor={r.preciocliente_refaccion} mostrar={fmt(r.preciocliente_refaccion)}
                        onGuardar={(v) => actualizarCampo(r, { preciocliente_refaccion: Math.max(0, parseFloat(v) || 0) })} />
                    </td>
                    <td>
                      <div className="row-actions">
                        {puedeEditar && (
                          <button className="btn-icono" title="Editar todo" aria-label="Editar" onClick={() => abrirParaEditar(r)}><Icono nombre="pencil" size={18} /></button>
                        )}
                        {hasPermission("refacciones.eliminar") && (
                          <button className="btn-icono btn-icono-peligro" title="Eliminar" aria-label="Eliminar" onClick={() => handleDelete(r)}><Icono nombre="trash" size={18} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <FormModal
          title={editing.id_refaccion ? "Editar refacción" : "Nueva refacción"}
          icono="⚙️"
          subtitulo="Datos de la refacción, proveedor y stock."
          fields={fields}
          grupos={gruposRefaccion}
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
                        <button type="button" title="Quitar" className="link-quitar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--red-600)" }} onClick={() => quitarCompatibilidad(c.id_compatibilidad)}>🗑️</button>
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
                  <button type="button" className="btn btn-secondary btn-sm" onClick={agregarCompatibilidad}>+ Agregar</button>
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
