import { IconoAuto } from "../components/Icono";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ChangePasswordModal from "./ChangePasswordModal";
import { api } from "../api";
import { ICONOS } from "../iconos";

const NAV = [
  { group: "General", items: [{ to: "/", label: "Panel", end: true }, { to: "/mi-dashboard", label: "Mi dashboard" }] },
  {
    group: "Operación",
    items: [
      { to: "/servicios", label: "Órdenes de servicio" },
      { to: "/cotizaciones", label: "Cotizaciones" },
      { to: "/citas", label: "Citas solicitadas" },
      { to: "/clientes", label: "Clientes" },
      { to: "/vehiculos", label: "Vehículos" },
    ],
  },
  {
    group: "Inventario",
    items: [
      { to: "/refacciones", label: "Refacciones" },
      { to: "/inventario", label: "Inventario" },
      { to: "/herramientas", label: "Herramientas" },
      { to: "/proveedores", label: "Proveedores" },
    ],
  },
  { group: "App de clientes", items: [{ to: "/promociones", label: "Promociones" }, { to: "/asistente", label: "Asistente (chatbot)" }] },
];

export default function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [changingPassword, setChangingPassword] = useState(false);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
  const [configAbierta, setConfigAbierta] = useState(false);
  const [temaOscuro, setTemaOscuro] = useState(() => localStorage.getItem("sm_tema_oscuro") === "true");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", temaOscuro ? "dark" : "light");
    localStorage.setItem("sm_tema_oscuro", temaOscuro ? "true" : "false");
  }, [temaOscuro]);

  const puedeVerUsuarios = hasPermission("usuarios.ver");
  const puedeVerRoles = hasPermission("roles.ver");
  const puedeVerEmpleados = hasPermission("empleados.ver");

  useEffect(() => {
    if (!puedeVerUsuarios) return;
    api.get("/dashboard/resumen").then((r) => setSolicitudesPendientes(r.solicitudes_recuperacion_pendientes || 0));
  }, [puedeVerUsuarios]);

  const navAdmin = [{ to: "/catalogos", label: "Catálogos generales" }];
  if (hasPermission("configuracion.editar")) navAdmin.push({ to: "/configuracion-taller", label: "Datos del taller" });
  if (hasPermission("configuracion.editar")) navAdmin.push({ to: "/comisiones", label: "Comisiones" });
  navAdmin.push({ to: "/sincronizacion", label: "Sincronización" });
  if (puedeVerEmpleados) navAdmin.push({ to: "/empleados", label: "Empleados" });
  if (puedeVerUsuarios) navAdmin.push({ to: "/usuarios", label: "Usuarios" });
  if (puedeVerUsuarios) navAdmin.push({ to: "/asignacion-roles", label: "Asignación de roles" });
  if (puedeVerRoles) navAdmin.push({ to: "/roles", label: "Roles y permisos" });

  const nav = [...NAV, { group: "Configuración", items: navAdmin }];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          ALDM <span>AutoCore</span>
        </div>
        {nav.map((section) => {
          const esConfiguracion = section.group === "Configuración";
          const desplegado = !esConfiguracion || configAbierta;
          return (
            <div key={section.group}>
              {esConfiguracion ? (
                <button
                  type="button"
                  className={"nav-group-label nav-group-label-boton" + (location.pathname === "/configuracion" ? " active" : "")}
                  onClick={() => { navigate("/configuracion"); setConfigAbierta(true); }}
                >
                  <span style={{ flex: 1, textAlign: "left" }}>{section.group}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="nav-group-chevron"
                    title={configAbierta ? "Contraer" : "Expandir"}
                    onClick={(e) => { e.stopPropagation(); setConfigAbierta((v) => !v); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setConfigAbierta((v) => !v); } }}
                  >
                    {configAbierta ? "▲" : "▼"}
                  </span>
                </button>
              ) : (
                <div className="nav-group-label">{section.group}</div>
              )}
              {desplegado && section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
                >
                  <span style={{ marginRight: 8 }}>{ICONOS[item.to] || "•"}</span>
                  {item.label}
                  {item.to === "/usuarios" && solicitudesPendientes > 0 && (
                    <span className="nav-badge">{solicitudesPendientes}</span>
                  )}
                </NavLink>
              ))}
              {esConfiguracion && desplegado && (
                <label className="nav-tema-toggle">
                  <span><IconoAuto valor="🌙" size={18} /> Tema oscuro</span>
                  <input type="checkbox" checked={temaOscuro} onChange={(e) => setTemaOscuro(e.target.checked)} />
                </label>
              )}
            </div>
          );
        })}
        <div className="sidebar-footer">
          {user?.nombre_completo || user?.username}
          <span className="role-badge">{user?.rol?.nombre}</span>
          <button className="logout-btn" onClick={() => setChangingPassword(true)}>
            Cambiar contraseña
          </button>
          <button className="logout-btn" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>

      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
