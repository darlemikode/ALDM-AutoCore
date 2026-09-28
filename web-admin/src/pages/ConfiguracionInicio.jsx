import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  AVISOS, avisoOmitido, escucharAvisos, escucharSidebar, escucharTema, omitirAviso,
  setSidebarCompacta, setTemaOscuro, sidebarCompactaActiva, temaOscuroActivo,
} from "../preferencias";

// Mismo ciclo de acentos que Catálogos generales / Roles.
const COLORES = ["petrol", "teal", "warn", "violet", "blue"];
function acentoDe(indice) {
  const c = COLORES[indice % COLORES.length];
  return { "--acc": `var(--${c}-600)`, "--acc-soft": `var(--${c}-100)` };
}

export default function ConfiguracionInicio() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [temaOscuro, setTemaOscuroLocal] = useState(temaOscuroActivo);
  const [sidebarCompacta, setSidebarCompactaLocal] = useState(sidebarCompactaActiva);
  const [, refrescarAvisos] = useState(0);
  useEffect(() => escucharTema(() => setTemaOscuroLocal(temaOscuroActivo())), []);
  useEffect(() => escucharSidebar(() => setSidebarCompactaLocal(sidebarCompactaActiva())), []);
  useEffect(() => escucharAvisos(() => refrescarAvisos((n) => n + 1)), []);

  const puedeConfigurar = hasPermission("configuracion.editar");
  const puedeVerUsuarios = hasPermission("usuarios.ver");
  const puedeVerRoles = hasPermission("roles.ver");
  const puedeVerEmpleados = hasPermission("empleados.ver");
  const puedeVerCatalogos = hasPermission("catalogos.ver");

  const GRUPOS = [
    {
      grupo: "Taller y facturación",
      items: [
        puedeConfigurar && { to: "/configuracion-taller", icono: "🏢", label: "Datos del taller", descripcion: "Nombre, logo, dirección y datos fiscales de la empresa." },
        puedeConfigurar && { to: "/comisiones", icono: "💳", label: "Comisiones", descripcion: "Porcentajes que gana cada técnico o vendedor por servicio." },
      ].filter(Boolean),
    },
    {
      grupo: "Catálogos",
      items: [
        puedeVerCatalogos && { to: "/catalogos", icono: "📚", label: "Catálogos generales", descripcion: "Listas usadas en clientes, vehículos y refacciones." },
      ].filter(Boolean),
    },
    {
      grupo: "Personal y accesos",
      items: [
        puedeVerEmpleados && { to: "/empleados", icono: "👷", label: "Empleados", descripcion: "Técnicos y personal del taller." },
        puedeVerUsuarios && { to: "/usuarios", icono: "👤", label: "Usuarios", descripcion: "Cuentas con acceso al sistema." },
        puedeVerUsuarios && { to: "/asignacion-roles", icono: "🔗", label: "Asignación de roles", descripcion: "Qué rol tiene cada usuario." },
        puedeVerRoles && { to: "/roles", icono: "🛡️", label: "Roles y permisos", descripcion: "Qué puede hacer cada rol dentro del sistema." },
      ].filter(Boolean),
    },
    {
      grupo: "Sistema",
      items: [
        { to: "/sincronizacion", icono: "🔄", label: "Sincronización", descripcion: "Estado de la sincronización con la app y el portal del cliente." },
      ],
    },
  ].filter((g) => g.items.length > 0);

  let indiceGlobal = -1;

  const apariencia = [
    {
      clave: "tema",
      icono: "🌙",
      label: "Tema oscuro",
      descripcion: "Cambia los colores de todo el sistema a modo oscuro.",
      activo: temaOscuro,
      onChange: (v) => setTemaOscuro(v),
    },
    {
      clave: "sidebar",
      icono: "◧",
      label: "Barra lateral compacta",
      descripcion: "Muestra el menú lateral angosto, solo con íconos.",
      activo: sidebarCompacta,
      onChange: (v) => setSidebarCompacta(v),
    },
  ];

  const avisos = Object.entries(AVISOS).map(([clave, texto]) => ({
    clave,
    icono: "🔔",
    label: texto,
    descripcion: "Encendido: se vuelve a preguntar. Apagado: no se vuelve a preguntar.",
    activo: !avisoOmitido(clave),
    onChange: (v) => omitirAviso(clave, !v),
  }));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>⚙️ Configuración</h1>
          <div className="subtitle">Ajustes del taller, catálogos, personal y accesos</div>
        </div>
      </div>

      <div className="cat-grid-inicio">
        {GRUPOS.map((g) => (
          <div key={g.grupo} className="cat-grupo">
            <div className="cat-grupo-titulo">{g.grupo}</div>
            <div className="cfg-inicio-grid">
              {g.items.map((item) => {
                indiceGlobal += 1;
                return (
                  <button
                    type="button"
                    key={item.to}
                    className="cfg-inicio-card"
                    style={acentoDe(indiceGlobal)}
                    onClick={() => navigate(item.to)}
                  >
                    <span className="cfg-inicio-icono">{item.icono}</span>
                    <span className="cfg-inicio-info">
                      <span className="cfg-inicio-nombre">{item.label}</span>
                      <span className="cfg-inicio-desc">{item.descripcion}</span>
                    </span>
                    <span className="cfg-inicio-flecha">→</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="cat-grupo">
          <div className="cat-grupo-titulo">Apariencia</div>
          <div className="cfg-inicio-grid">
            {apariencia.map((item) => (
              <button
                type="button"
                key={item.clave}
                className={`cfg-inicio-card cfg-inicio-toggle ${item.activo ? "activa" : ""}`}
                style={{ "--acc": "var(--teal-600)", "--acc-soft": "var(--teal-100)" }}
                onClick={() => item.onChange(!item.activo)}
              >
                <span className="cfg-inicio-icono">{item.icono}</span>
                <span className="cfg-inicio-info">
                  <span className="cfg-inicio-nombre">{item.label}</span>
                  <span className="cfg-inicio-desc">{item.descripcion}</span>
                </span>
                <span className={`cfg-inicio-switch ${item.activo ? "on" : ""}`} aria-hidden="true"><span /></span>
              </button>
            ))}
          </div>
        </div>

        {avisos.length > 0 && (
          <div className="cat-grupo">
            <div className="cat-grupo-titulo">Avisos de confirmación</div>
            <div className="cfg-inicio-grid">
              {avisos.map((item) => (
                <button
                  type="button"
                  key={item.clave}
                  className={`cfg-inicio-card cfg-inicio-toggle ${item.activo ? "activa" : ""}`}
                  style={{ "--acc": "var(--warn-600)", "--acc-soft": "var(--warn-100)" }}
                  onClick={() => item.onChange(!item.activo)}
                  title="Desmarcado = no se vuelve a preguntar"
                >
                  <span className="cfg-inicio-icono">{item.icono}</span>
                  <span className="cfg-inicio-info">
                    <span className="cfg-inicio-nombre">{item.label}</span>
                    <span className="cfg-inicio-desc">{item.descripcion}</span>
                  </span>
                  <span className={`cfg-inicio-switch ${item.activo ? "on" : ""}`} aria-hidden="true"><span /></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
