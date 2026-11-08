// Alta / edición de un paquete: datos, precios por tipo de cobro y módulos incluidos.
import { useEffect, useState } from "react";
import ModalPortal from "../../components/ModalPortal";
import { Icono } from "../../components/Icono";
import { IconoModuloSistema } from "../../components/IconoModulo";
import { fmt } from "./comun";
import "./paqueteModal.css";

const calculado = (mensual, t) => (Number(mensual) || 0) * t.meses * (1 - (t.descuento_porcentaje || 0) / 100);

export default function PaqueteModal({ item, tipos, modulos, onSubmit, onClose }) {
  const [nombre, setNombre] = useState(item?.nombre || "");
  const [descripcion, setDescripcion] = useState(item?.descripcion || "");
  const [limite, setLimite] = useState(item?.limite_usuarios ?? "");
  const [activo, setActivo] = useState(item ? !!item.activo : true);
  const [mensual, setMensual] = useState(item?.precio_mensual ?? "");
  const [fijos, setFijos] = useState(() => Object.fromEntries((item?.precios || []).map((x) => [x.id_tipo_cobro, String(x.precio)])));
  const [sel, setSel] = useState(() => new Set((item?.modulos || []).map((m) => m.clave)));
  const [filtro, setFiltro] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const tecla = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onClose]);

  const visibles = tipos.filter((t) => t.activo || fijos[t.id_tipo_cobro] !== undefined);
  const alternar = (clave) => setSel((s) => { const n = new Set(s); if (n.has(clave)) n.delete(clave); else n.add(clave); return n; });
  const lista = modulos.filter((m) => !filtro.trim() || `${m.nombre} ${m.descripcion || ""}`.toLowerCase().includes(filtro.trim().toLowerCase()));

  async function guardar(e) {
    e.preventDefault();
    if (!nombre.trim()) return setError("Escribe el nombre del paquete.");
    if (mensual === "" || Number(mensual) < 0) return setError("Indica el precio mensual (sin IVA).");
    setError("");
    setGuardando(true);
    try {
      await onSubmit({
        nombre: nombre.trim(), descripcion: descripcion.trim() || null, precio_mensual: Number(mensual) || 0,
        limite_usuarios: limite !== "" && Number(limite) > 0 ? Number(limite) : null, activo, modulos: [...sel],
        precios: tipos.filter((t) => fijos[t.id_tipo_cobro] !== undefined && fijos[t.id_tipo_cobro] !== "")
          .map((t) => ({ id_tipo_cobro: t.id_tipo_cobro, precio: Number(fijos[t.id_tipo_cobro]) })),
      });
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
      setGuardando(false);
    }
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <form className="modal pq-modal" onSubmit={guardar} noValidate>
          <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={onClose}><Icono nombre="close" size={20} /></button>
          <header className="pq-cab">
            <span className="pq-cab-ico"><Icono nombre="cube" size={26} /></span>
            <div>
              <h2>{item ? "Editar paquete" : "Nuevo paquete"}</h2>
              <p>Define cuánto cuesta y qué módulos incluye para los talleres que lo contraten.</p>
            </div>
          </header>

          <div className="pq-cuerpo">
            <section className="pq-tarjeta">
              <h3><span className="pq-punto" />Datos del paquete</h3>
              <div className="pq-fila">
                <label className="pq-campo pq-crece">
                  <span>Nombre del paquete <b>*</b></span>
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Taller Pro" autoFocus />
                </label>
                <label className="pq-campo pq-ancho-limite">
                  <span>Límite de usuarios</span>
                  <input type="number" min="0" inputMode="numeric" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="Sin límite" />
                </label>
              </div>
              <label className="pq-campo">
                <span>Descripción</span>
                <textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Lo que verá el taller al elegir este paquete" />
              </label>
              <label className="pq-interruptor">
                <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
                <span className="pq-pista" aria-hidden="true"><i /></span>
                <span><b>Se ofrece a talleres nuevos</b><small>{activo ? "Aparece al contratar un plan." : "Oculto: solo lo conservan los talleres que ya lo tienen."}</small></span>
              </label>
            </section>

            <section className="pq-tarjeta">
              <h3><span className="pq-punto pq-punto-verde" />Precios <small>sin IVA</small></h3>
              <label className="pq-campo">
                <span>Precio mensual base <b>*</b></span>
                <div className="pq-dinero"><em>$</em><input type="number" min="0" step="0.01" inputMode="decimal" value={mensual} onChange={(e) => setMensual(e.target.value)} placeholder="0.00" /><u>/ mes</u></div>
              </label>
              <div className="pq-tabla" role="group" aria-label="Precios por tipo de cobro">
                <div className="pq-tabla-cab"><span>Tipo de cobro</span><span>Precio fijo (opcional)</span><span>Se cobra</span></div>
                {visibles.length === 0 && <div className="pq-vacio">No hay tipos de cobro activos.</div>}
                {visibles.map((t) => {
                  const id = t.id_tipo_cobro;
                  const fijo = fijos[id] !== undefined && fijos[id] !== "";
                  const final = fijo ? Number(fijos[id]) : calculado(mensual, t);
                  return (
                    <div className="pq-tabla-fila" key={id}>
                      <span className="pq-tipo"><b>{t.nombre}</b><small>{t.meses} mes{t.meses > 1 ? "es" : ""}{t.descuento_porcentaje ? ` · −${t.descuento_porcentaje}%` : ""}</small></span>
                      <div className="pq-dinero pq-dinero-chico"><em>$</em>
                        <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={`Precio fijo ${t.nombre}`} value={fijos[id] ?? ""} placeholder={calculado(mensual, t).toFixed(2)}
                          onChange={(e) => setFijos((f) => { const n = { ...f }; if (e.target.value === "") delete n[id]; else n[id] = e.target.value; return n; })} />
                      </div>
                      <span className={`pq-final ${fijo ? "pq-final-fijo" : ""}`}><b>{fmt(final)}</b><small>{fijo ? "precio fijo" : "automático"}</small></span>
                    </div>
                  );
                })}
              </div>
              <p className="pq-nota">Si dejas el precio fijo vacío, se calcula del mensual por los meses que cubre, menos su descuento.</p>
            </section>

            <section className="pq-tarjeta pq-completa">
              <div className="pq-mod-cab">
                <h3><span className="pq-punto pq-punto-ambar" />Qué incluye <small>{sel.size} de {modulos.length} módulos</small></h3>
                <div className="pq-mod-acciones">
                  <input className="pq-buscar" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar módulo…" aria-label="Buscar módulo" />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSel(new Set(modulos.map((m) => m.clave)))}>Todos</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSel(new Set())}>Ninguno</button>
                </div>
              </div>
              <div className="pq-modulos">
                {lista.map((m) => {
                  const on = sel.has(m.clave);
                  return (
                    <button type="button" key={m.clave} className={`pq-modulo ${on ? "pq-modulo-on" : ""}`} aria-pressed={on} title={m.descripcion || m.nombre} onClick={() => alternar(m.clave)}>
                      <IconoModuloSistema clave={m.clave} size={16} />
                      <span>{m.nombre}</span>
                      <i aria-hidden="true">{on ? "✓" : ""}</i>
                    </button>
                  );
                })}
                {lista.length === 0 && <div className="pq-vacio">Ningún módulo coincide.</div>}
              </div>
            </section>
          </div>

          <footer className="pq-pie">
            {error && <div className="error-text pq-error" role="alert">{error}</div>}
            <button type="button" className="btn btn-secondary" onClick={onClose}><span className="btn-ico"><Icono nombre="close" size={20} /></span>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : <><span className="btn-ico"><Icono nombre="save" size={20} /></span>Guardar</>}</button>
          </footer>
        </form>
      </div>
    </ModalPortal>
  );
}
