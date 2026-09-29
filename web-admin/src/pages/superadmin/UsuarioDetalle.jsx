import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import FormModal from "../../components/FormModal";
import { useAuth } from "../../context/AuthContext";
import { useUI } from "../../context/UIContext";
import { Cargando, Dato, useCargar } from "./comun";

export default function UsuarioDetalle() {
  const { id: idTexto } = useParams();
  const id = Number(idTexto);
  const { user: yo } = useAuth();
  const { confirmDialog, notify } = useUI();
  const [modal, setModal] = useState(null); // { tipo, iniciales }
  const [roles, setRoles] = useState({}); // id_taller -> roles
  const { datos, setDatos, error } = useCargar(async () => {
    const [lista, talleres] = await Promise.all([api.get("/superadmin/usuarios"), api.get("/superadmin/talleres")]);
    const u = lista.find((x) => x.id_usuario === id);
    if (!u) throw new Error("Usuario no encontrado");
    return { u, talleres };
  }, [id]);
  if (!datos) return <Cargando error={error} />;
  const { u, talleres } = datos;
  const soyYo = yo?.username === u.username;
  const disponibles = talleres.filter((t) => !u.membresias.some((m) => m.id_taller === t.id_taller));

  async function actualizar(cuerpo) {
    try {
      setDatos({ ...datos, u: await api.put(`/superadmin/usuarios/${id}`, cuerpo) });
    } catch (err) { notify(err.message, "error"); throw err; }
  }
  async function guardarMembresias(lista) {
    try {
      const actualizado = await api.put(`/superadmin/usuarios/${id}/talleres`, lista.map((m) => ({ id_taller: m.id_taller, id_rol: m.id_rol, activo: m.activo })));
      setDatos({ ...datos, u: actualizado });
    } catch (err) { notify(err.message, "error"); }
  }
  async function cargarRoles(idTaller) {
    if (roles[idTaller]) return;
    try {
      const r = await api.get(`/superadmin/talleres/${idTaller}/roles`);
      setRoles((x) => ({ ...x, [idTaller]: r }));
    } catch (err) { notify(err.message, "error"); }
  }
  async function quitar(m) {
    const ok = await confirmDialog(`${u.username} ya no podrá entrar a ${m.taller?.nombre_comercial}.`, { title: "Quitar acceso", danger: true });
    if (ok) guardarMembresias(u.membresias.filter((x) => x.id_taller !== m.id_taller));
  }

  return (
    <>
      <div style={{ marginBottom: 12 }}><Link to="/superadmin/usuarios">← Usuarios</Link></div>
      <div className="panel">
        <h2 style={{ fontSize: 24 }}>{u.nombre_completo}</h2>
        <Dato etiqueta="Usuario">@{u.username}</Dato>
        <Dato etiqueta="Teléfono">{u.telefono}</Dato>
        <Dato etiqueta="Correo">{u.correo}</Dato>
        <label className="sa-check"><input type="checkbox" checked={u.activo} disabled={soyYo} onChange={(e) => actualizar({ activo: e.target.checked }).catch(() => {})} /> Cuenta activa</label>
        <label className="sa-check"><input type="checkbox" checked={u.es_superadmin} disabled={soyYo} onChange={(e) => actualizar({ es_superadmin: e.target.checked }).catch(() => {})} /> Súper administrador</label>
        <div className="sa-acciones">
          <button className="btn btn-secondary" onClick={() => setModal({ tipo: "datos", iniciales: { nombre_completo: u.nombre_completo, telefono: u.telefono || "", correo: u.correo || "" } })}>Editar datos</button>
          <button className="btn btn-secondary" onClick={() => setModal({ tipo: "password", iniciales: {} })}>Nueva contraseña</button>
        </div>
      </div>

      <div className="panel">
        <div className="sa-titulo-fila">
          <h2 className="sa-titulo">Talleres ({u.membresias.length})</h2>
          {disponibles.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setModal({ tipo: "taller", iniciales: {} })}>+ Dar acceso</button>}
        </div>
        {u.membresias.length === 0 ? <div className="subtitle">No tiene acceso a ningún taller.</div> : (
          <div className="sa-tabla">
            <table>
              <thead><tr><th>Taller</th><th>Rol</th><th>Acceso</th><th></th></tr></thead>
              <tbody>
                {u.membresias.map((m) => (
                  <tr key={m.id_taller}>
                    <td><strong>{m.taller?.nombre_comercial}</strong></td>
                    <td>
                      <select value={m.id_rol ?? ""} onFocus={() => cargarRoles(m.id_taller)}
                        onChange={(e) => guardarMembresias(u.membresias.map((x) => (x.id_taller === m.id_taller ? { ...x, id_rol: Number(e.target.value) } : x)))}>
                        {!roles[m.id_taller] && <option value={m.id_rol ?? ""}>{m.rol?.nombre || "—"}</option>}
                        {(roles[m.id_taller] || []).map((r) => <option key={r.id_rol} value={r.id_rol}>{r.nombre}</option>)}
                      </select>
                    </td>
                    <td><input type="checkbox" checked={m.activo} onChange={(e) => guardarMembresias(u.membresias.map((x) => (x.id_taller === m.id_taller ? { ...x, activo: e.target.checked } : x)))} /></td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => quitar(m)}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.tipo === "datos" && (
        <FormModal title="Datos del usuario" icono="👤" initialValues={modal.iniciales}
          fields={[{ name: "nombre_completo", label: "Nombre completo", required: true, full: true }, { name: "telefono", label: "Teléfono" }, { name: "correo", label: "Correo", type: "email" }]}
          onSubmit={async (v) => { await actualizar({ nombre_completo: v.nombre_completo, telefono: v.telefono || null, correo: v.correo || null }); setModal(null); }}
          onClose={() => setModal(null)} />
      )}
      {modal?.tipo === "password" && (
        <FormModal title="Nueva contraseña" subtitulo="Compártela con el usuario por un medio seguro." icono="🔑" initialValues={modal.iniciales}
          fields={[{ name: "password", label: "Contraseña nueva", type: "password", required: true, hint: "Mínimo 6 caracteres" }]}
          onSubmit={async (v) => { await actualizar({ password: v.password }); setModal(null); notify("Contraseña cambiada.", "success"); }}
          onClose={() => setModal(null)} />
      )}
      {modal?.tipo === "taller" && (
        <FormModal title="Dar acceso a un taller" subtitulo="Entra como Administrador General; después puedes cambiarle el rol." icono="🏢" initialValues={modal.iniciales}
          fields={[{ name: "id_taller", label: "Taller", type: "select", required: true, options: disponibles.map((t) => ({ value: t.id_taller, label: t.nombre_comercial })) }]}
          onSubmit={async (v) => { await guardarMembresias([...u.membresias, { id_taller: Number(v.id_taller), id_rol: null, activo: true }]); setModal(null); }}
          onClose={() => setModal(null)} />
      )}
    </>
  );
}
