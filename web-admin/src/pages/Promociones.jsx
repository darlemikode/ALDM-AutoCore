import { IconoAuto } from "../components/Icono";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

const CAMPOS = [
  { name: "titulo", label: "Título", required: true, full: true, grupo: "contenido" },
  { name: "descripcion", label: "Descripción", type: "textarea", full: true, grupo: "contenido" },
  { name: "link", label: "Link (opcional — WhatsApp, página, etc.)", full: true, grupo: "contenido" },
  { name: "precio_promocion", label: "Precio de la promoción", type: "number", grupo: "precios" },
  { name: "precio_original", label: "Precio original (para mostrar el descuento)", type: "number", grupo: "precios" },
  { name: "fecha_inicio", label: "Vigente desde", type: "date", grupo: "vigencia" },
  { name: "fecha_fin", label: "Vigente hasta", type: "date", grupo: "vigencia" },
  { name: "orden", label: "Orden (menor número = aparece primero)", type: "number", grupo: "vigencia" },
  { name: "solo_nuevos_clientes", label: "Exclusiva para clientes nuevos (nunca han tenido un servicio)", type: "checkbox", full: true, grupo: "vigencia" },
];

const GRUPOS_PROMOCION = {
  contenido: { icono: "🏷️", titulo: "Contenido" },
  precios: { icono: "💲", titulo: "Precios", acento: "acento-teal" },
  vigencia: { icono: "📅", titulo: "Vigencia", acento: "acento-ambar" },
};

// Misma regla que aplica el backend para decidir qué le muestra al
// cliente de verdad (portal_cliente.py): activa Y dentro del rango de
// fechas. Se calcula aquí también para que el estatus del panel y la
// vista previa "Ver como cliente" no digan una cosa distinta a lo que en
// realidad va a ver la gente.
function esVigentePorFecha(p) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (p.fecha_inicio && p.fecha_inicio > hoy) return false;
  if (p.fecha_fin && p.fecha_fin < hoy) return false;
  return true;
}
function estadoPromocion(p) {
  if (!p.activa) return { texto: "Inactiva", clase: "badge-grey" };
  if (p.fecha_fin && p.fecha_fin < new Date().toISOString().slice(0, 10)) return { texto: "Vencida", clase: "badge-red" };
  if (p.fecha_inicio && p.fecha_inicio > new Date().toISOString().slice(0, 10)) return { texto: "Programada", clase: "badge-amber" };
  return { texto: "Activa", clase: "badge-teal" };
}

export default function Promociones() {
  const { notify, confirmDialog } = useUI();
  const { hasPermission } = useAuth();
  const [promociones, setPromociones] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subiendoImagenDe, setSubiendoImagenDe] = useState(null);
  const [previsualizando, setPrevisualizando] = useState(false);
  const inputRef = useRef(null);

  async function load() {
    setLoading(true);
    const data = await api.get("/promociones/");
    setPromociones(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(values) {
    if (editing?.id_promocion) {
      await api.put(`/promociones/${editing.id_promocion}`, values);
      notify("Promoción actualizada.", "success");
    } else {
      await api.post("/promociones/", values);
      notify("Promoción creada.", "success");
    }
    setEditing(null);
    load();
  }

  async function handleDelete(promo) {
    const ok = await confirmDialog(`¿Eliminar la promoción "${promo.titulo}"?`, { danger: true });
    if (!ok) return;
    try {
      await api.del(`/promociones/${promo.id_promocion}`);
      load();
      notify("Promoción eliminada.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function toggleActiva(promo) {
    try {
      await api.put(`/promociones/${promo.id_promocion}`, { ...promo, activa: !promo.activa });
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  function elegirImagenPara(promo) {
    setSubiendoImagenDe(promo.id_promocion);
    inputRef.current?.click();
  }

  async function alElegirArchivo(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo || !subiendoImagenDe) return;
    const formData = new FormData();
    formData.append("archivo", archivo);
    try {
      await api.postForm(`/promociones/${subiendoImagenDe}/imagen`, formData);
      notify("Imagen actualizada.", "success");
      load();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setSubiendoImagenDe(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/promociones" /> Promociones</h1>
          <div className="subtitle">Aparecen en el inicio de la app de tus clientes</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setPrevisualizando(true)}>
            <IconoAuto valor="👁️" size={18} /> Ver como cliente
          </button>
          {hasPermission("promociones.crear") && (
            <button className="btn btn-primary btn-nuevo" onClick={() => setEditing({})}><span className="btn-nuevo-icono"><Icono nombre="pricetag" size={22} /><span className="btn-nuevo-mas">+</span></span>Nueva promoción</button>
          )}
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={alElegirArchivo} />

      <div className="panel">
        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : (
          <DataTable
            columns={[
              {
                key: "imagen", label: "",
                render: (p) => p.ruta_imagen
                  ? <img src={`/uploads/${p.ruta_imagen}`} alt="" style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 6 }} />
                  : <div style={{ width: 50, height: 50, borderRadius: 6, background: "var(--paper-0)" }} />,
              },
              { key: "titulo", label: "Título", render: (p) => <>{p.titulo}{p.solo_nuevos_clientes && <span className="badge badge-petrol" style={{ marginLeft: 6 }}>Nuevos</span>}</> },
              { key: "precio_promocion", label: "Precio", render: (p) => p.precio_promocion ? `$${p.precio_promocion.toLocaleString("es-MX")}` : "—" },
              { key: "vigencia", label: "Vigencia", render: (p) => `${p.fecha_inicio || "siempre"} — ${p.fecha_fin || "siempre"}` },
              {
                key: "activa", label: "Estado",
                render: (p) => {
                  const { texto, clase } = estadoPromocion(p);
                  return (
                    <span className={`badge ${clase}`} style={{ cursor: hasPermission("promociones.editar") ? "pointer" : "default" }} title="Clic para activar/desactivar manualmente" onClick={() => hasPermission("promociones.editar") && toggleActiva(p)}>
                      {texto}
                    </span>
                  );
                },
              },
            ]}
            rows={promociones}
            onEdit={hasPermission("promociones.editar") ? setEditing : undefined}
            onDelete={hasPermission("promociones.eliminar") ? handleDelete : undefined}
            extraActions={(p) =>
              hasPermission("promociones.editar") && (
                <button className="btn btn-secondary btn-sm" onClick={() => elegirImagenPara(p)}>
                  <IconoAuto valor="📷" size={18} /> Imagen
                </button>
              )
            }
            emptyMessage="No hay promociones todavía."
          />
        )}
      </div>

      {editing && (
        <FormModal
          title={editing.id_promocion ? "Editar promoción" : "Nueva promoción"}
          icono="🏷️"
          subtitulo="Contenido, precios y vigencia de la promoción."
          fields={CAMPOS}
          grupos={GRUPOS_PROMOCION}
          initialValues={editing}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {previsualizando && (
        <VistaPreviaCliente promociones={promociones.filter((p) => p.activa && esVigentePorFecha(p))} onClose={() => setPrevisualizando(false)} />
      )}
    </>
  );
}

/**
 * Simula (no es la app real, es una maqueta visual) cómo se ven las
 * promociones en el inicio de la app de clientes — para que el dueño no
 * tenga que abrir su celular cada vez que agrega una.
 */
function VistaPreviaCliente({ promociones, onClose }) {
  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ width: 360, maxHeight: "85vh", overflowY: "auto", background: "#eef1f2", borderRadius: 24, padding: 0, border: "10px solid #1b2226" }}>
        <div style={{ background: "#fff", padding: "16px 16px 8px", position: "sticky", top: 0, zIndex: 2, borderBottom: "1px solid #e2e5e6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 18, textTransform: "uppercase" }}>Mi<span style={{ color: "var(--petrol-500)" }}>Taller</span></div>
            <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 13, color: "var(--ink-500)", cursor: "pointer" }}>Cerrar <IconoAuto valor="✕" size={18} /></button>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 8 }}>Así se ve el inicio de la app de tus clientes ahora mismo:</div>
        </div>

        <div style={{ padding: 16 }}>
          {promociones.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink-500)", textAlign: "center", padding: 20 }}>
              No hay promociones activas — el cliente no vería nada aquí.
            </div>
          ) : (
            promociones.map((p) => (
              <div key={p.id_promocion} style={{ background: "#fff", borderRadius: 14, marginBottom: 14, overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>
                {p.ruta_imagen && (
                  <img src={`/uploads/${p.ruta_imagen}`} alt={p.titulo} style={{ width: "100%", height: 140, objectFit: "cover" }} />
                )}
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {p.titulo}
                    {p.solo_nuevos_clientes && (
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: "var(--petrol-600)", background: "var(--petrol-100)", padding: "2px 8px", borderRadius: 100, verticalAlign: "middle" }}>
                        SOLO NUEVOS
                      </span>
                    )}
                  </div>
                  {p.descripcion && <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 4 }}>{p.descripcion}</div>}
                  {(p.precio_promocion || p.precio_original) && (
                    <div style={{ marginTop: 8 }}>
                      {p.precio_original && (
                        <span style={{ fontSize: 12, color: "var(--ink-500)", textDecoration: "line-through", marginRight: 8 }}>
                          ${p.precio_original.toLocaleString("es-MX")}
                        </span>
                      )}
                      {p.precio_promocion && (
                        <span style={{ fontSize: 16, fontWeight: 800, color: "var(--petrol-600)" }}>
                          ${p.precio_promocion.toLocaleString("es-MX")}
                        </span>
                      )}
                    </div>
                  )}
                  {p.link && (
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "var(--petrol-500)" }}>Ver más →</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  ,
  document.body
  );
}
