import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import FormModal from "../../components/FormModal";
import { useUI } from "../../context/UIContext";
import { Cargando, EstadoBadge, TIPOS_NEGOCIO, fmt, fmtFecha, useCargar } from "./comun";

const FILTROS = [
  [null, "Todos"], ["prueba", "En prueba"], ["activa", "Activos"], ["por_vencer", "Por vencer"],
  ["gracia", "En gracia"], ["vencida", "Vencidos"], ["suspendida", "Suspendidos"],
];

function coincide(t, filtro) {
  const e = t.estado?.estado;
  if (!filtro) return true;
  if (filtro === "por_vencer") return (e === "activa" || e === "prueba") && t.estado?.dias_restantes != null && t.estado.dias_restantes <= 7;
  if (filtro === "suspendida") return e === "suspendida" || e === "cancelada";
  return e === filtro;
}

// Datos del taller (alta y edición). Se reusan en TallerDetalle.
export const CAMPOS_TALLER = [
  { name: "nombre_comercial", label: "Nombre comercial", required: true, grupo: "taller" },
  { name: "razon_social", label: "Razón social", grupo: "taller" },
  { name: "tipo_negocio", label: "Tipo de negocio", type: "select", options: TIPOS_NEGOCIO, noOrdenar: true, grupo: "taller" },
  { name: "codigo", label: "Código del taller (para su QR)", grupo: "taller", hint: "Letras y números. Vacío = se genera del nombre." },
  { name: "contacto_nombre", label: "Persona de contacto", grupo: "contacto" },
  { name: "telefono", label: "Teléfono", grupo: "contacto" },
  { name: "correo", label: "Correo", type: "email", grupo: "contacto" },
  { name: "ciudad", label: "Ciudad", grupo: "contacto" },
  { name: "estado_mx", label: "Estado", grupo: "contacto" },
  { name: "notas", label: "Notas", type: "textarea", full: true, grupo: "contacto" },
];
export const GRUPOS_TALLER = {
  taller: { icono: "🏢", titulo: "Taller" },
  contacto: { icono: "📇", titulo: "Contacto", acento: "acento-teal" },
  plan: { icono: "💳", titulo: "Plan", acento: "acento-ambar" },
};

export default function Talleres() {
  const navigate = useNavigate();
  const { notify } = useUI();
  const [params, setParams] = useSearchParams();
  const filtro = params.get("filtro");
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(null); // catálogos cargados para el alta
  const { datos, error } = useCargar(() => api.get("/superadmin/talleres"));

  const lista = useMemo(() => (datos || []).filter((t) => {
    const texto = `${t.nombre_comercial} ${t.codigo || ""} ${t.contacto_nombre || ""} ${t.ciudad || ""}`.toLowerCase();
    return coincide(t, filtro) && (!q || texto.includes(q.toLowerCase()));
  }), [datos, q, filtro]);

  async function abrirAlta() {
    try {
      const [paquetes, tipos, config] = await Promise.all([api.get("/superadmin/paquetes"), api.get("/superadmin/tipos-cobro"), api.get("/superadmin/configuracion")]);
      setNuevo({ paquetes, tipos, config, iniciales: { tipo_negocio: "taller", en_prueba: true, id_paquete: config.id_paquete_prueba || undefined } });
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function crear(v) {
    const creado = await api.post("/superadmin/talleres", {
      nombre_comercial: v.nombre_comercial, razon_social: v.razon_social || null, tipo_negocio: v.tipo_negocio || "taller",
      codigo: v.codigo || null, contacto_nombre: v.contacto_nombre || null, telefono: v.telefono || null, correo: v.correo || null,
      ciudad: v.ciudad || null, estado_mx: v.estado_mx || null, notas: v.notas || null,
      id_paquete: v.id_paquete ? Number(v.id_paquete) : null, id_tipo_cobro: v.id_tipo_cobro ? Number(v.id_tipo_cobro) : null,
      en_prueba: !!v.en_prueba,
    });
    setNuevo(null);
    notify("Taller dado de alta. Comparte al dueño su código de activación.", "success");
    navigate(`/superadmin/talleres/${creado.id_taller}`);
  }

  return (
    <>
      <div className="toolbar">
        <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, código, contacto o ciudad" />
        <button className="btn btn-primary" onClick={abrirAlta}>+ Nuevo taller</button>
      </div>
      <div className="chips-select" style={{ marginBottom: 14 }}>
        {FILTROS.map(([v, texto]) => (
          <button key={String(v)} type="button" className={"chip-toggle" + (filtro === v ? " chip-toggle-on" : "")}
            onClick={() => setParams(v ? { filtro: v } : {})}>
            {texto}
          </button>
        ))}
      </div>

      {!datos ? <Cargando error={error} /> : lista.length === 0 ? <div className="empty-state">No hay talleres con este filtro.</div> : (
        <div className="sa-tabla">
          <table>
            <thead>
              <tr><th>Taller</th><th>Plan</th><th>Vence</th><th>Estado</th><th className="num">Por periodo</th><th>Uso</th></tr>
            </thead>
            <tbody>
              {lista.map((t) => (
                <tr key={t.id_taller} className="sa-fila-link" onClick={() => navigate(`/superadmin/talleres/${t.id_taller}`)}>
                  <td>
                    <strong>{t.nombre_comercial}</strong>
                    <div className="sa-sub mono">{t.codigo}</div>
                    {t.pendiente_activacion && <div className="sa-sub" style={{ color: "var(--warn-600)", fontWeight: 600 }}>Pendiente de activar</div>}
                  </td>
                  <td>{[t.suscripcion?.paquete?.nombre, t.suscripcion?.tipo_cobro?.nombre].filter(Boolean).join(" · ") || "—"}</td>
                  <td>
                    {t.suscripcion?.fecha_vencimiento ? fmtFecha(t.suscripcion.fecha_vencimiento) : "Sin vencimiento"}
                    {t.estado?.dias_restantes != null && t.estado.dias_restantes >= 0 && t.estado.dias_restantes <= 7 && <div className="sa-sub">{t.estado.dias_restantes} día(s)</div>}
                  </td>
                  <td><EstadoBadge estado={t.estado?.estado} /></td>
                  <td className="num">{t.precio_periodo != null ? fmt(t.precio_periodo) : "—"}</td>
                  <td className="sa-sub">{t.uso?.usuarios_activos || 0} usuarios · {t.uso?.clientes || 0} clientes · {t.uso?.ordenes_mes || 0} órdenes/mes</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nuevo && (
        <FormModal
          title="Nuevo taller"
          subtitulo="Se crea con su código QR y sus roles base. El dueño registra su usuario administrador la primera vez que entra."
          icono="🏢"
          grupos={GRUPOS_TALLER}
          initialValues={nuevo.iniciales}
          fields={[
            ...CAMPOS_TALLER,
            { name: "id_paquete", label: "Paquete", type: "select", required: true, grupo: "plan",
              options: nuevo.paquetes.filter((p) => p.activo).map((p) => ({ value: p.id_paquete, label: `${p.nombre} · ${fmt(p.precio_mensual)}/mes` })) },
            { name: "id_tipo_cobro", label: "Tipo de cobro", type: "select", grupo: "plan", noOrdenar: true,
              options: nuevo.tipos.filter((t) => t.activo).map((t) => ({ value: t.id_tipo_cobro, label: t.nombre })) },
            { name: "en_prueba", label: "Empieza en periodo de prueba", type: "checkbox", grupo: "plan", hint: `${nuevo.config.dias_prueba} días de prueba` },
          ]}
          onSubmit={crear}
          onClose={() => setNuevo(null)}
        />
      )}
    </>
  );
}
