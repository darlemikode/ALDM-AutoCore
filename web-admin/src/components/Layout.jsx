<<<<<<< Updated upstream
import { IconoAuto } from "./Icono";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ChangePasswordModal from "./ChangePasswordModal";
import PagarSuscripcion from "./PagarSuscripcion";
import { api } from "../api";
import { ICONOS, COLORES_ICONO } from "../iconos";
import { Icono } from "./Icono";
import { escucharSidebar, escucharTema, setSidebarCompacta, sidebarCompactaActiva, temaOscuroActivo } from "../preferencias";
import CampanaNotificaciones from "./CampanaNotificaciones";
import Atajos from "./Atajos";
import { useActualizacionGlobal } from "../useActualizacionGlobal";

// permisoRequerido: si se define, el enlace solo se muestra a quien tenga
// ese permiso — así la barra lateral nunca ofrece algo a lo que el rol no
// puede entrar (antes solo la ruta lo bloqueaba, pero el enlace se veía
// igual y llevaba a un redirect confuso).
const NAV = [
  { group: "General", items: [{ to: "/", label: "Panel", end: true }, { to: "/citas", label: "Citas solicitadas" }, { to: "/mi-dashboard", label: "Mi dashboard" }] },
  {
    group: "Operación",
    items: [
      { to: "/servicios", label: "Órdenes de servicio", permisoRequerido: "servicios.ver" },
      { to: "/clientes", label: "Clientes", permisoRequerido: "clientes.ver" },
      { to: "/vehiculos", label: "Vehículos", permisoRequerido: "vehiculos.ver" },
      { to: "/cotizaciones", label: "Cotizaciones", permisoRequerido: "cotizaciones.ver" },
      { to: "/empleados", label: "Empleados", permisoRequerido: "empleados.ver" },
      { to: "/nomina", label: "Nómina", permisoRequerido: "nomina.ver" },
    ],
  },
  {
    group: "Inventario",
    items: [
      { to: "/refacciones", label: "Refacciones", permisoRequerido: "refacciones.ver" },
      { to: "/inventario", label: "Inventario", permisoRequerido: "inventario.ver" },
      { to: "/herramientas", label: "Herramientas", permisoRequerido: "herramientas.ver" },
      { to: "/proveedores", label: "Proveedores", permisoRequerido: "proveedores.ver" },
    ],
  },
  { group: "Soporte", items: [{ to: "/errores", label: "Errores del sistema", permisoRequerido: "configuracion.editar" }] },
  { group: "App de clientes", items: [{ to: "/promociones", label: "Promociones", permisoRequerido: "promociones.ver" }, { to: "/asistente", label: "Asistente (chatbot)" }] },
];

export default function Layout() {
  const { user, logout, hasPermission, talleres, estadoSuscripcion, seleccionarTaller, eligiendoTaller, continuarEnTallerActual } = useAuth();
  const [eligiendo, setEligiendo] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [changingPassword, setChangingPassword] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
  const [temaOscuro, setTemaOscuroLocal] = useState(temaOscuroActivo);
  const [sidebarCompacta, setSidebarCompactaLocal] = useState(sidebarCompactaActiva);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  // En pantallas angostas la barra lateral no cabe fija: se abre como
  // panel encima del contenido y se cierra sola al navegar.
  useEffect(() => { setMenuMovilAbierto(false); }, [location.pathname]);

  // El tema y el modo compacto se pueden cambiar desde aquí o desde
  // Configuración — cualquiera de los dos escucha al otro.
  useEffect(() => escucharTema(() => setTemaOscuroLocal(temaOscuroActivo())), []);
  useEffect(() => escucharSidebar(() => setSidebarCompactaLocal(sidebarCompactaActiva())), []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", temaOscuro ? "dark" : "light");
  }, [temaOscuro]);

  const puedeVerUsuarios = hasPermission("usuarios.ver");

  function cargarSolicitudesPendientes() {
    if (!puedeVerUsuarios) return;
    api.get("/dashboard/resumen").then((r) => setSolicitudesPendientes(r.solicitudes_recuperacion_pendientes || 0));
  }
  useEffect(cargarSolicitudesPendientes, [puedeVerUsuarios]);
  // Antes solo se cargaba una vez al entrar — ahora se refresca sola en
  // cuanto alguien pide "olvidé mi contraseña", sin recargar la página.
  useActualizacionGlobal("auth", cargarSolicitudesPendientes);

  // Los sub-apartados de Configuración ya no se listan en la barra lateral
  // (viven como tarjetas grandes en /configuracion) — solo se usan aquí
  // para saber si el enlace debe verse "activo".
  const rutasConfiguracion = ["/configuracion", "/catalogos", "/configuracion-taller", "/comisiones", "/empleados", "/usuarios", "/asignacion-roles", "/roles"];
  const enConfiguracion = rutasConfiguracion.some((r) => location.pathname === r || location.pathname.startsWith(r + "/"));

  const navBase = NAV.map((s) =>
    s.group === "Operación" && hasPermission("facturacion.ver")
      ? { ...s, items: [...s.items, { to: "/facturacion", label: "Facturación" }] }
      : s
  );
  const nav = navBase
    .map((s) => ({ ...s, items: s.items.filter((item) => !item.permisoRequerido || hasPermission(item.permisoRequerido)) }))
    .filter((s) => s.items.length > 0);
  if (user?.es_superadmin) nav.push({ group: "ALDM", items: [{ to: "/superadmin", label: "Súper admin" }] });
  const mostrarSelector = eligiendoTaller || eligiendo;
  const bloqueado = !!estadoSuscripcion?.bloqueado;

  return (
    <div className={"app-shell" + (sidebarCompacta ? " sidebar-compacta-shell" : "")}>
      <Atajos />
      <div className="topbar-movil">
        <button type="button" className="topbar-movil-hamburguesa" title="Abrir menú" onClick={() => setMenuMovilAbierto(true)}>
          <IconoAuto valor="☰" size={18} />
        </button>
        <span className="topbar-movil-marca">ALDM AutoCore</span>
      </div>

      {/* Grande y siempre a la vista, fuera del panel lateral — no hay que
          abrir el menú ni entrar a Configuración para ver los avisos. */}
      <div className="campana-flotante">
        <CampanaNotificaciones grande />
      </div>
      {menuMovilAbierto && <div className="sidebar-backdrop" onClick={() => setMenuMovilAbierto(false)} />}
      <aside className={"sidebar" + (sidebarCompacta ? " sidebar-compacta" : "") + (menuMovilAbierto ? " sidebar-abierta" : "")}>
        <div className="brand">
          <span className="brand-texto">ALDM <span>AutoCore</span></span>
          <button
            type="button"
            className="sidebar-colapsar"
            title={sidebarCompacta ? "Expandir barra lateral" : "Hacer más delgada la barra lateral"}
            onClick={() => setSidebarCompacta(!sidebarCompacta)}
          >
            {sidebarCompacta ? "»" : "«"}
          </button>
          <button type="button" className="sidebar-cerrar-movil" title="Cerrar menú" onClick={() => setMenuMovilAbierto(false)}>
            <Icono nombre="close" size={16} />
          </button>
        </div>
        {user?.taller && (
          <div className="taller-actual" title={user.taller}>
            <span className="taller-actual-nombre">{user.taller}</span>
            {talleres.length > 1 && (
              <button type="button" className="taller-actual-cambiar" onClick={() => setEligiendo(true)}>Cambiar</button>
            )}
          </div>
        )}
        {nav.map((section) => (
          <div key={section.group}>
            <div className="nav-group-label">{section.group}</div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={item.label}
                className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
              >
                <span className="nav-link-icono" style={{ "--ico": COLORES_ICONO[item.to] || "#2de2d0" }}><Icono nombre={ICONOS[item.to] || "grid"} size={19} /></span>
                <span className="nav-link-texto">{item.label}</span>
                {item.to === "/usuarios" && solicitudesPendientes > 0 && (
                  <span className="nav-badge">{solicitudesPendientes}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}

        <button
          type="button"
          className={"nav-link nav-link-boton" + (enConfiguracion ? " active" : "")}
          title="Configuración"
          onClick={() => navigate("/configuracion")}
        >
          <span className="nav-link-icono"><Icono nombre="settings" size={17} /></span>
          <span className="nav-link-texto">Configuración</span>
        </button>
        <div className="sidebar-footer">
          <div className="sidebar-footer-user">
            {user?.nombre_completo || user?.username}
            <span className="role-badge">{user?.rol?.nombre}</span>
          </div>
          <button className="logout-btn" onClick={() => setChangingPassword(true)} title="Cambiar contraseña">
            <Icono nombre="key" size={16} /> <span className="nav-link-texto">Cambiar contraseña</span>
          </button>
          <button className="logout-btn" onClick={logout} title="Cerrar sesión">
            <Icono nombre="log-out" size={16} /> <span className="nav-link-texto">Cerrar sesión</span>
          </button>
        </div>
      </aside>
      <main className="main">
        {estadoSuscripcion?.mensaje && !bloqueado && (
          <div className={"aviso-suscripcion" + (estadoSuscripcion.solo_lectura ? " aviso-suscripcion-grave" : "")}>
            <Icono nombre="notifications" size={18} /> {estadoSuscripcion.mensaje}
            {hasPermission("configuracion.editar") && <button className="btn btn-primary btn-sm" style={{ marginLeft: 12 }} onClick={() => setPagando(true)}>Pagar suscripción</button>}
          </div>
        )}
        {bloqueado ? (
          <div className="bloqueo-suscripcion">
            <h2>Acceso suspendido</h2>
            <p>{estadoSuscripcion.mensaje}</p>
            <button className="btn btn-primary" onClick={() => setPagando(true)}>Pagar suscripción</button>
            {talleres.length > 1 && <button className="btn btn-primary" onClick={() => setEligiendo(true)}>Entrar a otro taller</button>}
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {mostrarSelector && talleres.length > 0 && (
        <div className="modal-backdrop selector-taller-fondo">
          <div className="selector-taller">
            <h2>¿A qué taller quieres entrar?</h2>
            <p className="selector-taller-sub">Tu usuario tiene acceso a {talleres.length} talleres.</p>
            <div className="selector-taller-lista">
              {talleres.map((t) => (
                <button
                  key={t.id_taller}
                  type="button"
                  className={"selector-taller-item" + (t.id_taller === user?.id_taller ? " actual" : "")}
                  disabled={t.bloqueado}
                  onClick={() => (t.id_taller === user?.id_taller ? (continuarEnTallerActual(), setEligiendo(false)) : seleccionarTaller(t.id_taller))}
                >
                  <span className="selector-taller-nombre">{t.nombre}</span>
                  <span className="selector-taller-meta">{t.rol}{t.bloqueado ? " · suspendido" : t.estado === "prueba" ? " · en prueba" : t.estado === "gracia" ? " · solo consulta" : ""}</span>
                  {t.id_taller === user?.id_taller && <span className="selector-taller-marca">actual</span>}
                </button>
              ))}
            </div>
            {!eligiendoTaller && <button type="button" className="btn-link" onClick={() => setEligiendo(false)}>Cancelar</button>}
          </div>
        </div>
      )}

      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
      {pagando && <PagarSuscripcion onClose={() => setPagando(false)} />}
    </div>
  );
}
=======
import { IconoAuto } from "./Icono";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ChangePasswordModal from "./ChangePasswordModal";
import PagarSuscripcion from "./PagarSuscripcion";
import { api } from "../api";
import { ICONOS, COLORES_ICONO } from "../iconos";
import { Icono } from "./Icono";
import { escucharSidebar, escucharTema, setSidebarCompacta, sidebarCompactaActiva, temaOscuroActivo } from "../preferencias";
import CampanaNotificaciones from "./CampanaNotificaciones";
import Atajos from "./Atajos";
import { useActualizacionGlobal } from "../useActualizacionGlobal";

// permisoRequerido: si se define, el enlace solo se muestra a quien tenga
// ese permiso — así la barra lateral nunca ofrece algo a lo que el rol no
// puede entrar (antes solo la ruta lo bloqueaba, pero el enlace se veía
// igual y llevaba a un redirect confuso).
const NAV = [
  { group: "General", items: [{ to: "/", label: "Panel", end: true }, { to: "/citas", label: "Citas solicitadas" }, { to: "/mi-dashboard", label: "Mi dashboard" }] },
  {
    group: "Operación",
    items: [
      { to: "/servicios", label: "Órdenes de servicio", permisoRequerido: "servicios.ver" },
      { to: "/clientes", label: "Clientes", permisoRequerido: "clientes.ver" },
      { to: "/vehiculos", label: "Vehículos", permisoRequerido: "vehiculos.ver" },
      { to: "/cotizaciones", label: "Cotizaciones", permisoRequerido: "cotizaciones.ver" },
      { to: "/empleados", label: "Empleados", permisoRequerido: "empleados.ver" },
      { to: "/nomina", label: "Nómina", permisoRequerido: "nomina.ver" },
    ],
  },
  {
    group: "Inventario",
    items: [
      { to: "/refacciones", label: "Refacciones", permisoRequerido: "refacciones.ver" },
      { to: "/inventario", label: "Inventario", permisoRequerido: "inventario.ver" },
      { to: "/herramientas", label: "Herramientas", permisoRequerido: "herramientas.ver" },
      { to: "/proveedores", label: "Proveedores", permisoRequerido: "proveedores.ver" },
    ],
  },
  { group: "Soporte", items: [{ to: "/errores", label: "Errores del sistema", permisoRequerido: "configuracion.editar" }] },
  { group: "App de clientes", items: [{ to: "/promociones", label: "Promociones", permisoRequerido: "promociones.ver" }, { to: "/asistente", label: "Asistente (chatbot)" }] },
];

export default function Layout() {
  const { user, logout, hasPermission, talleres, estadoSuscripcion, seleccionarTaller, eligiendoTaller, continuarEnTallerActual } = useAuth();
  const [eligiendo, setEligiendo] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [changingPassword, setChangingPassword] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
  const [temaOscuro, setTemaOscuroLocal] = useState(temaOscuroActivo);
  const [sidebarCompacta, setSidebarCompactaLocal] = useState(sidebarCompactaActiva);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  // En pantallas angostas la barra lateral no cabe fija: se abre como
  // panel encima del contenido y se cierra sola al navegar.
  useEffect(() => { setMenuMovilAbierto(false); }, [location.pathname]);

  // El tema y el modo compacto se pueden cambiar desde aquí o desde
  // Configuración — cualquiera de los dos escucha al otro.
  useEffect(() => escucharTema(() => setTemaOscuroLocal(temaOscuroActivo())), []);
  useEffect(() => escucharSidebar(() => setSidebarCompactaLocal(sidebarCompactaActiva())), []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", temaOscuro ? "dark" : "light");
  }, [temaOscuro]);

  const puedeVerUsuarios = hasPermission("usuarios.ver");

  function cargarSolicitudesPendientes() {
    if (!puedeVerUsuarios) return;
    api.get("/dashboard/resumen").then((r) => setSolicitudesPendientes(r.solicitudes_recuperacion_pendientes || 0));
  }
  useEffect(cargarSolicitudesPendientes, [puedeVerUsuarios]);
  // Antes solo se cargaba una vez al entrar — ahora se refresca sola en
  // cuanto alguien pide "olvidé mi contraseña", sin recargar la página.
  useActualizacionGlobal("auth", cargarSolicitudesPendientes);

  // Los sub-apartados de Configuración ya no se listan en la barra lateral
  // (viven como tarjetas grandes en /configuracion) — solo se usan aquí
  // para saber si el enlace debe verse "activo".
  const rutasConfiguracion = ["/configuracion", "/catalogos", "/configuracion-taller", "/comisiones", "/empleados", "/usuarios", "/asignacion-roles", "/roles"];
  const enConfiguracion = rutasConfiguracion.some((r) => location.pathname === r || location.pathname.startsWith(r + "/"));

  const navBase = NAV.map((s) =>
    s.group === "Operación" && hasPermission("facturacion.ver")
      ? { ...s, items: [...s.items, { to: "/facturacion", label: "Facturación" }] }
      : s
  );
  const nav = navBase
    .map((s) => ({ ...s, items: s.items.filter((item) => !item.permisoRequerido || hasPermission(item.permisoRequerido)) }))
    .filter((s) => s.items.length > 0);
  if (user?.es_superadmin) nav.push({ group: "ALDM", items: [{ to: "/superadmin", label: "Súper admin" }] });
  const mostrarSelector = eligiendoTaller || eligiendo;
  const bloqueado = !!estadoSuscripcion?.bloqueado;

  return (
    <div className={"app-shell" + (sidebarCompacta ? " sidebar-compacta-shell" : "")}>
      <Atajos />
      <div className="topbar-movil">
        <button type="button" className="topbar-movil-hamburguesa" title="Abrir menú" onClick={() => setMenuMovilAbierto(true)}>
          <IconoAuto valor="☰" size={18} />
        </button>
        <span className="topbar-movil-marca">ALDM AutoCore</span>
      </div>

      {/* Grande y siempre a la vista, fuera del panel lateral — no hay que
          abrir el menú ni entrar a Configuración para ver los avisos. */}
      <div className="campana-flotante">
        <CampanaNotificaciones grande />
      </div>
      {menuMovilAbierto && <div className="sidebar-backdrop" onClick={() => setMenuMovilAbierto(false)} />}
      <aside className={"sidebar" + (sidebarCompacta ? " sidebar-compacta" : "") + (menuMovilAbierto ? " sidebar-abierta" : "")}>
        <div className="brand">
          <span className="brand-texto">ALDM <span>AutoCore</span></span>
          <button
            type="button"
            className="sidebar-colapsar"
            title={sidebarCompacta ? "Expandir barra lateral" : "Hacer más delgada la barra lateral"}
            onClick={() => setSidebarCompacta(!sidebarCompacta)}
          >
            {sidebarCompacta ? "»" : "«"}
          </button>
          <button type="button" className="sidebar-cerrar-movil" title="Cerrar menú" onClick={() => setMenuMovilAbierto(false)}>
            <Icono nombre="close" size={16} />
          </button>
        </div>
        {user?.taller && (
          <div className="taller-actual" title={user.taller}>
            <span className="taller-actual-nombre">{user.taller}</span>
            {talleres.length > 1 && (
              <button type="button" className="taller-actual-cambiar" onClick={() => setEligiendo(true)}>Cambiar</button>
            )}
          </div>
        )}
        {nav.map((section) => (
          <div key={section.group}>
            <div className="nav-group-label">{section.group}</div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={item.label}
                className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
              >
                <span className="nav-link-icono" style={{ "--ico": COLORES_ICONO[item.to] || "#2de2d0" }}><Icono nombre={ICONOS[item.to] || "grid"} size={19} /></span>
                <span className="nav-link-texto">{item.label}</span>
                {item.to === "/usuarios" && solicitudesPendientes > 0 && (
                  <span className="nav-badge">{solicitudesPendientes}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}

        <button
          type="button"
          className={"nav-link nav-link-boton" + (enConfiguracion ? " active" : "")}
          title="Configuración"
          onClick={() => navigate("/configuracion")}
        >
          <span className="nav-link-icono"><Icono nombre="settings" size={17} /></span>
          <span className="nav-link-texto">Configuración</span>
        </button>
        <div className="sidebar-footer">
          <div className="sidebar-footer-user">
            {user?.nombre_completo || user?.username}
            <span className="role-badge">{user?.rol?.nombre}</span>
          </div>
          <button className="logout-btn" onClick={() => setChangingPassword(true)} title="Cambiar contraseña">
            <Icono nombre="key" size={16} /> <span className="nav-link-texto">Cambiar contraseña</span>
          </button>
          <button className="logout-btn" onClick={logout} title="Cerrar sesión">
            <Icono nombre="log-out" size={16} /> <span className="nav-link-texto">Cerrar sesión</span>
          </button>
        </div>
      </aside>
      <main className="main">
        {estadoSuscripcion?.mensaje && !bloqueado && (
          <div className={"aviso-suscripcion" + (estadoSuscripcion.solo_lectura ? " aviso-suscripcion-grave" : "")}>
            <Icono nombre="notifications" size={18} /> {estadoSuscripcion.mensaje}
            {hasPermission("configuracion.editar") && <button className="btn btn-primary btn-sm" style={{ marginLeft: 12 }} onClick={() => setPagando(true)}>Pagar suscripción</button>}
          </div>
        )}
        {bloqueado ? (
          <div className="bloqueo-suscripcion">
            <h2>Acceso suspendido</h2>
            <p>{estadoSuscripcion.mensaje}</p>
            <button className="btn btn-primary" onClick={() => setPagando(true)}>Pagar suscripción</button>
            {talleres.length > 1 && <button className="btn btn-primary" onClick={() => setEligiendo(true)}>Entrar a otro taller</button>}
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {mostrarSelector && talleres.length > 0 && (
        <div className="modal-backdrop selector-taller-fondo">
          <div className="selector-taller">
            <h2>¿A qué taller quieres entrar?</h2>
            <p className="selector-taller-sub">Tu usuario tiene acceso a {talleres.length} talleres.</p>
            <div className="selector-taller-lista">
              {talleres.map((t) => (
                <button
                  key={t.id_taller}
                  type="button"
                  className={"selector-taller-item" + (t.id_taller === user?.id_taller ? " actual" : "")}
                  disabled={t.bloqueado}
                  onClick={() => (t.id_taller === user?.id_taller ? (continuarEnTallerActual(), setEligiendo(false)) : seleccionarTaller(t.id_taller))}
                >
                  <span className="selector-taller-nombre">{t.nombre}</span>
                  <span className="selector-taller-meta">{t.rol}{t.bloqueado ? " · suspendido" : t.estado === "prueba" ? " · en prueba" : t.estado === "gracia" ? " · solo consulta" : ""}</span>
                  {t.id_taller === user?.id_taller && <span className="selector-taller-marca">actual</span>}
                </button>
              ))}
            </div>
            {!eligiendoTaller && <button type="button" className="btn-link" onClick={() => setEligiendo(false)}>Cancelar</button>}
          </div>
        </div>
      )}

      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
      {pagando && <PagarSuscripcion onClose={() => setPagando(false)} />}
    </div>
  );
}
>>>>>>> Stashed changes
