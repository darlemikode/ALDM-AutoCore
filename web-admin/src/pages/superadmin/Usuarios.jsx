import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import FormModal from "../../components/FormModal";
import { Cargando, useCargar } from "./comun";

const NUEVO = { es_superadmin: false };

export default function Usuarios() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const { datos, error } = useCargar(() => api.get("/superadmin/usuarios"));
  const lista = useMemo(() => (datos || []).filter((u) => !q || `${u.username} ${u.nombre_completo} ${u.correo || ""}`.toLowerCase().includes(q.toLowerCase())), [datos, q]);

  async function crear(v) {
    const u = await api.post("/superadmin/usuarios", {
      username: v.username, password: v.password, nombre_completo: v.nombre_completo,
      telefono: v.telefono || null, correo: v.correo || null, es_superadmin: !!v.es_superadmin, membresias: [],
    });
    navigate(`/superadmin/usuarios/${u.id_usuario}`);
  }

  return (
    <>
      <div className="toolbar">
        <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Usuario, nombre o correo" />
        <button className="btn btn-primary" onClick={() => setNuevo(true)}>+ Nuevo usuario</button>
      </div>
      {!datos ? <Cargando error={error} /> : (
        <div className="sa-tabla">
          <table>
            <thead><tr><th>Usuario</th><th>Talleres</th><th></th></tr></thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id_usuario} className="sa-fila-link" onClick={() => navigate(`/superadmin/usuarios/${u.id_usuario}`)}>
                  <td><strong>{u.nombre_completo}</strong><div className="sa-sub">@{u.username}</div></td>
                  <td>{u.membresias.length === 0 ? "sin talleres" : u.membresias.map((m) => m.taller?.nombre_comercial).join(", ")}</td>
                  <td>
                    {u.es_superadmin && <span className="badge badge-blue">súper admin</span>}{" "}
                    {!u.activo && <span className="badge badge-grey">inactivo</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nuevo && (
        <FormModal
          title="Nuevo usuario"
          subtitulo="Después le asignas a qué talleres puede entrar."
          icono="👤"
          initialValues={NUEVO}
          fields={[
            { name: "nombre_completo", label: "Nombre completo", required: true, full: true },
            { name: "username", label: "Usuario", required: true },
            { name: "password", label: "Contraseña", type: "password", required: true, hint: "Mínimo 6 caracteres" },
            { name: "telefono", label: "Teléfono" },
            { name: "correo", label: "Correo", type: "email" },
            { name: "es_superadmin", label: "Súper administrador de ALDM", type: "checkbox" },
          ]}
          onSubmit={crear}
          onClose={() => setNuevo(false)}
        />
      )}
    </>
  );
}
