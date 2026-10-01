import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import { AccionesModulo, ICONO_ROL_BASE, detalleModulo, infoModulo } from "../components/permisosUI";
import IconoModulo from "../components/IconoModulo";

// Ciclo de acentos de color — igual que los badges del resto de la app,
// más violeta/azul para tener variedad suficiente entre roles y módulos
// sin salirse de la paleta ya establecida.
const COLORES = ["petrol", "teal", "warn", "violet", "blue"];
function acentoDe(indice) {
  const c = COLORES[indice % COLORES.length];
  return { "--acc": `var(--${c}-600)`, "--acc-soft": `var(--${c}-100)` };
}

export default function Roles() {
  const { confirmDialog, notify } = useUI();
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null); // id_rol activo en el panel de edición
  const [borrador, setBorrador] = useState({ nombre: "", descripcion: "", permisos: [] });
  const [creando, setCreando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [estadoGuardado, setEstadoGuardado] = useState(""); // "" | "guardando" | "guardado"
  const puedeEditar = hasPermission("roles.editar");

  async function load() {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([api.get("/auth/roles"), api.get("/auth/permisos")]);
      setRoles(r);
      setPermisos(p);
      return r;
    } catch (err) {
      notify(`No se pudo cargar: ${err.message}`, "error");
      return [];
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().then((r) => {
      if (r.length > 0) seleccionar(r[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function seleccionar(rol) {
    setCreando(false);
    setSeleccionado(rol.id_rol);
    setBorrador({ nombre: rol.nombre, descripcion: rol.descripcion || "", permisos: rol.permisos.map((p) => p.clave) });
  }

  function iniciarNuevoRol() {
    setCreando(true);
    setSeleccionado(null);
    setBorrador({ nombre: "", descripcion: "", permisos: [] });
  }

  // Guardado automático: cada clic en un permiso (o en "Marcar/Quitar
  // todos") se guarda de inmediato; nombre y descripción, al salir del campo.
  async function persistir(cambios, anterior) {
    if (creando || !seleccionado) return;
    setEstadoGuardado("guardando");
    try {
      const actualizado = await api.put(`/auth/roles/${seleccionado}`, cambios);
      setRoles((rs) => rs.map((r) => (r.id_rol === actualizado.id_rol ? actualizado : r)));
      setEstadoGuardado("guardado");
      setTimeout(() => setEstadoGuardado((e) => (e === "guardado" ? "" : e)), 1800);
    } catch (err) {
      setEstadoGuardado("");
      if (anterior) setBorrador(anterior);
      notify(err.message, "error");
    }
  }

  function cambiarPermisos(nuevos) {
    const anterior = borrador;
    setBorrador({ ...borrador, permisos: nuevos });
    persistir({ permisos: nuevos }, anterior);
  }

  function alternarPermiso(clave) {
    const p = borrador.permisos;
    cambiarPermisos(p.includes(clave) ? p.filter((c) => c !== clave) : [...p, clave]);
  }

  function alternarModulo(clavesModulo, todasActivas) {
    const p = borrador.permisos;
    cambiarPermisos(todasActivas ? p.filter((c) => !clavesModulo.includes(c)) : Array.from(new Set([...p, ...clavesModulo])));
  }

  function guardarTexto() {
    const rol = roles.find((r) => r.id_rol === seleccionado);
    if (!rol || creando) return;
    const nombre = borrador.nombre.trim();
    if (!nombre) {
      notify("El rol necesita un nombre.", "error");
      setBorrador((b) => ({ ...b, nombre: rol.nombre }));
      return;
    }
    if (nombre === rol.nombre && borrador.descripcion === (rol.descripcion || "")) return;
    persistir({ nombre, descripcion: borrador.descripcion }, { ...borrador, nombre: rol.nombre, descripcion: rol.descripcion || "" });
  }

  async function guardar() {
    if (!borrador.nombre.trim()) {
      notify("Ponle un nombre al rol.", "error");
      return;
    }
    try {
      if (creando) {
        const nuevo = await api.post("/auth/roles", borrador);
        notify(`Rol "${nuevo.nombre}" creado.`, "success");
        const actualizados = await load();
        const creado = actualizados.find((r) => r.id_rol === nuevo.id_rol);
        if (creado) seleccionar(creado);
      }
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function eliminar() {
    const rol = roles.find((r) => r.id_rol === seleccionado);
    if (!rol) return;
    const ok = await confirmDialog(`¿Eliminar el rol "${rol.nombre}"? Esto no se puede deshacer.`, { danger: true });
    if (!ok) return;
    try {
      await api.del(`/auth/roles/${seleccionado}`);
      notify("Rol eliminado.", "success");
      const actualizados = await load();
      if (actualizados.length > 0) seleccionar(actualizados[0]);
      else { setSeleccionado(null); setBorrador({ nombre: "", descripcion: "", permisos: [] }); }
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const rolActual = roles.find((r) => r.id_rol === seleccionado);
  const modulos = [...new Set(permisos.map((p) => p.modulo))];

  const modulosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return modulos;
    return modulos.filter((modulo) => {
      if (modulo.toLowerCase().includes(q)) return true;
      return permisos.some((p) => p.modulo === modulo && p.descripcion.toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, modulos, permisos]);

  if (loading) return <div className="loading-text">Cargando…</div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-titulo">
          <Link className="icon-btn" to="/configuracion" title="Volver a Configuración">←</Link>
          <div>
            <h1><IconoModulo ruta="/roles" /> Roles y permisos</h1>
            <div className="subtitle">Administrador General, Jefe de Taller, Asesor de Servicio, Técnico, y cualquier rol adicional que necesites</div>
          </div>
        </div>
        {puedeEditar && <button className="btn btn-primary" onClick={iniciarNuevoRol}>➕ Nuevo rol</button>}
      </div>

      <div className="roles-layout">
        <div>
          <div className="roles-lista">
            {roles.map((r, i) => (
              <button
                type="button"
                key={r.id_rol}
                onClick={() => seleccionar(r)}
                className={`rol-card ${seleccionado === r.id_rol && !creando ? "activo" : ""}`}
                style={acentoDe(i)}
              >
                <span className="rol-card-icono">{ICONO_ROL_BASE[r.nombre] || "🛡️"}</span>
                <span className="rol-card-info">
                  <span className="rol-card-nombre">
                    {r.nombre}
                    {r.es_sistema && <span className="badge badge-grey">Base</span>}
                  </span>
                  <span className="rol-card-meta">{r.permisos.length} permiso{r.permisos.length === 1 ? "" : "s"} activo{r.permisos.length === 1 ? "" : "s"}</span>
                </span>
              </button>
            ))}
          </div>
          {puedeEditar && (
            <button type="button" className="btn-nuevo-rol" onClick={iniciarNuevoRol}>
              ➕ Crear rol nuevo
            </button>
          )}
        </div>

        <div className="panel">
          {(rolActual || creando) ? (
            <>
              <div className="form-grid" style={{ marginBottom: 16 }}>
                <div className="field">
                  <label>Nombre del rol</label>
                  <input
                    value={borrador.nombre}
                    disabled={!puedeEditar}
                    onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))}
                    onBlur={guardarTexto}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </div>
                <div className="field full">
                  <label>Descripción</label>
                  <input
                    value={borrador.descripcion}
                    disabled={!puedeEditar}
                    onChange={(e) => setBorrador((b) => ({ ...b, descripcion: e.target.value }))}
                    onBlur={guardarTexto}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </div>
              </div>

              {!creando && rolActual?.es_sistema && (
                <div className="field-hint" style={{ marginBottom: 14 }}>
                  Este es uno de los 4 roles base del taller (Administrador General / Jefe de Taller / Asesor de Servicio / Técnico) — se puede ajustar qué permisos tiene, pero no se puede eliminar.
                </div>
              )}

              <div className="permisos-resumen">
                <div>
                  <div className="permisos-resumen-num">{borrador.permisos.length}</div>
                  <div className="rol-card-meta">de {permisos.length} permisos</div>
                </div>
                {!creando && puedeEditar && (
                  <div className={`guardado-auto ${estadoGuardado}`}>
                    {estadoGuardado === "guardando" ? "Guardando…" : estadoGuardado === "guardado" ? "✓ Guardado" : "Se guarda al dar clic"}
                  </div>
                )}
                <div className="permisos-resumen-barra">
                  <div
                    className="permisos-resumen-barra-fill"
                    style={{ width: `${permisos.length ? Math.round((borrador.permisos.length / permisos.length) * 100) : 0}%` }}
                  />
                </div>
                <input
                  className="search-input"
                  style={{ maxWidth: 220 }}
                  placeholder="🔍 Buscar módulo o permiso…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>

              {modulosFiltrados.map((modulo) => {
                const indiceModulo = modulos.indexOf(modulo);
                const permisosModulo = permisos.filter((p) => p.modulo === modulo);
                const clavesModulo = permisosModulo.map((p) => p.clave);
                const activosModulo = clavesModulo.filter((c) => borrador.permisos.includes(c)).length;
                const todasActivas = activosModulo === clavesModulo.length;
                return (
                  <div key={modulo} className="modulo-card" style={acentoDe(indiceModulo)}>
                    <div className="modulo-card-header">
                      <span className="modulo-card-icono">{infoModulo(modulo).icono}</span>
                      <span className="modulo-card-titulo">
                        {infoModulo(modulo).nombre}
                        {detalleModulo(permisosModulo) && <span className="modulo-card-detalle">{detalleModulo(permisosModulo)}</span>}
                      </span>
                      <span className="modulo-card-contador">{activosModulo}/{clavesModulo.length}</span>
                      {puedeEditar && (
                        <button className="btn btn-secondary btn-sm" onClick={() => alternarModulo(clavesModulo, todasActivas)}>
                          {todasActivas ? "Quitar todos" : "Marcar todos"}
                        </button>
                      )}
                    </div>
                    <div className="modulo-card-body">
                      <AccionesModulo permisosModulo={permisosModulo} activos={borrador.permisos} editable={puedeEditar} onAlternar={alternarPermiso} />
                    </div>
                  </div>
                );
              })}

              {puedeEditar && (creando || !rolActual?.es_sistema) && (
                <div className="modal-actions" style={{ justifyContent: "flex-start", marginTop: 20 }}>
                  {creando && <button className="btn btn-primary" onClick={guardar}>Crear rol</button>}
                  {!creando && !rolActual?.es_sistema && (
                    <button className="btn btn-danger" onClick={eliminar}>Eliminar rol</button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">Selecciona un rol de la lista, o crea uno nuevo.</div>
          )}
        </div>
      </div>
    </>
  );
}
