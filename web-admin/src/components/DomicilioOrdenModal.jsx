import { useEffect, useState } from "react";
import { api } from "../api";
import ModalPortal from "./ModalPortal";
import { useUI } from "../context/UIContext";
import MapaUbicacion from "./MapaUbicacion";
import { abrirVentanaWa, confirmarDomicilioPorWhatsApp, precargarEnvio } from "../lib/domicilioWa";
import DomicilioForm, { DOMICILIO_VACIO, domicilioPayload } from "./DomicilioForm";
import "./seguimientoModal.css";
import "./domicilioModal.css";

const IcoCasa = ({ s = 24 }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>
);
const IcoMapa = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
);
const WaIcono = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M12.04 2a9.9 9.9 0 0 0-8.45 15.07L2 22l5.07-1.55A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3 .92.95-2.93-.2-.31a8.2 8.2 0 1 1 6.73 3.64Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.3-2.88c-.25-.43.25-.4.71-1.32.08-.16.04-.3-.02-.42-.06-.12-.56-1.35-.76-1.85-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.3-.23.25-.86.84-.86 2.05s.88 2.38 1 2.55c.12.16 1.73 2.64 4.19 3.7 1.55.67 2.16.73 2.94.61.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.18-.06-.1-.23-.16-.47-.28Z" /></svg>
);

const VACIO = DOMICILIO_VACIO;
const wa = (tel, texto) => {
  const d = String(tel || "").replace(/\D/g, "").slice(-10);
  return `https://wa.me/${d.length === 10 ? `52${d}` : ""}?text=${encodeURIComponent(texto)}`;
};

/** Servicio a domicilio de una orden: dirección, ubicación, mecánico, código y enlace de la visita. */
export default function DomicilioOrdenModal({ idServicio, nombreServicio, nombreTaller, onClose, onCambio }) {
  const { notify, confirmDialog } = useUI();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [editando, setEditando] = useState(false);
  const [empleados, setEmpleados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [codigo, setCodigo] = useState("");

  function aplicar(r) {
    setInfo(r);
    setEditando(!r?.existe);
    if (r?.existe) {
      setForm({
        calle: r.calle || "", numero: r.numero || "", colonia: r.colonia || "", cp: r.cp || "", ciudad: r.ciudad || "", estado: r.estado || "",
        referencias: r.referencias || "", maps_url: "", lat: r.lat ?? null, lng: r.lng ?? null, id_empleado_mecanico: r.id_empleado_mecanico || "",
      });
    }
  }
  useEffect(() => {
    precargarEnvio();
    (async () => {
      try {
        const [r, e] = await Promise.all([api.get(`/servicio-domicilio/${idServicio}`), api.get("/empleados/").catch(() => [])]);
        setEmpleados((e || []).filter((x) => x.activo));
        aplicar(r);
      } catch (err) {
        setError(err.message || "No se pudo consultar el servicio a domicilio.");
      } finally {
        setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idServicio]);

  async function accion(fn, okMsg) {
    setOcupado(true); setError("");
    try {
      const r = await fn();
      if (r) aplicar(r);
      if (okMsg) notify(okMsg, "success");
      onCambio?.();
      return r || true;
    } catch (e) {
      setError(e.message || "No se pudo completar la acción.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  // Al guardar por primera vez se abre WhatsApp con la confirmación para el cliente (código + enlace de su orden)
  async function guardar() {
    const primeraVez = !info?.existe;
    const ventana = primeraVez ? abrirVentanaWa() : null; // dentro del clic, para que no la bloquee el navegador
    const r = await accion(() => api.put(`/servicio-domicilio/${idServicio}`, domicilioPayload(form)), "Servicio a domicilio guardado");
    if (!r || r === true) { ventana?.close(); return; }
    if (!primeraVez) {
      if (r.envio_automatico?.mecanico) notify("Enlace enviado al mecánico por WhatsApp.", "success");
      return;
    }
    const res = await confirmarDomicilioPorWhatsApp({ idServicio, info: r, ventana, nombreTaller, nombreServicio });
    if (res === "automatico") notify(`Confirmación enviada por WhatsApp al cliente${r.envio_automatico?.mecanico ? " y enlace al mecánico" : ""}, en segundo plano.`, "success");
    else if (res === "ok") notify("Se abrió WhatsApp con la confirmación para el cliente: solo falta pulsar «Enviar».", "success");
    else if (res === "sin_telefono") notify("El cliente no tiene un teléfono de 10 dígitos: corrígelo en su ficha para enviarle la confirmación.", "error");
    else notify("El navegador bloqueó la ventana de WhatsApp. Usa el botón «Código al cliente».", "info");
  }

  const nuevoCodigo = async () => {
    if (!(await confirmDialog("El código actual dejará de servir. Tendrás que dárselo de nuevo al cliente.", { title: "¿Generar código nuevo?", confirmar: "Generar" }))) return;
    const r = await accion(() => api.post(`/servicio-domicilio/${idServicio}/regenerar-codigo`), "Código nuevo generado");
    if (r?.envio_automatico?.cliente) notify("Código nuevo enviado al cliente por WhatsApp.", "success");
  };
  const nuevoEnlace = async () => {
    if (!(await confirmDialog("El enlace actual dejará de funcionar. Tendrás que enviarle el nuevo al mecánico.", { title: "¿Generar enlace nuevo?", danger: true, confirmar: "Generar" }))) return;
    const r = await accion(() => api.post(`/servicio-domicilio/${idServicio}/regenerar-enlace`), "Enlace nuevo generado");
    if (r?.envio_automatico?.mecanico) notify("Enlace nuevo enviado al mecánico por WhatsApp.", "success");
  };
  const iniciar = async () => {
    if (!/^\d{6}$/.test(codigo)) { setError("El código tiene 6 dígitos."); return; }
    if (await accion(() => api.post(`/servicio-domicilio/${idServicio}/iniciar`, { codigo }), "Servicio iniciado")) setCodigo("");
  };
  const quitar = async () => {
    if (!(await confirmDialog("La orden volverá a ser un servicio normal, sin código ni enlace.", { title: "¿Quitar servicio a domicilio?", danger: true, confirmar: "Quitar" }))) return;
    if (await accion(() => api.del(`/servicio-domicilio/${idServicio}`).then(() => ({ existe: false })), "Servicio a domicilio quitado")) setForm(VACIO);
  };
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); notify("Copiado", "success"); } catch { notify("Selecciona el texto y cópialo (Ctrl+C)", "info"); }
  }

  const firma = nombreTaller ? `\n— ${nombreTaller}` : "";
  const textoCliente = info?.codigo ? `Hola ${info.cliente || ""}, tu servicio a domicilio quedó agendado. Cuando llegue el mecánico dale este código para que pueda iniciar: ${info.codigo}. Sin el código no podrá comenzar.${firma}` : "";
  const textoMecanico = info?.enlace ? `Servicio a domicilio: ${nombreServicio || "Servicio"}${info.direccion ? `\nDirección: ${info.direccion}` : ""}\nAbre aquí la ubicación y los datos: ${info.enlace}\nPide al cliente el código de 6 dígitos para iniciar.${firma}` : "";
  const fecha = (iso) => (iso ? new Date(`${iso}${iso.endsWith("Z") ? "" : "Z"}`).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

  return (
    <ModalPortal>
      <div className="modal-backdrop dom-fondo" onClick={(e) => e.target === e.currentTarget && !ocupado && onClose()}>
        <div className={`modal sgm-modal dom-modal ${editando ? "dom-editando" : ""}`}>
          <header className="sgm-cab">
            <span className="sgm-icono"><IcoCasa /></span>
            <div>
              <h2>Servicio a domicilio</h2>
              <p>Dirección, mecánico y código de seguridad. El servicio no se puede abrir sin el código del cliente.</p>
            </div>
            {info?.iniciado_at && <span className="sgm-estado"><i />Iniciado</span>}
          </header>

          {cargando && <p className="loading-text">Consultando…</p>}
          {error && <p className="error-text" role="alert">{error}</p>}

          {!cargando && info && editando && (
            <div className="dom-form dom-form-grande"><DomicilioForm form={form} setForm={setForm} empleados={empleados} /></div>
          )}

          {!cargando && info?.existe && !editando && (
            <div className="dom-resultado">
              <div className="dom-col">
                <div className="dom-dir dom-aparece">
                  <b>📍 {info.direccion || "Ubicación por mapa"}</b>
                  {info.referencias && <small>{info.referencias}</small>}
                  <small>Mecánico: {info.mecanico || "sin asignar"} · Cliente: {info.cliente || "—"}</small>
                  {info.maps_url && <a href={info.maps_url} target="_blank" rel="noopener noreferrer"><IcoMapa /> Abrir en Google Maps ↗</a>}
                </div>
                {info.lat != null && info.lng != null && <MapaUbicacion lat={info.lat} lng={info.lng} alto={190} soloVer />}

                <ol className="dom-pasos" aria-label="Pasos del servicio a domicilio">
                  {[
                    ["Dale el código al cliente", "Se lo mandas por WhatsApp. Es su “llave” para abrir el servicio.", !!info.iniciado_at],
                    ["Manda el enlace al mecánico", "Ahí ve la dirección, el mapa y el servicio.", !!info.iniciado_at],
                    ["El mecánico llega y pide el código", "El cliente se lo dicta. Sin código no se puede iniciar.", !!info.iniciado_at],
                    ["Termina y envía la nota", "Al finalizar se manda la nota por WhatsApp al cliente.", !!info.nota_enviada_at],
                  ].map(([tit, sub, hecho], i, arr) => {
                    const actual = !hecho && arr.findIndex((x) => !x[2]) === i;
                    return (
                      <li key={tit} className={hecho ? "hecho" : actual ? "actual" : ""} style={{ animationDelay: `${120 + i * 90}ms` }}>
                        <i>{hecho ? "✓" : i + 1}</i>
                        <div><b>{tit}</b><span>{sub}</span></div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="dom-col">
                {info.iniciado_at ? (
                  <p className="dom-iniciado dom-aparece">✔ Iniciado el {fecha(info.iniciado_at)}{info.iniciado_por ? ` por ${info.iniciado_por}` : ""}.</p>
                ) : (
                  <section className="dom-sec dom-aparece">
                    <h3><i>1</i> Código para el cliente</h3>
                    <div className="dom-codigo">
                      <span>Código de seguridad</span>
                      <b aria-label={info.codigo || "sin código"}>{(info.codigo || "——————").split("").map((d, i) => <em key={`${info.codigo}-${i}`} style={{ animationDelay: `${i * 70}ms` }}>{d}</em>)}</b>
                      {info.codigo_bloqueado && <small className="dom-alerta">Bloqueado por intentos fallidos. Genera un código nuevo.</small>}
                      {!info.codigo_bloqueado && info.intentos_restantes < 5 && <small>Intentos restantes: {info.intentos_restantes}</small>}
                    </div>
                    <div className="sgm-acciones">
                      <a className="sgm-wa" href={wa(info.cliente_telefono, textoCliente)} target="_blank" rel="noopener noreferrer"><WaIcono /> Código al cliente</a>
                      <button type="button" className="sgm-ver" onClick={nuevoCodigo} disabled={ocupado}>Código nuevo</button>
                    </div>
                  </section>
                )}

                <section className="dom-sec dom-aparece" style={{ animationDelay: "90ms" }}>
                  <h3><i>2</i> Enlace para el mecánico</h3>
                  {info.enlace ? (
                    <>
                      <div className="sgm-enlace">
                        <input readOnly value={info.enlace} onFocus={(e) => e.target.select()} aria-label="Enlace del mecánico" />
                        <button type="button" className="sgm-copiar" onClick={() => copiar(info.enlace)}>Copiar</button>
                      </div>
                      <div className="sgm-acciones">
                        <a className="sgm-wa" href={wa(info.mecanico_telefono, textoMecanico)} target="_blank" rel="noopener noreferrer"><WaIcono /> Enlace al mecánico</a>
                        <button type="button" className="sgm-ver" onClick={nuevoEnlace} disabled={ocupado}>Enlace nuevo</button>
                      </div>
                    </>
                  ) : (
                    <div className="sgm-acciones"><button type="button" className="btn btn-primary" onClick={nuevoEnlace} disabled={ocupado}>Generar enlace</button></div>
                  )}
                </section>

                {!info.iniciado_at && (
                  <section className="dom-sec dom-aparece" style={{ animationDelay: "180ms" }}>
                    <h3><i>3</i> Iniciar el servicio</h3>
                    <div className="dom-iniciar">
                      <label>Código que dicta el cliente
                        <input value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="000000" disabled={info.codigo_bloqueado} />
                      </label>
                      <button type="button" className="btn btn-primary" onClick={iniciar} disabled={ocupado || info.codigo_bloqueado || codigo.length !== 6}>Iniciar servicio</button>
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}

          <footer className="sgm-pie">
            {info?.existe && !editando && <button type="button" className="sgm-ghost" onClick={() => setEditando(true)} disabled={ocupado}>Editar dirección</button>}
            {info?.existe && <button type="button" className="sgm-ghost peligro" onClick={quitar} disabled={ocupado}>Quitar</button>}
            {editando && <button type="button" className="btn btn-primary" onClick={guardar} disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar"}</button>}
            <button type="button" className="btn btn-secondary" style={{ marginLeft: "auto" }} onClick={onClose} disabled={ocupado}>Cerrar</button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
