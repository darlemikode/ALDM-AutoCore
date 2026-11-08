// Alta / edición de un vehículo: propietario, identificación y (al editar) fotos.
import { useEffect, useState } from "react";
import ModalPortal from "./ModalPortal";
import Combo, { opMarca } from "./Combo";
import { Icono } from "./Icono";
import "./modalVehiculo.css";

const ANIO = String(new Date().getFullYear() + 1);

export default function VehiculoModal({ titulo, subtitulo, inicial = {}, clientes = null, clienteNombre = "", clienteBloqueado = false, marcas, modelos, colores, onSubmit, onClose, extra = null }) {
  const [v, setV] = useState({ ...inicial });
  const [faltan, setFaltan] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const pon = (k, val) => setV((p) => ({ ...p, [k]: val }));
  const sinCliente = !clienteNombre && !clienteBloqueado;

  useEffect(() => {
    const tecla = (e) => e.key === "Escape" && !document.querySelector(".combo-lista") && onClose();
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onClose]);

  const opCliente = (clientes || []).slice().sort((a, b) => a.nombre_cliente.localeCompare(b.nombre_cliente))
    .map((c) => ({ value: c.id_cliente, label: `${c.nombre_cliente} ${c.paterno_cliente || ""}`.trim() }));
  const opMarcas = marcas.map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca, ...opMarca(m) }));
  const opModelos = modelos
    .filter((m) => !v.id_marca_vehiculo || m.id_marca_vehiculo === v.id_marca_vehiculo)
    .map((m) => ({ value: m.id_modelo_vehiculo, label: v.id_marca_vehiculo ? m.nombre_modelo : `${marcas.find((x) => x.id_marca_vehiculo === m.id_marca_vehiculo)?.nombre_marca || ""} ${m.nombre_modelo}`.trim() }));
  const opColores = colores.map((c) => ({ value: c.id_color, label: c.nombre_color }));

  function elegirMarca(id) {
    const m = modelos.find((x) => x.id_modelo_vehiculo === v.id_modelo_vehiculo);
    setV((p) => ({ ...p, id_marca_vehiculo: id, ...(p.id_modelo_vehiculo && m && m.id_marca_vehiculo !== id ? { id_modelo_vehiculo: null } : {}) }));
  }
  function elegirModelo(id) {
    const m = modelos.find((x) => x.id_modelo_vehiculo === id);
    setV((p) => ({ ...p, id_modelo_vehiculo: id, ...(m ? { id_marca_vehiculo: m.id_marca_vehiculo } : {}) }));
  }

  async function guardar(e) {
    e.preventDefault();
    const f = [];
    if (sinCliente && !v.id_cliente) f.push("id_cliente");
    if (!v.id_marca_vehiculo) f.push("id_marca_vehiculo");
    if (!v.id_modelo_vehiculo) f.push("id_modelo_vehiculo");
    if (v.km_vehiculo === "" || v.km_vehiculo == null) f.push("km_vehiculo");
    setFaltan(f);
    if (f.length) return setError("Completa los campos marcados en rojo.");
    setError("");
    setGuardando(true);
    try {
      await onSubmit({ ...v, km_vehiculo: Number(v.km_vehiculo) });
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
      setGuardando(false);
    }
  }

  const mal = (k) => (faltan.includes(k) ? " vm-mal" : "");
  const texto = (k, etiqueta, ph = "", extraProps = {}) => (
    <label className="vm-campo">
      <span>{etiqueta}</span>
      <input value={v[k] ?? ""} onChange={(e) => pon(k, e.target.value)} placeholder={ph} {...extraProps} />
    </label>
  );

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <form className="modal vm-modal" onSubmit={guardar} noValidate>
          <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={onClose}><Icono nombre="close" size={20} /></button>
          <header className="vm-cab">
            <span className="vm-cab-ico"><Icono nombre="car" size={28} /></span>
            <div>
              <h2>{titulo}</h2>
              {subtitulo && <p>{subtitulo}</p>}
            </div>
          </header>

          <div className="vm-cuerpo">
            <section className="vm-tarjeta">
              <h3><Icono nombre="user" size={16} />Propietario</h3>
              <div className={"vm-campo" + mal("id_cliente")}>
                <span>Cliente {sinCliente && <b>*</b>}</span>
                {sinCliente || (clientes && !clienteBloqueado) ? (
                  <Combo opciones={opCliente} value={v.id_cliente} onChange={(x) => pon("id_cliente", x)} placeholder="Busca por nombre del cliente…" />
                ) : (
                  <div className="vm-fijo"><Icono nombre="user" size={16} />{clienteNombre || (clientes || []).find((c) => c.id_cliente === v.id_cliente)?.nombre_cliente || "Cliente seleccionado"}</div>
                )}
              </div>
              <label className="vm-campo">
                <span>Comentarios</span>
                <textarea rows={2} value={v.comentarios ?? ""} onChange={(e) => pon("comentarios", e.target.value)} placeholder="Notas internas sobre el vehículo (opcional)" />
              </label>
            </section>

            <section className="vm-tarjeta">
              <h3><Icono nombre="car" size={16} />Identificación del vehículo</h3>
              <div className="vm-rejilla">
                <div className={"vm-campo" + mal("id_marca_vehiculo")}><span>Marca <b>*</b></span>
                  <Combo opciones={opMarcas} value={v.id_marca_vehiculo} onChange={elegirMarca} placeholder="Selecciona la marca" /></div>
                <div className={"vm-campo" + mal("id_modelo_vehiculo")}><span>Modelo <b>*</b></span>
                  <Combo opciones={opModelos} value={v.id_modelo_vehiculo} onChange={elegirModelo} placeholder="Selecciona el modelo" /></div>
                <div className="vm-campo"><span>Color</span>
                  <Combo opciones={opColores} value={v.id_color} onChange={(x) => pon("id_color", x)} placeholder="Selecciona el color" /></div>
                {texto("id_year_vehiculo", "Año", ANIO, { inputMode: "numeric", maxLength: 4 })}
                {texto("placas_vehiculo", "Placas", "ABC-123-D", { style: { textTransform: "uppercase" } })}
                <label className={"vm-campo" + mal("km_vehiculo")}>
                  <span>Kilometraje <b>*</b></span>
                  <input type="number" min="0" value={v.km_vehiculo ?? ""} onChange={(e) => pon("km_vehiculo", e.target.value === "" ? "" : e.target.value)} placeholder="Ej. 85000" />
                </label>
                {texto("numserie_vehiculo", "Número de serie (VIN)", "17 caracteres")}
                {texto("cilindraje_vehiculo", "Cilindraje", "Ej. 2.0 L")}
              </div>
            </section>

            {extra}
          </div>

          {error && <div className="vm-error">{error}</div>}
          <footer className="vm-pie">
            <button type="button" className="btn btn-secondary" onClick={onClose}><span className="btn-ico"><Icono nombre="close" size={18} /></span>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={guardando}><span className="btn-ico"><Icono nombre="save" size={18} /></span>{guardando ? "Guardando…" : "Guardar vehículo"}</button>
          </footer>
        </form>
      </div>
    </ModalPortal>
  );
}
