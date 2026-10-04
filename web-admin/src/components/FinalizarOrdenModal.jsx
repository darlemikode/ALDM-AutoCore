import { useMemo, useState } from "react";
import { api } from "../api";
import ModalPortal from "./ModalPortal";
import { IconoAuto } from "./Icono";

/**
 * Finalizar la orden en un solo paso: cobro del saldo (forma de pago, monto
 * recibido y cambio), confirmación con la palabra CONFIRMAR, cierre de la
 * orden, aviso al cliente y generación de la nota de remisión.
 */
const FORMAS = [
  { valor: "efectivo", icono: "💵", texto: "Efectivo" },
  { valor: "tarjeta", icono: "💳", texto: "Tarjeta" },
  { valor: "mixto", icono: "🔀", texto: "Mixto" },
];

function fmt(n) {
  return (Number(n) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export default function FinalizarOrdenModal({ servicio, onClose, onFinalizada, notify }) {
  const { total, total_abonado: abonado, saldo_pendiente: saldo } = servicio.costos;
  const conSaldo = saldo > 0.005;
  const cliente = servicio.cliente || {};
  const [forma, setForma] = useState("efectivo");
  const [recibido, setRecibido] = useState("");
  const [mixEfectivo, setMixEfectivo] = useState("");
  const [mixTarjeta, setMixTarjeta] = useState("");
  const [comentarios, setComentarios] = useState(servicio.comentarios_finales || "");
  const [notificar, setNotificar] = useState(true);
  const [confirmar, setConfirmar] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const pago = useMemo(() => {
    if (!conSaldo) return { recibido: 0, cambio: 0, falta: 0 };
    let r;
    if (forma === "tarjeta") r = recibido === "" ? saldo : Number(recibido);
    else if (forma === "mixto") r = (Number(mixEfectivo) || 0) + (Number(mixTarjeta) || 0);
    else r = Number(recibido) || 0;
    return { recibido: r, cambio: Math.max(r - saldo, 0), falta: Math.max(saldo - r, 0) };
  }, [conSaldo, forma, recibido, mixEfectivo, mixTarjeta, saldo]);

  const tarjetaExcede = conSaldo && ((forma === "tarjeta" && pago.recibido > saldo + 0.005) || (forma === "mixto" && (Number(mixTarjeta) || 0) > saldo + 0.005));
  const pagoCompleto = !conSaldo || (pago.falta <= 0.005 && !tarjetaExcede);
  const listo = pagoCompleto && confirmar === "CONFIRMAR";

  const billetes = [saldo, Math.ceil(saldo / 100) * 100, Math.ceil(saldo / 500) * 500, Math.ceil(saldo / 1000) * 1000]
    .filter((v, i, a) => v >= saldo && a.indexOf(v) === i)
    .slice(0, 4);

  async function finalizar() {
    if (!listo) return;
    setEnviando(true);
    setError("");
    try {
      const payload = { comentarios_finales: comentarios, notificar_cliente: notificar };
      if (conSaldo) {
        payload.tipo_pago = forma;
        if (forma === "mixto") {
          payload.desglose_mixto_efectivo = Number(mixEfectivo) || 0;
          payload.desglose_mixto_tarjeta = Number(mixTarjeta) || 0;
        } else {
          payload.monto_recibido = pago.recibido;
        }
      }
      const res = await api.post(`/servicios/${servicio.id_servicio}/finalizar`, payload);
      onFinalizada(res);
    } catch (err) {
      setError(err.message);
      notify?.(err.message, "error");
    } finally {
      setEnviando(false);
    }
  }

  const canales = [
    { ok: true, texto: "Mensaje en el chat de la orden" },
    { ok: !!cliente.cuenta_activada, texto: cliente.cuenta_activada ? "Notificación en su app" : "Notificación en su app (no ha activado su cuenta)" },
    { ok: !!cliente.correo_cliente, texto: cliente.correo_cliente ? `Correo con la nota a ${cliente.correo_cliente}` : "Correo (el cliente no tiene correo registrado)" },
  ];

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !enviando && onClose()}>
        <div className="modal fin-modal">
          <div className="modal-header-icono">
            <div className="modal-avatar-icono" style={{ "--acc": "var(--teal-600)", "--acc-soft": "var(--teal-100)" }}><IconoAuto valor="🧾" size={24} /></div>
            <div>
              <h2>Finalizar orden #{servicio.id_servicio}</h2>
              <div className="modal-subtitulo">Cobro, cierre de la orden, nota de remisión y aviso al cliente.</div>
            </div>
          </div>

          <div className="fin-resumen">
            <div><span>Total</span><b>{fmt(total)}</b></div>
            <div><span>Abonado</span><b>{fmt(abonado)}</b></div>
            <div className={conSaldo ? "fin-saldo" : "fin-saldo fin-saldo-ok"}><span>{conSaldo ? "Por cobrar" : "Liquidada"}</span><b>{fmt(saldo)}</b></div>
          </div>

          {conSaldo && (
            <div className="fin-bloque">
              <div className="fin-titulo">1 · Forma de pago</div>
              <div className="fin-formas">
                {FORMAS.map((f) => (
                  <button type="button" key={f.valor} className={`fin-forma ${forma === f.valor ? "activo" : ""}`} onClick={() => { setForma(f.valor); setRecibido(""); }}>
                    <span><IconoAuto valor={f.icono} size={18} /></span>{f.texto}
                  </button>
                ))}
              </div>

              {forma === "efectivo" && (
                <>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label>Efectivo recibido</label>
                    <input type="number" min="0" step="any" autoFocus value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder={saldo.toFixed(2)} className="fin-monto" />
                  </div>
                  <div className="fin-billetes">
                    {billetes.map((b) => (
                      <button type="button" key={b} className="btn btn-secondary btn-sm" onClick={() => setRecibido(String(b))}>
                        {b === saldo ? "Exacto" : fmt(b)}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {forma === "tarjeta" && (
                <div className="field" style={{ marginTop: 12 }}>
                  <label>Cargo a tarjeta</label>
                  <input type="number" min="0" step="any" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder={saldo.toFixed(2)} className="fin-monto" />
                </div>
              )}
              {forma === "mixto" && (
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="field"><label><IconoAuto valor="💵" size={18} /> Efectivo</label><input type="number" min="0" step="any" value={mixEfectivo} onChange={(e) => setMixEfectivo(e.target.value)} className="fin-monto" /></div>
                  <div className="field"><label><IconoAuto valor="💳" size={18} /> Tarjeta</label><input type="number" min="0" step="any" value={mixTarjeta} onChange={(e) => setMixTarjeta(e.target.value)} className="fin-monto" /></div>
                </div>
              )}

              <div className={`fin-cambio ${pago.falta > 0.005 || tarjetaExcede ? "falta" : ""}`}>
                {tarjetaExcede
                  ? "El cargo a tarjeta no puede ser mayor a lo que se debe."
                  : pago.falta > 0.005
                    ? <>Faltan <b>{fmt(pago.falta)}</b> para cubrir el saldo</>
                    : <>Cambio a entregar: <b>{fmt(pago.cambio)}</b></>}
              </div>
            </div>
          )}

          <div className="fin-bloque">
            <div className="fin-titulo">{conSaldo ? "2" : "1"} · Comentarios para la nota (opcional)</div>
            <textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} rows={2} placeholder="Ej. Se recomienda revisar amortiguadores en la próxima visita." style={{ width: "100%" }} />
          </div>

          <div className="fin-bloque">
            <label className="no-preguntar" style={{ marginTop: 0, color: "var(--ink-900)", fontWeight: 600 }}>
              <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} />
              Avisar al cliente que su vehículo está listo
            </label>
            {notificar && (
              <ul className="fin-canales">
                {canales.map((c) => <li key={c.texto} className={c.ok ? "" : "off"}>{c.ok ? "✓" : "—"} {c.texto}</li>)}
              </ul>
            )}
          </div>

          <div className="fin-bloque">
            <div className="fin-titulo">Escribe <b>CONFIRMAR</b> para cerrar la orden y generar la nota</div>
            <input value={confirmar} onChange={(e) => setConfirmar(e.target.value.toUpperCase())} placeholder="CONFIRMAR" className="fin-confirmar" />
          </div>

          {error && <div className="error-text">{error}</div>}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose} disabled={enviando}>Cancelar</button>
            <button className="btn btn-primary" onClick={finalizar} disabled={!listo || enviando}>
              {enviando ? "Finalizando…" : conSaldo ? `Cobrar ${fmt(saldo)} y generar nota` : "Finalizar y generar nota"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
