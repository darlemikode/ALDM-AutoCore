import { useEffect, useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import IconoModulo from "../components/IconoModulo";
import ModalPortal from "../components/ModalPortal";
import { Icono } from "../components/Icono";

const fecha = (f) => (f ? new Date(/Z$/.test(f) ? f : `${f}Z`).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—");

/**
 * Llaves de API para conectar n8n (agente de WhatsApp) con este taller.
 * La llave completa se muestra una sola vez; aquí solo queda el prefijo.
 */
export default function Integraciones() {
  const { notify, confirmDialog } = useUI();
  const [llaves, setLlaves] = useState(null);
  const [nombre, setNombre] = useState("n8n WhatsApp");
  const [creando, setCreando] = useState(false);
  const [nueva, setNueva] = useState(null);

  const cargar = () => api.get("/integracion/llaves").then(setLlaves).catch((e) => notify(e.message, "error"));
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  async function crear(e) {
    e.preventDefault();
    setCreando(true);
    try {
      setNueva(await api.post("/integracion/llaves", { nombre }));
      cargar();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setCreando(false);
    }
  }

  async function revocar(l) {
    const ok = await confirmDialog(`¿Revocar la llave «${l.nombre}»? Lo que esté conectado con ella (n8n) dejará de funcionar al instante.`, { danger: true, title: "Revocar llave" });
    if (!ok) return;
    try {
      await api.del(`/integracion/llaves/${l.id_llave}`);
      notify("La llave se revocó.", "success");
      cargar();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(nueva.llave); notify("Llave copiada.", "success"); }
    catch { notify("No se pudo copiar: selecciónala y cópiala a mano.", "error"); }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-titulo">
          <div>
            <h1><IconoModulo ruta="/configuracion" /> Integraciones</h1>
            <div className="subtitle">Conecta el agente de WhatsApp (n8n) con tu taller</div>
          </div>
        </div>
      </div>

      <section className="cfg-card integ-card">
        <div className="cfg-card-header">
          <span className="cfg-card-icono"><Icono nombre="key" size={20} /></span>
          <div>
            <h2>Llaves de API</h2>
            <div className="cfg-card-desc">El agente solo ve los datos de este taller y, a cada cliente, únicamente sus propias órdenes.</div>
          </div>
        </div>
        <form className="integ-nueva" onSubmit={crear}>
          <div className="field">
            <label>Nombre de la llave</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Ej. n8n WhatsApp" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={creando || !nombre.trim()}>
            <Icono nombre="add" size={18} /> {creando ? "Generando…" : "Generar llave"}
          </button>
        </form>

        {llaves === null ? <div className="loading-text">Cargando…</div> : llaves.length === 0 ? (
          <div className="empty-state">Todavía no hay llaves. Genera una para conectar n8n.</div>
        ) : (
          <table className="integ-tabla">
            <thead><tr><th>Nombre</th><th>Llave</th><th>Creada</th><th>Último uso</th><th>Estado</th><th aria-label="Acciones"></th></tr></thead>
            <tbody>
              {llaves.map((l) => (
                <tr key={l.id_llave} className={l.activa ? "" : "revocada"}>
                  <td>{l.nombre}<div className="integ-sub">por {l.creada_por || "—"}</div></td>
                  <td className="mono">{l.prefijo}…</td>
                  <td>{fecha(l.fecha_creacion)}</td>
                  <td>{fecha(l.ultimo_uso)}</td>
                  <td><span className={`badge ${l.activa ? "badge-teal" : "badge-grey"}`}>{l.activa ? "Activa" : "Revocada"}</span></td>
                  <td>{l.activa && <button className="btn btn-danger btn-sm" onClick={() => revocar(l)}>Revocar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="cfg-card integ-card">
        <div className="cfg-card-header">
          <span className="cfg-card-icono"><Icono nombre="chatbubble" size={20} /></span>
          <div>
            <h2>Cómo funciona el agente</h2>
            <div className="cfg-card-desc">Un solo número de WhatsApp para clientes y personal</div>
          </div>
        </div>
        <ul className="integ-lista">
          <li><b>Clientes</b> (su teléfono está en su ficha): consultan el estado y saldo de sus órdenes, reciben su nota en PDF y solicitan citas.</li>
          <li><b>Personal</b> (teléfono capturado en Usuarios): pide el resumen del día, órdenes abiertas, refacciones con poco stock y citas por confirmar, según los permisos de su rol.</li>
          <li><b>Desconocidos</b>: solo reciben los datos de contacto del taller.</li>
        </ul>
      </section>

      {nueva && (
        <ModalPortal>
          <div className="modal-backdrop">
            <div className="modal dialogo-confirmar" role="dialog" aria-modal="true" style={{ maxWidth: 560 }}>
              <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={() => setNueva(null)}><Icono nombre="close" size={20} /></button>
              <div className="dialogo-cuerpo">
                <span className="dialogo-icono" aria-hidden="true">!</span>
                <div>
                  <h2 className="dialogo-titulo">Copia tu llave ahora</h2>
                  <p className="dialogo-mensaje">Es la única vez que se muestra completa. Pégala en n8n, en la credencial «Header Auth» con el nombre <b>X-API-Key</b>.</p>
                  <div className="integ-llave mono" onClick={(e) => window.getSelection()?.selectAllChildren(e.currentTarget)}>{nueva.llave}</div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setNueva(null)}>Ya la guardé</button>
                <button className="btn btn-primary" onClick={copiar} autoFocus><Icono nombre="document" size={18} /> Copiar llave</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
