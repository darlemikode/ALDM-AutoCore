import { IconoAuto } from "../components/Icono";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import { AccionesModulo, ICONO_ROL_BASE, detalleModulo, infoModulo } from "../components/permisosUI";
import IconoModulo from "../components/IconoModulo";

// Mismo ciclo de acentos que Roles y permisos
const COLORES = ["petrol", "teal", "warn", "violet", "blue"];
function acentoDe(indice) {
  const c = COLORES[indice % COLORES.length];
  return { "--acc": `var(--${c}-600)`, "--acc-soft": `var(--${c}-100)` };
}

function iniciales(nombre) {
  return (nombre || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/**
 * Asignación de roles — mismo diseño maestro/detalle que Roles y permisos:
 * a la izquierda los usuarios, a la derecha el rol elegido para el usuario
 * seleccionado y, debajo, lo que ese rol le permite hacer (solo lectura).
 */
export default function AsignacionRoles() {
  const { notify } = useUI();
  const { user: usuarioActual, hasPermission } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null); // id_usuario
  const [rolElegido, setRolElegido] = useState(null); // id_rol en edición
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const puedeEditar = hasPermission("usuarios.editar");

  async function load(idMantener) {
    setLoading(true);
    try {
      const [u, r, p] = await Promise.all([api.get("/auth/usuarios"), api.get("/auth/roles"), api.get("/auth/permisos")]);
      setUsuarios(u);
      setRoles(r);
      setPermisos(p);
      const actual = u.find((x) => x.id_usuario === idMantener) || u[0];
      if (actual) {
        setSeleccionado(actual.id_usuario);
        setRolElegido(actual.rol?.id_rol ?? null);
      }
    } catch (err) {
      notify(`No se pudo cargar: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const usuario = usuarios.find((u) => u.id_usuario === seleccionado);
  const esYo = usuario && (usuario.id_usuario === usuarioActual?.id_usuario || usuario.username === usuarioActual?.username);
  const editable = puedeEditar && !esYo && usuario?.activo;
  const rol = roles.find((r) => r.id_rol === rolElegido);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => !q || u.nombre_completo.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.rol?.nombre || "").toLowerCase().includes(q));
  }, [usuarios, busqueda]);

  function seleccionar(u) {
    setSeleccionado(u.id_usuario);
    setRolElegido(u.rol?.id_rol ?? null);
  }

  // Un clic en el rol lo asigna de inmediato (sin botón de guardar).
  async function asignar(nuevoRol) {
    if (!usuario || guardando || nuevoRol.id_rol === usuario.rol?.id_rol) return;
    const anterior = usuario.rol;
    setRolElegido(nuevoRol.id_rol);
    setGuardando(true);
    try {
      const actualizado = await api.put(`/auth/usuarios/${usuario.id_usuario}`, { id_rol: nuevoRol.id_rol });
      setUsuarios((us) => us.map((u) => (u.id_usuario === actualizado.id_usuario ? actualizado : u)));
      notify(`${usuario.nombre_completo} ahora es "${nuevoRol.nombre}".`, "success");
    } catch (err) {
      setRolElegido(anterior?.id_rol ?? null);
      notify(err.message, "error");
    } finally {
      setGuardando(false);
    }
  }

  if (loading && usuarios.length === 0) return <div className="loading-text">Cargando…</div>;

  const modulos = [...new Set(permisos.map((p) => p.modulo))];
  const clavesRol = (rol?.permisos || []).map((p) => p.clave);

  return (
    <>
      <div className="page-header">
        <div className="page-header-titulo">
          <Link className="icon-btn" to="/configuracion" title="Volver a Configuración">←</Link>
          <div>
            <h1><IconoModulo ruta="/asignacion-roles" /> Asignación de roles</h1>
            <div className="subtitle">
              Quién es quién y qué rol tiene cada uno · <Link to="/roles">editar qué puede hacer cada rol →</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="roles-layout">
        <div>
          <input className="search-input" style={{ width: "100%", marginBottom: 8 }} placeholder="Buscar usuario o rol…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <div className="roles-lista">
            {filtrados.map((u) => {
              const indiceRol = roles.findIndex((r) => r.id_rol === u.rol?.id_rol);
              const yo = u.id_usuario === usuarioActual?.id_usuario || u.username === usuarioActual?.username;
              return (
                <button
                  type="button"
                  key={u.id_usuario}
                  onClick={() => seleccionar(u)}
                  className={`rol-card ${seleccionado === u.id_usuario ? "activo" : ""}`}
                  style={{ ...acentoDe(Math.max(indiceRol, 0)), opacity: u.activo ? 1 : 0.6 }}
                >
                  <span className="rol-card-icono asig-avatar">{iniciales(u.nombre_completo)}</span>
                  <span className="rol-card-info">
                    <span className="rol-card-nombre">
                      {u.nombre_completo}
                      {yo && <span className="badge badge-teal">Tú</span>}
                      {!u.activo && <span className="badge badge-grey">Inactivo</span>}
                    </span>
                    <span className="rol-card-meta">
                      <IconoAuto valor={ICONO_ROL_BASE[u.rol?.nombre] || "🛡️"} size={20} /> {u.rol?.nombre || "Sin rol"} · @{u.username}
                    </span>
                  </span>
                </button>
              );
            })}
            {filtrados.length === 0 && <div className="empty-state">Ningún usuario coincide.</div>}
          </div>
          <Link to="/usuarios" className="btn-nuevo-rol" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
            <IconoAuto valor="👤" size={18} /> Administrar usuarios
          </Link>
        </div>

        <div className="panel">
          {usuario ? (
            <>
              <div className="asig-cabecera">
                <span className="asig-avatar-grande" style={acentoDe(Math.max(roles.findIndex((r) => r.id_rol === usuario.rol?.id_rol), 0))}>
                  {iniciales(usuario.nombre_completo)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 19 }}>{usuario.nombre_completo}</h2>
                  <div className="cat-descripcion">
                    @{usuario.username}
                    {usuario.correo ? ` · ${usuario.correo}` : ""}
                    {usuario.telefono ? ` · ${usuario.telefono}` : ""}
                  </div>
                </div>
                <span className={`badge ${usuario.activo ? "badge-teal" : "badge-grey"}`}>{usuario.activo ? "Activo" : "Inactivo"}</span>
              </div>

              {esYo && <div className="field-hint" style={{ marginBottom: 14 }}>No puedes cambiar tu propio rol — pídeselo a otro administrador.</div>}
              {!usuario.activo && <div className="field-hint" style={{ marginBottom: 14 }}>Este usuario está inactivo; reactívalo en Usuarios para cambiarle el rol.</div>}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div className="cat-grupo-titulo">Rol asignado</div>
                {editable && (
                  <div className={`guardado-auto ${guardando ? "guardando" : ""}`}>
                    {guardando ? "Guardando…" : "Da clic en un rol para asignarlo"}
                  </div>
                )}
              </div>
              <div className="asig-roles">
                {roles.map((r, i) => (
                  <button
                    type="button"
                    key={r.id_rol}
                    disabled={!editable || guardando}
                    onClick={() => asignar(r)}
                    className={`asig-rol ${rolElegido === r.id_rol ? "activo" : ""}`}
                    style={acentoDe(i)}
                  >
                    <span className="asig-rol-icono"><IconoAuto valor={ICONO_ROL_BASE[r.nombre] || "🛡️"} size={20} /></span>
                    <span className="asig-rol-nombre">{r.nombre}</span>
                    <span className="asig-rol-meta">{r.permisos.length} permiso{r.permisos.length === 1 ? "" : "s"}</span>
                    {usuario.rol?.id_rol === r.id_rol && <span className="asig-rol-actual">Actual</span>}
                  </button>
                ))}
              </div>

              {rol && (
                <>
                  <div className="permisos-resumen" style={{ marginTop: 16 }}>
                    <div>
                      <div className="permisos-resumen-num">{clavesRol.length}</div>
                      <div className="rol-card-meta">de {permisos.length} permisos</div>
                    </div>
                    <div className="permisos-resumen-barra">
                      <div className="permisos-resumen-barra-fill" style={{ width: `${permisos.length ? Math.round((clavesRol.length / permisos.length) * 100) : 0}%` }} />
                    </div>
                    <div className="rol-card-meta" style={{ maxWidth: 260 }}>{rol.descripcion}</div>
                  </div>

                  {modulos.map((modulo, i) => {
                    const permisosModulo = permisos.filter((p) => p.modulo === modulo);
                    const activos = permisosModulo.filter((p) => clavesRol.includes(p.clave)).length;
                    if (activos === 0) return null;
                    return (
                      <div key={modulo} className="modulo-card" style={acentoDe(i)}>
                        <div className="modulo-card-header">
                          <span className="modulo-card-icono"><IconoAuto valor={infoModulo(modulo).icono} size={18} /></span>
                          <span className="modulo-card-titulo">
                            {infoModulo(modulo).nombre}
                            {detalleModulo(permisosModulo) && <span className="modulo-card-detalle">{detalleModulo(permisosModulo)}</span>}
                          </span>
                          <span className="modulo-card-contador">{activos}/{permisosModulo.length}</span>
                        </div>
                        <div className="modulo-card-body">
                          <AccionesModulo permisosModulo={permisosModulo} activos={clavesRol} editable={false} />
                        </div>
                      </div>
                    );
                  })}
                  {clavesRol.length === 0 && <div className="empty-state">Este rol no tiene ningún permiso asignado todavía.</div>}
                </>
              )}
            </>
          ) : (
            <div className="empty-state">Selecciona un usuario de la lista.</div>
          )}
        </div>
      </div>
    </>
  );
}
