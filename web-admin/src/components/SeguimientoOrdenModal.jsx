import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { toQR } from "../lib/toqr";
import ModalPortal from "./ModalPortal";
import { useUI } from "../context/UIContext";
import "./seguimientoModal.css";

const I = {
  movil: <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  copiar: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  ojo: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  descargar: <><path d="M12 3v12M7 11l5 5 5-5" /><path d="M4 20h16" /></>,
  enlace: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  reloj: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  grafica: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
};
const Ic = ({ n, s = 18 }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[n]}</svg>
);
const WaIcono = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12.04 2a9.9 9.9 0 0 0-8.45 15.07L2 22l5.07-1.55A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3 .92.95-2.93-.2-.31a8.2 8.2 0 1 1 6.73 3.64Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.3-2.88c-.25-.43.25-.4.71-1.32.08-.16.04-.3-.02-.42-.06-.12-.56-1.35-.76-1.85-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.3-.23.25-.86.84-.86 2.05s.88 2.38 1 2.55c.12.16 1.73 2.64 4.19 3.7 1.55.67 2.16.73 2.94.61.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.18-.06-.1-.23-.16-.47-.28Z" /></svg>
);

/** Dibuja el QR del enlace (sin dependencias) en un canvas. */
function QrEnlace({ contenido, nombreArchivo, tamano = 200 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !contenido) return;
    const matriz = toQR(contenido);
    const n = Math.round(Math.sqrt(matriz.length));
    const margen = 2;
    const total = n + margen * 2;
    const escala = Math.max(2, Math.floor((tamano * 2) / total)); // 2x para que se vea nítido
    canvas.width = total * escala;
    canvas.height = total * escala;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0b0b0c";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (matriz[y * n + x] & 1) ctx.fillRect((x + margen) * escala, (y + margen) * escala, escala, escala);
  }, [contenido, tamano]);
  function descargar() {
    // Al descargar se agrega la zona blanca recomendada alrededor
    const origen = ref.current;
    const borde = Math.round(origen.width * 0.08);
    const out = document.createElement("canvas");
    out.width = origen.width + borde * 2; out.height = origen.height + borde * 2;
    const c = out.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, out.width, out.height);
    c.drawImage(origen, borde, borde);
    const a = document.createElement("a");
    a.download = nombreArchivo; a.href = out.toDataURL("image/png"); a.click();
  }
  return (
    <div className="sgm-qr">
      <div className="sgm-qr-marco">
        <span className="sgm-esq tl" /><span className="sgm-esq tr" /><span className="sgm-esq bl" /><span className="sgm-esq br" />
        <canvas ref={ref} style={{ width: tamano, height: tamano }} aria-label="Código QR de seguimiento" />
      </div>
      <button type="button" className="sgm-btn-link" onClick={descargar}><Ic n="descargar" s={16} /> Descargar QR</button>
    </div>
  );
}

/** Enlace y QR de seguimiento público de una orden: generar, copiar, enviar, regenerar y apagar. */
export default function SeguimientoOrdenModal({ idServicio, onClose }) {
  const { notify, confirmDialog } = useUI();
  const [info, setInfo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  async function cargar() {
    try {
      setInfo(await api.get(`/seguimiento-orden/${idServicio}`));
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo consultar el seguimiento.");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [idServicio]);

  async function accion(fn, okMsg) {
    setOcupado(true);
    setError("");
    try {
      const r = await fn();
      if (r) setInfo(r);
      if (okMsg) notify(okMsg, "success");
    } catch (e) {
      setError(e.message || "No se pudo completar la acción.");
    } finally {
      setOcupado(false);
    }
  }

  const generar = () => accion(() => api.post(`/seguimiento-orden/${idServicio}`), "Enlace generado");
  const regenerar = async () => {
    if (!(await confirmDialog("El enlace y el QR actuales dejarán de funcionar. Si ya se los diste al cliente, tendrás que enviarle el nuevo.", { title: "¿Generar un enlace nuevo?", danger: true, confirmar: "Generar nuevo" }))) return;
    accion(() => api.post(`/seguimiento-orden/${idServicio}/regenerar`), "Enlace nuevo generado");
  };
  const apagar = async () => {
    if (!(await confirmDialog("El cliente ya no podrá ver el avance de esta orden con el enlace ni con el QR.", { title: "¿Desactivar el seguimiento?", danger: true, confirmar: "Desactivar" }))) return;
    accion(() => api.del(`/seguimiento-orden/${idServicio}`), "Seguimiento desactivado");
  };

  // El backend devuelve la ruta; el enlace completo usa el dominio desde el que se abre el panel (o URL_PUBLICA).
  const enlace = info?.url ? (info.url.startsWith("http") ? info.url : `${window.location.origin}${info.url}`) : "";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      notify("Enlace copiado", "success");
    } catch {
      const campo = document.getElementById("seg-enlace");
      if (campo) { campo.focus(); campo.select(); }
      notify("Selecciona el enlace y cópialo (Ctrl+C)", "info");
    }
  }

  const textoWa = encodeURIComponent(`Hola, aquí puedes ver en tiempo real el avance de tu vehículo y el costo acumulado: ${enlace}`);
  const fecha = (iso) => (iso ? new Date(`${iso}${iso.endsWith("Z") ? "" : "Z"}`).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Aún sin visitas");

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !ocupado && onClose()}>
        <div className="modal sgm-modal">
          <header className="sgm-cab">
            <span className="sgm-icono"><Ic n="movil" s={24} /></span>
            <div>
              <h2>Seguimiento para el cliente</h2>
              <p>Comparte este enlace o QR para que vea el avance de su orden, sin iniciar sesión.</p>
            </div>
            {info?.activo && <span className="sgm-estado"><i />Activo</span>}
          </header>

          {cargando && <p className="loading-text">Consultando…</p>}
          {error && <p className="error-text" role="alert">{error}</p>}

          {!cargando && info && !info.orden_en_proceso && (
            <p className="sgm-aviso">Esta orden ya está finalizada o cancelada: el enlace dejó de funcionar y ya no se puede generar uno nuevo.</p>
          )}

          {!cargando && info && info.orden_en_proceso && !info.activo && (
            <div className="sgm-vacio">
              <span className="sgm-icono grande"><Ic n="enlace" s={30} /></span>
              <p>{info.requiere_regenerar ? "El enlace anterior ya no se puede mostrar. Genera uno nuevo." : "Esta orden aún no tiene enlace de seguimiento."}</p>
              <button type="button" className="btn btn-primary" onClick={info.requiere_regenerar ? regenerar : generar} disabled={ocupado}>
                {ocupado ? "Generando…" : "Generar enlace y QR"}
              </button>
              <small>Se apaga solo cuando la orden se finaliza.</small>
            </div>
          )}

          {!cargando && info?.activo && (
            <div className="sgm-cuerpo">
              <QrEnlace contenido={enlace} nombreArchivo={`seguimiento-orden-${idServicio}.png`} />

              <div className="sgm-enlace">
                <span className="sgm-enlace-ico"><Ic n="enlace" s={16} /></span>
                <input id="seg-enlace" readOnly value={enlace} onFocus={(e) => e.target.select()} aria-label="Enlace de seguimiento" />
                <button type="button" className="sgm-copiar" onClick={copiar}><Ic n="copiar" s={16} /> Copiar</button>
              </div>

              <div className="sgm-acciones">
                <a className="sgm-wa" href={`https://wa.me/?text=${textoWa}`} target="_blank" rel="noopener noreferrer"><WaIcono /> Enviar por WhatsApp</a>
                <a className="sgm-ver" href={enlace} target="_blank" rel="noopener noreferrer"><Ic n="ojo" s={18} /> Ver como cliente</a>
              </div>

              <div className="sgm-datos">
                <div><span><Ic n="grafica" s={15} /> Visitas</span><b>{info.accesos || 0}</b></div>
                <div><span><Ic n="reloj" s={15} /> Última visita</span><b>{fecha(info.ultimo_acceso)}</b></div>
              </div>
              <p className="sgm-nota">El enlace deja de funcionar en cuanto la orden se finaliza.</p>
            </div>
          )}

          <footer className="sgm-pie">
            {info?.activo && (
              <>
                <button type="button" className="sgm-ghost" onClick={regenerar} disabled={ocupado}>Generar nuevo</button>
                <button type="button" className="sgm-ghost peligro" onClick={apagar} disabled={ocupado}>Desactivar</button>
              </>
            )}
            <button type="button" className="btn btn-secondary" style={{ marginLeft: "auto" }} onClick={onClose} disabled={ocupado}>Cerrar</button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
