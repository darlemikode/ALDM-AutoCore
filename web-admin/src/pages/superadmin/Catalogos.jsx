// Paquetes (precio y módulos), tipos de cobro y módulos del sistema.
import { useState } from "react";
import { api } from "../../api";
import FormModal from "../../components/FormModal";
import { useUI } from "../../context/UIContext";
import { Cargando, fmt, useCargar } from "./comun";

const calculado = (mensual, t) => (Number(mensual) || 0) * t.meses * (1 - (t.descuento_porcentaje || 0) / 100);

export default function Catalogos() {
  const { confirmDialog, notify } = useUI();
  const [modal, setModal] = useState(null); // { tipo: "paquete"|"tipo"|"modulo", item, iniciales }
  const { datos, error, recargar } = useCargar(async () => {
    const [paquetes, tipos, modulos] = await Promise.all([api.get("/superadmin/paquetes"), api.get("/superadmin/tipos-cobro"), api.get("/superadmin/modulos")]);
    return { paquetes, tipos, modulos };
  });
  if (!datos) return <Cargando error={error} />;
  const { paquetes, tipos, modulos } = datos;

  async function guardar(endpoint, idItem, cuerpo) {
    if (idItem) await api.put(`${endpoint}/${idItem}`, cuerpo);
    else await api.post(endpoint, cuerpo);
    setModal(null);
    recargar();
    notify("Guardado.", "success");
  }
  async function eliminar(endpoint, idItem, nombre) {
    const ok = await confirmDialog(`¿Eliminar "${nombre}"?`, { danger: true });
    if (!ok) return;
    try { await api.del(`${endpoint}/${idItem}`); recargar(); } catch (err) { notify(err.message, "error"); }
  }
  const editarPaquete = (p) => {
    const v = p ? { ...p, modulos: (p.modulos || []).map((m) => m.clave) } : { activo: true, modulos: [] };
    (p?.precios || []).forEach((x) => { v[`precio_${x.id_tipo_cobro}`] = x.precio; });
    setModal({ tipo: "paquete", item: p, iniciales: v });
  };

  return (
    <>
      <div className="panel">
        <div className="sa-titulo-fila">
          <h2 className="sa-titulo">Paquetes</h2>
          <button className="btn btn-primary btn-sm" onClick={() => editarPaquete(null)}>+ Nuevo paquete</button>
        </div>
        <div className="sa-tabla">
          <table>
            <thead><tr><th>Paquete</th><th>Precios</th><th>Módulos</th><th></th></tr></thead>
            <tbody>
              {paquetes.map((p) => (
                <tr key={p.id_paquete}>
                  <td><strong>{p.nombre}</strong>{!p.activo && <> <span className="badge badge-grey">no se ofrece</span></>}{p.limite_usuarios && <div className="sa-sub">hasta {p.limite_usuarios} usuarios</div>}</td>
                  <td className="sa-sub">{tipos.filter((t) => t.activo).map((t) => {
                    const fijo = p.precios?.find((x) => x.id_tipo_cobro === t.id_tipo_cobro);
                    return <div key={t.id_tipo_cobro}>{t.nombre}: {fmt(fijo ? fijo.precio : calculado(p.precio_mensual, t))}</div>;
                  })}</td>
                  <td className="sa-sub">{p.modulos.map((m) => m.nombre).join(", ") || "—"}</td>
                  <td><div className="row-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => editarPaquete(p)}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => eliminar("/superadmin/paquetes", p.id_paquete, p.nombre)}>Eliminar</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sa-columnas">
        <div className="panel">
          <div className="sa-titulo-fila">
            <h2 className="sa-titulo">Tipos de cobro</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setModal({ tipo: "tipo", item: null, iniciales: { meses: 1, descuento_porcentaje: 0, activo: true, orden: 0 } })}>+ Nuevo</button>
          </div>
          {tipos.map((t) => (
            <div key={t.id_tipo_cobro} className="sa-item">
              <span><strong>{t.nombre}</strong>{!t.activo && <> <span className="badge badge-grey">inactivo</span></>}
                <div className="sa-sub">Cada pago cubre {t.meses} mes{t.meses > 1 ? "es" : ""}{t.descuento_porcentaje ? ` · ${t.descuento_porcentaje}% de descuento` : ""}</div></span>
              <span className="row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setModal({ tipo: "tipo", item: t, iniciales: { ...t } })}>Editar</button>
                <button className="btn btn-danger btn-sm" onClick={() => eliminar("/superadmin/tipos-cobro", t.id_tipo_cobro, t.nombre)}>Eliminar</button>
              </span>
            </div>
          ))}
        </div>

        <div className="panel">
          <h2 className="sa-titulo">Módulos del sistema</h2>
          <div className="sa-sub" style={{ marginBottom: 8 }}>Los define el sistema; aquí solo cambias cómo se muestran.</div>
          {modulos.map((m) => (
            <div key={m.id_modulo} className="sa-item">
              <span><strong>{`${m.icono || ""} ${m.nombre}`.trim()}</strong><div className="sa-sub">{m.descripcion}</div></span>
              <button className="btn btn-secondary btn-sm" onClick={() => setModal({ tipo: "modulo", item: m, iniciales: { ...m } })}>Editar</button>
            </div>
          ))}
        </div>
      </div>

      {modal?.tipo === "paquete" && (
        <FormModal
          title={modal.item ? "Editar paquete" : "Nuevo paquete"} icono="📦" initialValues={modal.iniciales}
          grupos={{ plan: { icono: "📦", titulo: "Paquete" }, precios: { icono: "💲", titulo: "Precios por tipo de cobro", acento: "acento-teal" }, modulos: { icono: "🧩", titulo: "Qué incluye", acento: "acento-ambar" } }}
          fields={(v) => [
            { name: "nombre", label: "Nombre del paquete", required: true, grupo: "plan" },
            { name: "limite_usuarios", label: "Límite de usuarios", type: "number", hint: "Vacío = sin límite", grupo: "plan" },
            { name: "descripcion", label: "Descripción", type: "textarea", full: true, grupo: "plan" },
            { name: "activo", label: "Se ofrece a talleres nuevos", type: "checkbox", grupo: "plan" },
            { name: "precio_mensual", label: "Precio mensual (base)", type: "number", required: true, grupo: "precios" },
            ...tipos.filter((t) => t.activo || v[`precio_${t.id_tipo_cobro}`] != null).map((t) => ({
              name: `precio_${t.id_tipo_cobro}`, label: `Precio ${t.nombre.toLowerCase()} (${t.meses} mes${t.meses > 1 ? "es" : ""})`, type: "number", grupo: "precios",
              hint: `Vacío = ${fmt(calculado(v.precio_mensual, t))}${t.descuento_porcentaje ? ` (−${t.descuento_porcentaje}%)` : ""}`,
            })),
            { name: "modulos", label: "Módulos incluidos", type: "multiselect", full: true, grupo: "modulos",
              options: modulos.map((m) => ({ value: m.clave, label: `${m.icono || ""} ${m.nombre}`.trim() })) },
          ]}
          onSubmit={(v) => guardar("/superadmin/paquetes", modal.item?.id_paquete, {
            nombre: v.nombre, descripcion: v.descripcion || null, precio_mensual: Number(v.precio_mensual) || 0,
            limite_usuarios: v.limite_usuarios ? Number(v.limite_usuarios) : null, activo: !!v.activo, modulos: v.modulos || [],
            precios: tipos.filter((t) => v[`precio_${t.id_tipo_cobro}`] !== null && v[`precio_${t.id_tipo_cobro}`] !== undefined && v[`precio_${t.id_tipo_cobro}`] !== "")
              .map((t) => ({ id_tipo_cobro: t.id_tipo_cobro, precio: Number(v[`precio_${t.id_tipo_cobro}`]) })),
          })}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === "tipo" && (
        <FormModal
          title={modal.item ? "Editar tipo de cobro" : "Nuevo tipo de cobro"} icono="🔁" initialValues={modal.iniciales}
          fields={[
            { name: "nombre", label: "Nombre (ej. Mensual, Anual)", required: true },
            { name: "meses", label: "Meses que cubre cada pago", type: "number", required: true },
            { name: "descuento_porcentaje", label: "Descuento %", type: "number" },
            { name: "orden", label: "Orden en la lista", type: "number" },
            { name: "activo", label: "Disponible", type: "checkbox" },
          ]}
          onSubmit={(v) => guardar("/superadmin/tipos-cobro", modal.item?.id_tipo_cobro, {
            nombre: v.nombre, meses: Number(v.meses) || 1, descuento_porcentaje: Number(v.descuento_porcentaje) || 0, activo: !!v.activo, orden: Number(v.orden) || 0,
          })}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === "modulo" && (
        <FormModal
          title="Editar módulo" icono="🧩" initialValues={modal.iniciales}
          fields={[
            { name: "clave", label: "Clave del sistema", disabled: true },
            { name: "nombre", label: "Nombre que ven los talleres", required: true },
            { name: "icono", label: "Ícono (emoji)" },
            { name: "orden", label: "Orden", type: "number" },
            { name: "descripcion", label: "Descripción", type: "textarea", full: true },
          ]}
          onSubmit={(v) => guardar("/superadmin/modulos", modal.item.id_modulo, { nombre: v.nombre, descripcion: v.descripcion || null, icono: v.icono || null, orden: Number(v.orden) || 0 })}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
