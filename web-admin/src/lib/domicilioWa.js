import { api } from "../api";

let _envioAuto = false; // el servidor manda los WhatsApp solo (no hace falta abrir WhatsApp Web)
/** Consulta si el envío automático está activo; llamarla al abrir la pantalla. */
export const precargarEnvio = () => api.get("/servicio-domicilio/envio-automatico").then((r) => { _envioAuto = !!r?.activo; }).catch(() => { _envioAuto = false; });

/** Abre un pestaña en blanco DENTRO del clic (así el navegador no la bloquea) para llenarla después. Con envío automático no abre nada. */
export const abrirVentanaWa = () => {
  if (_envioAuto) return null;
  try { return window.open("", "_blank"); } catch { return null; }
};

/**
 * Confirmación al cliente por WhatsApp al guardar el servicio a domicilio: orden, dirección, código de seguridad
 * y el enlace de seguimiento de su orden. WhatsApp se abre con el mensaje ya escrito (solo falta pulsar «Enviar»).
 * Devuelve "automatico" | "ok" | "sin_telefono" | "bloqueado".
 */
export async function confirmarDomicilioPorWhatsApp({ idServicio, info, ventana, nombreTaller, nombreServicio }) {
  if (info?.envio_automatico?.cliente) { ventana?.close(); return "automatico"; } // lo manda el servidor en segundo plano
  const digitos = String(info?.cliente_telefono || "").replace(/\D/g, "").slice(-10);
  if (digitos.length !== 10) { ventana?.close(); return "sin_telefono"; }

  let enlace = "";
  try {
    const seg = await api.post(`/seguimiento-orden/${idServicio}`, {});
    if (seg?.url) enlace = /^https?:/i.test(seg.url) ? seg.url : `${window.location.origin}${seg.url}`;
  } catch { /* el paquete puede no incluir seguimiento: se manda sin enlace */ }

  let taller = nombreTaller;
  if (!taller) { try { taller = (await api.get("/configuracion-taller/"))?.nombre_taller; } catch { /* sin firma */ } }

  const lineas = [
    `Hola ${info.cliente || ""}, tu servicio a domicilio quedó confirmado ✅`.replace(" ,", ","),
    `Orden #${idServicio}${nombreServicio ? ` — ${nombreServicio}` : ""}`,
    info.direccion ? `Dirección: ${info.direccion}` : null,
    info.mecanico ? `Mecánico: ${info.mecanico}` : null,
    info.codigo ? `\nCódigo de seguridad: ${info.codigo}\nDáselo al mecánico solo cuando llegue; sin él no puede iniciar el servicio.` : null,
    enlace ? `\nSigue tu orden aquí: ${enlace}` : null,
    taller ? `\n— ${taller}` : null,
  ].filter(Boolean);
  const texto = encodeURIComponent(lineas.join("\n"));

  const esMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const url = esMovil ? `https://wa.me/52${digitos}?text=${texto}` : `https://web.whatsapp.com/send?phone=52${digitos}&text=${texto}`;
  if (ventana && !ventana.closed) { ventana.location.href = url; return "ok"; }
  return "bloqueado";
}
