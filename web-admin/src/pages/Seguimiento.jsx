import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import Auto3D from "../components/Auto3D";
import { ZONAS, zonasDe, peorEstado } from "../components/AutoInspeccion";
import { PIEZAS3D } from "../components/autoGeometria";
import "./seguimiento.css";

// Pasos del trabajo, en orden. Si la orden está en «Garantía» (u otra), solo se muestra la etiqueta.
const PASOS = [
  ["en_proceso", "Recibido"],
  ["abierto", "En piso"],
  ["pendiente", "Aprobación"],
  ["espera_refacciones", "Piezas"],
  ["en_reparacion", "Reparación"],
  ["listo_entrega", "Listo"],
];
const REFRESCO_MS = 30000;

const dinero = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
const fechaHora = (iso) => {
  if (!iso) return "";
  const f = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  return f.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const ICONOS = {
  cliente: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  refacciones: <><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  mano: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />,
  costos: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  inspeccion: <><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></>,
  legal: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>,
  avance: <><path d="M3 17l5-5 4 4 8-9" /><path d="M15 7h5v5" /></>,
  recepcion: <><path d="M3 15l1.6-4.6A2 2 0 0 1 6.5 9h11a2 2 0 0 1 1.9 1.4L21 15" /><rect x="3" y="15" width="18" height="4" rx="1.5" /><circle cx="7.5" cy="17" r=".7" /><circle cx="16.5" cy="17" r=".7" /></>,
  ubicacion: <><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
};
function Ico({ n, size = 20 }) {
  return (
    <svg className="seg-ico" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONOS[n]}</svg>
  );
}

// ---- Inspección: auto deportivo en alambre 3D con los puntos revisados ----
const NOMBRE_ESTADO = { bien: "Bien", regular: "Regular", mal: "Mal" };
const NOMBRES_ZONA = Object.fromEntries(Object.entries(ZONAS).map(([k, z]) => [k, z.nombre]));

function FotosPunto({ fotos }) {
  const [abierta, setAbierta] = useState(null); // índice de la foto abierta en el visor
  const total = fotos?.length || 0;
  const ir = (d) => setAbierta((i) => (i + d + total) % total);
  useEffect(() => {
    if (abierta === null) return undefined;
    const tecla = (e) => {
      if (e.key === "Escape") setAbierta(null);
      else if (e.key === "ArrowRight" && total > 1) ir(1);
      else if (e.key === "ArrowLeft" && total > 1) ir(-1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, total]);
  if (!total) return null;
  return (
    <>
      <div className="seg-fotos">
        {fotos.map((u, i) => (
          <button type="button" key={u} onClick={() => setAbierta(i)} aria-label={`Ver foto ${i + 1} de ${total}`}><img src={u} alt="Foto del punto revisado" loading="lazy" /></button>
        ))}
      </div>
      {abierta !== null && createPortal(
        <div className="seg-visor" role="dialog" aria-modal="true" aria-label="Foto del punto revisado" onClick={() => setAbierta(null)}>
          <button type="button" className="seg-visor-x" aria-label="Cerrar" onClick={() => setAbierta(null)}>×</button>
          {total > 1 && <button type="button" className="seg-visor-nav ant" aria-label="Foto anterior" onClick={(e) => { e.stopPropagation(); ir(-1); }}>‹</button>}
          <img src={fotos[abierta]} alt="Foto del punto revisado" onClick={(e) => e.stopPropagation()} />
          {total > 1 && <button type="button" className="seg-visor-nav sig" aria-label="Foto siguiente" onClick={(e) => { e.stopPropagation(); ir(1); }}>›</button>}
          {total > 1 && <span className="seg-visor-cont">{abierta + 1} / {total}</span>}
        </div>,
        document.body
      )}
    </>
  );
}

function AutoInspeccion({ puntos }) {
  const [sel, setSel] = useState(null);
  const zonas = {};
  puntos.forEach((p) => zonasDe(p.categoria, p.nombre).forEach((z) => { (zonas[z] = zonas[z] || []).push(p); }));
  const estadoZona = (z) => (zonas[z] ? peorEstado(zonas[z].map((p) => p.estado)) : "ninguno");
  const elegida = sel && zonas[sel] ? sel : null;
  return (
    <div className="seg-auto">
      <Auto3D nombres={NOMBRES_ZONA} estadoZona={estadoZona} elegida={elegida} onSelect={(z) => { if (zonas[z]) setSel(elegida === z ? null : z); }} />
      <div className="seg-auto-detalle" aria-live="polite">
        {elegida ? (
          <>
            <h3>{ZONAS[elegida].nombre}</h3>
            <ul>
              {zonas[elegida].map((p, i) => (
                <li key={i}>
                  <span className={`seg-chip ${p.estado}`}>{NOMBRE_ESTADO[p.estado]}</span>
                  <div><strong>{p.nombre}</strong>{p.comentario && <span>{p.comentario}</span>}<FotosPunto fotos={p.fotos} /></div>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="seg-vacio">Toca un punto del auto para ver qué se revisó ahí.</p>}
      </div>
    </div>
  );
}

// ---- Avance del vehículo: el auto se ilumina según la etapa y las zonas que el taller va atendiendo ----
function AvanceAuto({ avance }) {
  const pct = Math.round((avance?.progreso || 0) * 100);
  const zonas = avance?.zonas || {};
  const listas = Object.keys(zonas).filter((k) => zonas[k] === "listo").map((k) => NOMBRES_ZONA[k]).filter(Boolean);
  const enProceso = Object.keys(zonas).filter((k) => zonas[k] === "proceso").map((k) => NOMBRES_ZONA[k]).filter(Boolean);
  return (
    <section className="seg-tarjeta seg-avance" aria-labelledby="seg-t-avance">
      <h2 id="seg-t-avance"><Ico n="avance" />Avance de tu vehículo</h2>
      <Auto3D sinPuntos avance={avance} ayuda="Arrastra para girar" />
      <div className="seg-avance-barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del servicio">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="seg-avance-pct"><b>{pct}%</b> del servicio</p>
      {(listas.length > 0 || enProceso.length > 0) && (
        <ul className="seg-avance-zonas">
          {enProceso.map((n) => <li key={`p-${n}`} className="proceso"><i />{n}<span>En proceso</span></li>)}
          {listas.map((n) => <li key={`l-${n}`} className="listo"><i />{n}<span>Listo</span></li>)}
        </ul>
      )}
    </section>
  );
}

// ---- Recepción: daños con los que llegó el vehículo, marcados en el auto ----
function RecepcionAuto({ danos }) {
  const [sel, setSel] = useState(null);
  const porPieza = useMemo(() => {
    const m = {};
    danos.forEach((d) => { (m[d.pieza] = m[d.pieza] || []).push(d); });
    return m;
  }, [danos]);
  const puntos = useMemo(() => Object.fromEntries(Object.entries(PIEZAS3D).filter(([k]) => porPieza[k])), [porPieza]);
  const estadoPieza = (k) => (porPieza[k] ? (porPieza[k].some((d) => d.gravedad === "severo") ? "mal" : "regular") : "ninguno");
  const lista = sel && porPieza[sel] ? porPieza[sel] : danos;
  return (
    <section className="seg-tarjeta" aria-labelledby="seg-t-recep">
      <h2 id="seg-t-recep"><Ico n="recepcion" />Recepción del vehículo</h2>
      <p className="seg-recep-intro">Así recibimos tu vehículo. Estos son los detalles que se registraron al llegar.</p>
      <Auto3D puntos={puntos} compacto estadoZona={estadoPieza} elegida={sel && porPieza[sel] ? sel : null}
        onSelect={(k) => setSel(sel === k ? null : k)} ayuda="Arrastra para girar · toca una marca para ver el detalle" />
      <ul className="seg-danos">
        {lista.map((d, i) => (
          <li key={i}>
            <span className={`seg-chip ${d.gravedad === "severo" ? "mal" : "regular"}`}>{d.gravedad}</span>
            <div>
              <strong>{d.pieza_nombre}</strong>
              <span>{d.tipo_nombre}{d.comentario ? ` — ${d.comentario}` : ""}</span>
              <FotosPunto fotos={d.fotos} />
            </div>
          </li>
        ))}
      </ul>
      {sel && <button type="button" className="seg-ver-todos" onClick={() => setSel(null)}>Ver todos los detalles</button>}
    </section>
  );
}

export default function Seguimiento() {
  const { token } = useParams();
  const [estado, setEstado] = useState("cargando"); // cargando | ok | finalizada | no_valido
  const [datos, setDatos] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [sinConexion, setSinConexion] = useState(false);
  const [ultima, setUltima] = useState(null);
  const vigente = useRef(true);

  // La app aplica un zoom general (0.8) pensado para el panel de escritorio: aquí se anula.
  useEffect(() => {
    const prev = document.documentElement.style.zoom;
    document.documentElement.style.zoom = "1";
    const t = document.title;
    document.title = "Seguimiento de tu orden";
    return () => { document.documentElement.style.zoom = prev; document.title = t; };
  }, []);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/seguimiento/${encodeURIComponent(token)}`, { cache: "no-store", headers: { Accept: "application/json" } });
      let cuerpo = null;
      try { cuerpo = await res.json(); } catch { /* sin cuerpo */ }
      if (!vigente.current) return;
      setSinConexion(false);
      if (res.ok) { setDatos(cuerpo); setEstado("ok"); setUltima(new Date()); return; }
      if (res.status === 410) { setDatos(null); setMensaje(cuerpo?.mensaje || ""); setEstado("finalizada"); return; }
      if (res.status === 404) { setDatos(null); setMensaje(cuerpo?.mensaje || ""); setEstado("no_valido"); return; }
      setSinConexion(true); // 429 / 5xx: se conserva lo último que se vio
    } catch {
      if (vigente.current) setSinConexion(true);
    }
  }, [token]);

  useEffect(() => {
    vigente.current = true;
    cargar();
    return () => { vigente.current = false; };
  }, [cargar]);

  // Actualización automática mientras la orden siga en proceso y la pestaña esté visible.
  useEffect(() => {
    if (estado === "finalizada" || estado === "no_valido") return undefined;
    const id = setInterval(() => { if (document.visibilityState === "visible") cargar(); }, REFRESCO_MS);
    const alVolver = () => { if (document.visibilityState === "visible") cargar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", alVolver); };
  }, [estado, cargar]);

  if (estado === "cargando") {
    return <main className="seg"><div className="seg-wrap"><p className="seg-cargando" role="status">Consultando tu orden…</p></div></main>;
  }

  if (estado === "finalizada" || estado === "no_valido") {
    return (
      <main className="seg">
        <div className="seg-wrap">
          <section className="seg-aviso" role="status">
            <div className="seg-aviso-icono" aria-hidden="true">{estado === "finalizada" ? "✓" : "!"}</div>
            <h1>{estado === "finalizada" ? "Seguimiento finalizado" : "Enlace no disponible"}</h1>
            <p>{mensaje}</p>
          </section>
        </div>
      </main>
    );
  }

  const { taller, cliente, orden, conceptos, montos, inspeccion, recepcion } = datos;
  const verMontos = !!datos.montos_visibles && !!montos;
  const telDigitos = String(taller.telefono || "").replace(/\D/g, "");
  const waNumero = telDigitos.length === 10 ? `52${telDigitos}` : telDigitos.length >= 11 ? telDigitos : "";
  const wa = waNumero ? `https://wa.me/${waNumero}?text=${encodeURIComponent(`Hola, consulto sobre mi orden #${orden.folio} (${orden.vehiculo}).`)}` : null;
  const mapaQ = taller.direccion ? encodeURIComponent(taller.direccion) : null;
  const idx = PASOS.findIndex(([k]) => k === orden.etapa);
  const refacciones = conceptos.filter((c) => c.es_refaccion);
  const otros = conceptos.filter((c) => !c.es_refaccion);

  return (
    <main className="seg">
      <div className="seg-wrap">
        <header className="seg-top">
          <span className="seg-taller">{taller.nombre || "Taller"}</span>
          {wa && (
            <a className="seg-wa" href={wa} target="_blank" rel="noopener noreferrer" aria-label="Escribir al taller por WhatsApp">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12.04 2a9.9 9.9 0 0 0-8.45 15.07L2 22l5.07-1.55A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3 .92.95-2.93-.2-.31a8.2 8.2 0 1 1 6.73 3.64Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.3-2.88c-.25-.43.25-.4.71-1.32.08-.16.04-.3-.02-.42-.06-.12-.56-1.35-.76-1.85-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.3-.23.25-.86.84-.86 2.05s.88 2.38 1 2.55c.12.16 1.73 2.64 4.19 3.7 1.55.67 2.16.73 2.94.61.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.18-.06-.1-.23-.16-.47-.28Z" /></svg>
              WhatsApp
            </a>
          )}
        </header>

        {sinConexion && <p className="seg-offline" role="status">Sin conexión: mostrando lo último que se vio. Reintentando…</p>}

        <section className="seg-hero" aria-labelledby="seg-vehiculo">
          {taller.logo && <img className="seg-logo" src={taller.logo} alt={taller.nombre || "Logo del taller"} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
          <p className="seg-folio">Orden #{orden.folio}</p>
          <h1 id="seg-vehiculo">{orden.vehiculo}</h1>
          {orden.placas && <p className="seg-placas">Placas {orden.placas}</p>}
          <p className="seg-servicio">{orden.servicio}</p>
          <div className={`seg-estatus et-${orden.etapa}`} aria-live="polite">
            <span className="seg-punto" aria-hidden="true" />
            <span>{orden.estatus}</span>
          </div>
          {idx >= 0 && (
            <ol className="seg-pasos" aria-label="Avance del servicio">
              {PASOS.map(([k, etiqueta], i) => (
                <li key={k} className={i < idx ? "hecho" : i === idx ? "actual" : ""} aria-current={i === idx ? "step" : undefined}>
                  <span className="seg-paso-marca" aria-hidden="true">{i < idx ? "✓" : i + 1}</span>
                  <span className="seg-paso-nombre">{etiqueta}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {recepcion && idx >= 0 && <AvanceAuto avance={recepcion.avance} />}

        <div className="seg-cols">
          <div className="seg-col">
            <section className="seg-tarjeta" aria-labelledby="seg-t-cli">
              <h2 id="seg-t-cli"><Ico n="cliente" />Datos del cliente</h2>
              <dl className="seg-datos">
                {cliente && <div><dt>Cliente</dt><dd>{cliente}</dd></div>}
                <div><dt>Vehículo</dt><dd>{orden.vehiculo}</dd></div>
                {orden.placas && <div><dt>Placas</dt><dd>{orden.placas}</dd></div>}
                <div><dt>Servicio</dt><dd>{orden.servicio}</dd></div>
                {orden.fecha_entrada && <div><dt>Recibido</dt><dd>{fechaHora(orden.fecha_entrada)}</dd></div>}
              </dl>
            </section>

        {recepcion && recepcion.danos.length > 0 && <RecepcionAuto danos={recepcion.danos} />}

        {inspeccion && (
          <section className="seg-tarjeta" aria-labelledby="seg-t-insp">
            <h2 id="seg-t-insp"><Ico n="inspeccion" />Inspección del vehículo</h2>
            <div className="seg-insp-resumen">
              <div className="bien"><b>{inspeccion.resumen.bien}</b><span>Bien</span></div>
              <div className="regular"><b>{inspeccion.resumen.regular}</b><span>Regular</span></div>
              <div className="mal"><b>{inspeccion.resumen.mal}</b><span>Atención</span></div>
            </div>
            <AutoInspeccion puntos={inspeccion.puntos} />
            {inspeccion.puntos.some((p) => p.estado !== "bien") && (
              <div className="seg-insp-lista">
                <h3>Puntos que requieren atención</h3>
                <ul>
                  {inspeccion.puntos.filter((p) => p.estado !== "bien").sort((a, b) => (a.estado === b.estado ? 0 : a.estado === "mal" ? -1 : 1)).map((p, i) => (
                    <li key={i}>
                      <span className={`seg-chip ${p.estado}`}>{NOMBRE_ESTADO[p.estado]}</span>
                      <div><strong>{p.nombre}</strong>{p.comentario && <span>{p.comentario}</span>}<FotosPunto fotos={p.fotos} /></div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="seg-leyenda" aria-hidden="true">
              <span><i className="bien" />Bien</span><span><i className="regular" />Regular</span><span><i className="mal" />Atención</span><span><i className="ninguno" />Sin revisar</span>
            </div>
          </section>
        )}

        <section className="seg-tarjeta" aria-labelledby="seg-t-ref">
          <h2 id="seg-t-ref"><Ico n="refacciones" />Refacciones</h2>
          {refacciones.length === 0 ? <p className="seg-vacio">Aún no se han agregado refacciones.</p> : (
            <ul className="seg-lista">
              {refacciones.map((c, i) => (
                <li key={i}>
                  <div>
                    <span className="seg-concepto">{c.descripcion}</span>
                    {verMontos ? (
                      <span className="seg-sub">
                        {c.cantidad > 1 ? `${c.cantidad} piezas · ` : ""}Refacción {dinero(c.refaccion)}
                        {c.mano_obra ? ` · Mano de obra ${dinero(c.mano_obra)}` : ""}{c.extra ? ` · Extra ${dinero(c.extra)}` : ""}
                      </span>
                    ) : (c.cantidad > 1 && <span className="seg-sub">{c.cantidad} piezas</span>)}
                  </div>
                  {verMontos && <strong className="seg-importe">{dinero(c.importe)}</strong>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {otros.length > 0 && (
          <section className="seg-tarjeta" aria-labelledby="seg-t-otros">
            <h2 id="seg-t-otros"><Ico n="mano" />Mano de obra y otros conceptos</h2>
            <ul className="seg-lista">
              {otros.map((c, i) => (
                <li key={i}>
                  <div><span className="seg-concepto">{c.descripcion}</span></div>
                  {verMontos && <strong className="seg-importe">{dinero(c.importe)}</strong>}
                </li>
              ))}
            </ul>
          </section>
        )}

          </div>

          <div className="seg-col">
        {verMontos ? (
          <section className="seg-tarjeta seg-total" aria-labelledby="seg-t-total">
            <h2 id="seg-t-total"><Ico n="costos" />Resumen de costos</h2>
            <dl>
              <div><dt>Mano de obra</dt><dd>{dinero(montos.mano_obra)}</dd></div>
              <div><dt>Refacciones</dt><dd>{dinero(montos.refacciones)}</dd></div>
              {montos.extras > 0 && <div><dt>Otros</dt><dd>{dinero(montos.extras)}</dd></div>}
              <div className="sep"><dt>Subtotal</dt><dd>{dinero(montos.subtotal)}</dd></div>
              {montos.iva > 0 && <div><dt>IVA ({montos.iva_porcentaje}%)</dt><dd>{dinero(montos.iva)}</dd></div>}
              <div className="fuerte"><dt>Total acumulado</dt><dd>{dinero(montos.total)}</dd></div>
              {montos.abonado > 0 && <div><dt>Abonado</dt><dd>− {dinero(montos.abonado)}</dd></div>}
              <div className="saldo"><dt>Saldo pendiente</dt><dd>{dinero(montos.saldo)}</dd></div>
            </dl>
            <p className="seg-nota">Los montos pueden cambiar mientras el trabajo siga en proceso.</p>
          </section>
        ) : (
          <section className="seg-tarjeta seg-total" aria-labelledby="seg-t-total">
            <h2 id="seg-t-total"><Ico n="costos" />Resumen de costos</h2>
            <p className="seg-vacio">Los costos se mostrarán aquí cuando tu vehículo esté listo para entrega.</p>
          </section>
        )}

        {mapaQ && (
          <section className="seg-tarjeta seg-mapa" aria-labelledby="seg-t-mapa">
            <h2 id="seg-t-mapa"><Ico n="ubicacion" />Ubicación del taller</h2>
            <div className="seg-dir">
              <Ico n="ubicacion" size={26} />
              <div>
                <strong>{taller.nombre || "Taller"}</strong>
                <span>{taller.direccion}</span>
              </div>
            </div>
            <div className="seg-mapa-marco">
              <iframe
                title={`Mapa de ${taller.nombre || "el taller"}`}
                src={`https://www.google.com/maps?q=${mapaQ}&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
            <a className="seg-btn-mapa" href={`https://www.google.com/maps/search/?api=1&query=${mapaQ}`} target="_blank" rel="noopener noreferrer">
              Abrir en Google Maps
            </a>
          </section>
        )}
          </div>
        </div>

        <details className="seg-legal">
          <summary><Ico n="legal" size={14} />Avisos legales</summary>
          <ul>
            <li>Este seguimiento es informativo y se actualiza conforme avanza el trabajo. No es una factura, nota de remisión ni comprobante fiscal.</li>
            <li>Los costos son estimados y pueden cambiar si se detectan trabajos adicionales. Todo cargo extra requiere tu autorización previa.</li>
            <li>La inspección refleja la revisión realizada al momento de recibir el vehículo y no garantiza la ausencia de otras fallas.</li>
            <li>El enlace es personal y confidencial: no lo compartas. Se desactiva automáticamente cuando la orden se finaliza.</li>
            <li>Tus datos se tratan conforme al Aviso de Privacidad del taller y de ALDM AutoCore.</li>
          </ul>
        </details>

        <footer className="seg-pie">
          Se actualiza solo{ultima ? ` · última consulta ${ultima.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </footer>
      </div>
    </main>
  );
}
