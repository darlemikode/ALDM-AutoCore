// Paquetes (precio y módulos), tipos de cobro y módulos del sistema.
import { useState } from "react";
import { api } from "../../api";
import FormModal from "../../components/FormModal";
import { IconoModuloSistema } from "../../components/IconoModulo";
import { useUI } from "../../context/UIContext";
import { Cargando, fmt, useCargar } from "./comun";
import PaqueteModal from "./PaqueteModal";

const calculado = (mensual, t) => (Number(mensual) || 0) * t.meses * (1 - (t.descuento_porcentaje || 0) / 100);

export default function Catalogos() {
  const { confirmDialog, notify } = useUI();
  const [filtroMod, setFiltroMod] = useState("");
  const [filtroPaq, setFiltroPaq] = useState(""); // "" = todos · id de paquete · "ninguno"
  const [verTodos, setVerTodos] = useState(null); // paquete con todos sus módulos desplegados
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
  const editarPaquete = (p) => setModal({ tipo: "paquete", item: p });

  return (
    <>
      <div className="panel">
        <div className="sa-titulo-fila">
          <h2 className="sa-titulo">Paquetes</h2>
          <button className="btn btn-primary btn-sm" onClick={() => editarPaquete(null)}>+ Nuevo paquete</button>
        </div>
        <div className="pk-grid">
          {paquetes.map((p) => {
            const activosTipos = tipos.filter((t) => t.activo);
            const precioDe = (t) => { const fijo = p.precios?.find((x) => x.id_tipo_cobro === t.id_tipo_cobro); return fijo ? fijo.precio : calculado(p.precio_mensual, t); };
            const mods = p.modulos || [];
            const abierto = verTodos === p.id_paquete;
            const mostrados = abierto ? mods : mods.slice(0, 8);
            return (
              <article key={p.id_paquete} className={`pk-card ${p.activo ? "" : "pk-card-oculto"}`}>
                <header className="pk-cab">
                  <div>
                    <h3>{p.nombre}</h3>
                    <div className="pk-metas">
                      {!p.activo && <span className="badge badge-grey">no se ofrece</span>}
                      <span>{p.limite_usuarios ? `hasta ${p.limite_usuarios} usuarios` : "usuarios ilimitados"}</span>
                      <span>· {mods.length} módulo{mods.length === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  <div className="pk-precio"><b>{fmt(p.precio_mensual)}</b><small>/ mes + IVA</small></div>
                </header>
                {p.descripcion && <p className="pk-desc">{p.descripcion}</p>}
                <div className="pk-cobros">
                  {activosTipos.map((t) => (
                    <div key={t.id_tipo_cobro} className="pk-cobro">
                      <small>{t.nombre}</small><b>{fmt(precioDe(t))}</b>
                      {t.descuento_porcentaje > 0 && <i>−{Number(t.descuento_porcentaje).toFixed(t.descuento_porcentaje % 1 ? 2 : 0)}%</i>}
                    </div>
                  ))}
                </div>
                <div className="pk-modulos">
                  {mostrados.map((m) => <span key={m.clave} className="pk-mod" title={m.nombre}><IconoModuloSistema clave={m.clave} size={13} />{m.nombre}</span>)}
                  {mods.length > 8 && <button type="button" className="pk-mas" onClick={() => setVerTodos(abierto ? null : p.id_paquete)}>{abierto ? "Ver menos" : `+${mods.length - 8} más`}</button>}
                  {mods.length === 0 && <span className="sa-sub">Sin módulos.</span>}
                </div>
                <footer className="pk-pie">
                  <button className="btn btn-secondary btn-sm" onClick={() => editarPaquete(p)}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => eliminar("/superadmin/paquetes", p.id_paquete, p.nombre)}>Eliminar</button>
                </footer>
              </article>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="sa-titulo-fila">
          <div>
            <h2 className="sa-titulo">Tipos de cobro</h2>
            <div className="sa-sub">Cada cuántos meses se paga y qué descuento tiene.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ tipo: "tipo", item: null, iniciales: { meses: 1, descuento_porcentaje: 0, activo: true, orden: 0 } })}>+ Nuevo</button>
        </div>
        <div className="tc-grid">
          {tipos.map((t) => (
            <article key={t.id_tipo_cobro} className={`tc-card ${t.activo ? "" : "tc-card-off"}`}>
              <div className="tc-meses"><b>{t.meses}</b><small>mes{t.meses > 1 ? "es" : ""}</small></div>
              <div className="tc-info">
                <strong>{t.nombre}</strong>
                <span className="sa-sub">Cada pago cubre {t.meses} mes{t.meses > 1 ? "es" : ""}</span>
                <span className="tc-chips">
                  {t.descuento_porcentaje > 0 ? <em className="tc-desc">−{Number(t.descuento_porcentaje).toFixed(t.descuento_porcentaje % 1 ? 2 : 0)}% de descuento</em> : <em className="tc-sin">Sin descuento</em>}
                  {!t.activo && <span className="badge badge-grey">inactivo</span>}
                </span>
              </div>
              <div className="tc-acc">
                <button className="btn btn-secondary btn-sm" onClick={() => setModal({ tipo: "tipo", item: t, iniciales: { ...t } })}>Editar</button>
                <button className="btn btn-danger btn-sm" onClick={() => eliminar("/superadmin/tipos-cobro", t.id_tipo_cobro, t.nombre)}>Eliminar</button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="sa-titulo-fila">
          <div>
            <h2 className="sa-titulo">Módulos del sistema <span className="sa-sub">({modulos.length})</span></h2>
            <div className="sa-sub">Los define el sistema; aquí solo cambias cómo se muestran.</div>
          </div>
          <input className="pq-buscar" value={filtroMod} onChange={(e) => setFiltroMod(e.target.value)} placeholder="Buscar módulo…" aria-label="Buscar módulo" />
        </div>
        <div className="md-filtros" role="group" aria-label="Filtrar por paquete">
          <span className="md-filtros-etq">Incluido en</span>
          {[["", "Todos", modulos.length], ...paquetes.map((p) => [String(p.id_paquete), p.nombre, modulos.filter((m) => (p.modulos || []).some((x) => x.clave === m.clave)).length]),
            ["ninguno", "Sin paquete", modulos.filter((m) => !paquetes.some((p) => (p.modulos || []).some((x) => x.clave === m.clave))).length]].map(([v, txt, n]) => (
            <button key={v || "todos"} type="button" className={`md-filtro ${filtroPaq === v ? "md-filtro-on" : ""}`} aria-pressed={filtroPaq === v} onClick={() => setFiltroPaq(v)}>{txt} <b>{n}</b></button>
          ))}
        </div>
        <div className="md-grid">
          {modulos.filter((m) => {
            if (filtroMod.trim() && !`${m.nombre} ${m.descripcion || ""}`.toLowerCase().includes(filtroMod.trim().toLowerCase())) return false;
            if (!filtroPaq) return true;
            const dentro = paquetes.filter((p) => (p.modulos || []).some((x) => x.clave === m.clave));
            return filtroPaq === "ninguno" ? dentro.length === 0 : dentro.some((p) => String(p.id_paquete) === filtroPaq);
          }).map((m) => {
            const enPaquetes = paquetes.filter((p) => (p.modulos || []).some((x) => x.clave === m.clave));
            return (
              <article key={m.id_modulo} className="md-card">
                <IconoModuloSistema clave={m.clave} size={20} />
                <div className="md-info">
                  <strong>{m.nombre}</strong>
                  <p>{m.descripcion}</p>
                  <div className="md-paquetes">
                    {enPaquetes.length === 0 ? <span className="md-ninguno">En ningún paquete</span> : enPaquetes.map((p) => <span key={p.id_paquete} className="md-paq">{p.nombre}</span>)}
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setModal({ tipo: "modulo", item: m, iniciales: { ...m } })}>Editar</button>
              </article>
            );
          })}
        </div>
      </div>

      {modal?.tipo === "paquete" && (
        <PaqueteModal
          item={modal.item} tipos={tipos} modulos={modulos}
          onSubmit={(cuerpo) => guardar("/superadmin/paquetes", modal.item?.id_paquete, cuerpo)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === "tipo" && (
        <FormModal tema="sa"
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
        <FormModal tema="sa"
          title="Editar módulo" icono="🧩" initialValues={modal.iniciales}
          fields={[
            { name: "clave", label: "Clave del sistema", disabled: true },
            { name: "nombre", label: "Nombre que ven los talleres", required: true },
            { name: "orden", label: "Orden", type: "number" },
            { name: "descripcion", label: "Descripción", type: "textarea", full: true },
          ]}
          onSubmit={(v) => guardar("/superadmin/modulos", modal.item.id_modulo, { nombre: v.nombre, descripcion: v.descripcion || null, orden: Number(v.orden) || 0 })}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
