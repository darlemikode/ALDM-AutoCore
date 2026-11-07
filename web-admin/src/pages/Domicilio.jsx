import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "./domicilio.css";

const InspeccionForm = lazy(() => import("../components/InspeccionForm"));

// Mismos pasos y nombres que la página de seguimiento del cliente
const PASOS = [
  ["en_proceso", "Recibido"],
  ["abierto", "En piso"],
  ["pendiente", "Aprobación"],
  ["espera_refacciones", "Piezas"],
  ["en_reparacion", "Reparación"],
  ["listo_entrega", "Listo"],
];
const REFRESCO_MS = 30000;
const fechaHora = (iso) => {
  if (!iso) return "";
  const f = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  return f.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};
// Reduce la foto (el celular da 4-8 MB) a un JPEG de máx. 1600 px antes de subirla
async function reducirFoto(archivo) {
  try {
    const bmp = await createImageBitmap(archivo);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bmp.width * k); lienzo.height = Math.round(bmp.height * k);
    lienzo.getContext("2d").drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.82));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : archivo;
  } catch { return archivo; }
}
const soloRuta = (u) => { try { const x = new URL(u, window.location.origin); return x.origin === window.location.origin ? x.pathname : u; } catch { return u; } };

// Solo dígitos y un punto decimal con máximo 2 decimales.
const soloMonto = (v) => {
  const limpio = String(v).replace(/[^0-9.]/g, "");
  const [ent, ...resto] = limpio.split(".");
  return resto.length ? `${ent}.${resto.join("").slice(0, 2)}` : ent;
};
const fmtMonto = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

/** Refacciones y mano de obra del servicio: buscar en el catálogo, escribir una que no esté o registrar mano de obra. Sin precios. */
function RefaccionesUsadas({ token, usadas, onCambio }) {
  const [panel, setPanel] = useState(null); // formulario abierto: "refaccion" | "mano_obra"
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [cant, setCant] = useState({}); // id -> cantidad elegida
  const [seleccion, setSeleccion] = useState(null); // refacción elegida en los resultados
  const [precios, setPrecios] = useState({}); // id -> precio por pieza capturado (opcional)
  const [libre, setLibre] = useState("");
  const [cantLibre, setCantLibre] = useState(1);
  const [precioLibre, setPrecioLibre] = useState(""); // precio por pieza (opcional)
  const [edit, setEdit] = useState(null); // { id, cantidad, monto } fila en edición
  const [verLibre, setVerLibre] = useState(false);
  const [mano, setMano] = useState(""); // monto de la mano de obra
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState(null);
  const base = `/api/domicilio/${encodeURIComponent(token)}/refacciones`;
  const refs = (usadas || []).filter((u) => u.tipo !== "mano_obra");
  const manos = (usadas || []).filter((u) => u.tipo === "mano_obra");

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setResultados([]); return undefined; }
    const espera = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(`${base}/buscar?q=${encodeURIComponent(t)}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        setResultados(res.ok ? data?.resultados || [] : []);
      } catch { setResultados([]); } finally { setBuscando(false); }
    }, 350);
    return () => clearTimeout(espera);
  }, [q, base]);

  async function llamar(url, opciones, okTexto) {
    setTrabajando(true); setMsg(null);
    try {
      const res = await fetch(url, opciones);
      const data = await res.json().catch(() => null);
      if (!res.ok) { setMsg({ tipo: "error", texto: data?.mensaje || data?.detail || "No se pudo completar. Intenta de nuevo." }); return false; }
      onCambio(data); setMsg({ tipo: "ok", texto: okTexto });
      return true;
    } catch { setMsg({ tipo: "error", texto: "Sin conexión. Intenta de nuevo." }); return false; } finally { setTrabajando(false); }
  }
  const post = (cuerpo) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const agregar = async (r) => {
    if (await llamar(base, post({ id_refaccion: r.id, cantidad: cant[r.id] || 1, monto: Number(precios[r.id]) > 0 ? Number(precios[r.id]) : null }), `${r.nombre} agregada.`)) { setQ(""); setResultados([]); setCant({}); setPrecios({}); setSeleccion(null); setPanel(null); }
  };
  async function agregarLibre(e) {
    e.preventDefault();
    const texto = libre.trim();
    if (texto.length < 2) return;
    if (await llamar(base, post({ descripcion: texto, cantidad: cantLibre, monto: Number(precioLibre) > 0 ? Number(precioLibre) : null }), Number(precioLibre) > 0 ? "Refacción agregada." : "Refacción agregada. El taller le pondrá precio.")) { setLibre(""); setCantLibre(1); setPrecioLibre(""); setVerLibre(false); setPanel(null); }
  }
  async function agregarMano(e) {
    e.preventDefault();
    const monto = Number(String(mano).replace(/[^0-9.]/g, ""));
    if (!(monto > 0)) return;
    if (await llamar(base, post({ tipo: "mano_obra", monto }), "Mano de obra agregada.")) { setMano(""); setPanel(null); }
  }
  const quitar = (u) => llamar(`${base}/${u.id}`, { method: "DELETE" }, u.tipo === "mano_obra" ? "Mano de obra quitada." : "Refacción quitada.");
  const paso = (id, d, tope = 20) => setCant((c) => ({ ...c, [id]: Math.min(tope, Math.max(1, (c[id] || 1) + d)) }));
  const abrirPanel = (k) => { setPanel((p) => (p === k ? null : k)); setMsg(null); setEdit(null); };
  const importeDe = (u) => (u.tipo === "mano_obra" ? (u.monto || 0) : (u.monto || 0) * (u.cantidad || 1));
  const total = (usadas || []).reduce((a, u) => a + importeDe(u), 0);

  const empezarEdicion = (u) => {
    if (edit && edit.id === u.id) { setEdit(null); return; }
    setMsg(null); setEdit({ id: u.id, cantidad: u.cantidad || 1, monto: u.monto > 0 ? String(u.monto) : "" });
  };
  async function guardarEdicion(u) {
    const monto = Number(edit.monto);
    if (u.tipo === "mano_obra" && !(monto > 0)) return;
    const cuerpo = u.tipo === "mano_obra" ? { monto } : { cantidad: edit.cantidad, monto: monto > 0 ? monto : null };
    if (await llamar(`${base}/${u.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }, "Cambios guardados.")) setEdit(null);
  }

  const icoCaja = <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>;
  const icoMartillo = <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 7 3 3" /><path d="M15 4.5 19.5 9 17 11.5 12.5 7Z" /><path d="m12.5 9.5-8.4 8.4a1.7 1.7 0 0 0 2.4 2.4L15 12" /></svg>;
  const icoFlecha = (abierta) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{abierta ? <path d="m6 15 6-6 6 6" /> : <path d="m6 9 6 6 6-6" />}</svg>;

  const tarjeta = (u) => {
    const abierta = edit && edit.id === u.id;
    const mo = u.tipo === "mano_obra";
    const importe = importeDe(u);
    const sub = mo ? "Mano de obra" : (u.monto > 0 ? (u.cantidad > 1 ? `${u.cantidad} × ${fmtMonto(u.monto)}` : "") : "Sin precio aún");
    return (
      <li key={u.id} className={`dmc-conc${abierta ? " abierta" : ""}`}>
        <button type="button" className="dmc-conc-fila" onClick={() => empezarEdicion(u)} aria-expanded={abierta} disabled={trabajando}>
          <span className={`dmc-conc-ico${mo ? " mo" : ""}`}>{mo ? icoMartillo : icoCaja}</span>
          <span className="dmc-conc-txt"><b>{mo ? "Mano de obra" : u.nombre}</b>{sub && <span className="dmc-conc-sub">{sub}</span>}</span>
          {!mo && u.cantidad > 1 && <span className="dmc-conc-cant"><b>{u.cantidad}</b><i>pzas</i></span>}
          <span className="dmc-conc-importe">{importe > 0 ? fmtMonto(importe) : "—"}</span>
          <span className="dmc-conc-flecha">{icoFlecha(abierta)}</span>
        </button>
        {abierta && (
          <div className="dmc-conc-extra">
            <div className="dmc-conc-controles">
              {!mo && (
                <div className="dmc-stepper" role="group" aria-label="Cantidad">
                  <button type="button" onClick={() => setEdit((e) => ({ ...e, cantidad: Math.max(1, e.cantidad - 1) }))} disabled={edit.cantidad <= 1} aria-label="Menos">−</button>
                  <b>{edit.cantidad}</b>
                  <button type="button" onClick={() => setEdit((e) => ({ ...e, cantidad: Math.min(99, e.cantidad + 1) }))} aria-label="Más">+</button>
                </div>
              )}
              <div className="dmc-conc-campo">
                <label>{mo ? "Monto" : "Precio unitario"}</label>
                <div className="dmc-monto-campo">
                  <span aria-hidden="true">$</span>
                  <input className="dmc-ref-input" value={edit.monto} onChange={(e) => setEdit((x) => ({ ...x, monto: soloMonto(e.target.value) }))} inputMode="decimal" maxLength={10} placeholder="0.00" aria-label={mo ? "Monto" : "Precio unitario"} />
                </div>
              </div>
            </div>
            <div className="dmc-conc-acciones">
              <button type="button" className="dmc-btn dmc-peligro" onClick={() => quitar(u)} disabled={trabajando}>Quitar</button>
              <button type="button" className="dmc-btn" onClick={() => guardarEdicion(u)} disabled={trabajando || (mo && !(Number(edit.monto) > 0))}>Guardar</button>
            </div>
          </div>
        )}
      </li>
    );
  };

  const hayConceptos = refs.length > 0 || manos.length > 0;

  return (
    <section className="dmc-tarjeta">
      <small>Refacciones y mano de obra</small>

      {!hayConceptos && !panel && (
        <div className="dmc-vacio">
          <p className="dmc-vacio-titulo">Empieza a armar la orden</p>
          <p className="dmc-meta">Registra lo que usaste y el trabajo realizado.</p>
          <div className="dmc-vacio-ops">
            <button type="button" className="dmc-vacio-op" onClick={() => abrirPanel("refaccion")}><span className="dmc-conc-ico">{icoCaja}</span><b>Refacción</b><span>Del catálogo</span></button>
            <button type="button" className="dmc-vacio-op" onClick={() => abrirPanel("mano_obra")}><span className="dmc-conc-ico mo">{icoMartillo}</span><b>Mano de obra</b><span>O cualquier cargo</span></button>
          </div>
        </div>
      )}

      {(hayConceptos || panel) && (
        <>
          <div className="dmc-seccion-fila">
            <h3 className="dmc-grupo">Refacciones{refs.length > 0 ? ` · ${refs.length}` : ""}</h3>
            <button type="button" className={`dmc-chico${panel === "refaccion" ? " activo" : ""}`} onClick={() => abrirPanel("refaccion")}>{panel === "refaccion" ? "Cerrar" : "+ Agregar"}</button>
          </div>
          {panel === "refaccion" && (
            <div className="dmc-panel">
            <div className="dmc-ref-campo">
              {!q && <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>}
              <input id="dmc-ref-q" className="dmc-ref-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, número de parte o categoría" autoComplete="off" aria-label="Buscar refacción" />
            </div>
            {buscando && <p className="dmc-meta">Buscando…</p>}
            {resultados.length > 0 && (
              <ul className="dmc-ref-lista">
                {resultados.map((r) => {
                  const n = cant[r.id] || 1;
                  const sel = seleccion === r.id;
                  const detalle = [r.numero, r.categoria].filter(Boolean).join(" · ");
                  return (
                    <li key={r.id} className={sel ? "sel" : ""}>
                      <button type="button" className="dmc-res-fila" onClick={() => setSeleccion(sel ? null : r.id)} aria-expanded={sel}>
                        <span className="dmc-res-txt"><b>{r.nombre}</b>{detalle && <span>{detalle}</span>}</span>
                        <span className="dmc-res-mas" aria-hidden="true">{sel ? "−" : "+"}</span>
                      </button>
                      {sel && (
                        <div className="dmc-res-extra">
                          <div className="dmc-res-campos">
                            <div className="dmc-conc-campo">
                              <label>Cantidad</label>
                              <div className="dmc-stepper" role="group" aria-label="Cantidad">
                                <button type="button" onClick={() => paso(r.id, -1)} disabled={n <= 1}>−</button>
                                <b>{n}</b>
                                <button type="button" onClick={() => paso(r.id, 1, 99)} disabled={n >= 99}>+</button>
                              </div>
                            </div>
                            <div className="dmc-conc-campo">
                              <label htmlFor={`dmc-p-${r.id}`}>Precio por pieza</label>
                              <div className="dmc-monto-campo">
                                <span aria-hidden="true">$</span>
                                <input id={`dmc-p-${r.id}`} className="dmc-ref-input" value={precios[r.id] || ""} onChange={(e) => setPrecios((p) => ({ ...p, [r.id]: soloMonto(e.target.value) }))} inputMode="decimal" maxLength={10} placeholder="Opcional" autoComplete="off" />
                              </div>
                            </div>
                          </div>
                          <button type="button" className="dmc-btn" disabled={trabajando} onClick={() => agregar(r)}>Agregar a la orden</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {q.trim().length >= 2 && !buscando && resultados.length === 0 && <p className="dmc-meta">Sin resultados. Puedes escribirla manualmente abajo.</p>}

            {!verLibre ? (
              <button type="button" className="dmc-enlace" onClick={() => setVerLibre(true)}>+ ¿No está en la lista? Escríbela</button>
            ) : (
              <form onSubmit={agregarLibre} className="dmc-ref-libre">
                <label htmlFor="dmc-ref-libre">Refacción que no está en la lista</label>
                <input id="dmc-ref-libre" className="dmc-ref-input" value={libre} onChange={(e) => setLibre(e.target.value)} maxLength={150} placeholder="Ej. Tornillo de cárter" autoFocus />
                <label htmlFor="dmc-ref-precio">Precio por pieza (opcional)</label>
                <div className="dmc-monto-campo">
                  <span aria-hidden="true">$</span>
                  <input id="dmc-ref-precio" className="dmc-ref-input" value={precioLibre} onChange={(e) => setPrecioLibre(soloMonto(e.target.value))} inputMode="decimal" maxLength={10} placeholder="0.00" autoComplete="off" />
                </div>
                <div className="dmc-ref-libre-fila">
                  <div className="dmc-paso" role="group" aria-label="Cantidad">
                    <button type="button" onClick={() => setCantLibre((n) => Math.max(1, n - 1))} disabled={cantLibre <= 1} aria-label="Menos">−</button>
                    <b>{cantLibre}</b>
                    <button type="button" onClick={() => setCantLibre((n) => Math.min(20, n + 1))} aria-label="Más">+</button>
                  </div>
                  <button className="dmc-btn dmc-ref-add" disabled={trabajando || libre.trim().length < 2}>Agregar a la orden</button>
                </div>
              </form>
            )}
            </div>
          )}
          {refs.length > 0 ? <ul className="dmc-conceptos">{refs.map(tarjeta)}</ul> : (panel !== "refaccion" && <p className="dmc-meta">Sin refacciones.</p>)}

          <div className="dmc-seccion-fila">
            <h3 className="dmc-grupo">Mano de obra{manos.length > 0 ? ` · ${manos.length}` : ""}</h3>
            <button type="button" className={`dmc-chico${panel === "mano_obra" ? " activo" : ""}`} onClick={() => abrirPanel("mano_obra")}>{panel === "mano_obra" ? "Cerrar" : "+ Agregar"}</button>
          </div>
          {panel === "mano_obra" && (
            <div className="dmc-panel">
          <form onSubmit={agregarMano} className="dmc-ref-libre dmc-mano">
            <label htmlFor="dmc-mano">Monto de la mano de obra</label>
            <div className="dmc-monto-campo">
              <span aria-hidden="true">$</span>
              <input id="dmc-mano" className="dmc-ref-input" value={mano} onChange={(e) => setMano(soloMonto(e.target.value))} inputMode="decimal" maxLength={10} placeholder="0.00" autoComplete="off" />
            </div>
            <button className="dmc-btn" disabled={trabajando || !(Number(String(mano).replace(/[^0-9.]/g, "")) > 0)}>Agregar mano de obra</button>
          </form>
            </div>
          )}
          {manos.length > 0 ? <ul className="dmc-conceptos">{manos.map(tarjeta)}</ul> : (panel !== "mano_obra" && <p className="dmc-meta">Sin mano de obra.</p>)}

          {total > 0 && (
            <div className="dmc-subtotal"><span>Total de conceptos</span><b>{fmtMonto(total)}</b></div>
          )}
        </>
      )}
      {msg && <p className={msg.tipo === "ok" ? "dmc-ok" : "dmc-error"} role="status">{msg.texto}</p>}
    </section>
  );
}

/** Cobro en el domicilio: registra un abono (efectivo, tarjeta o mixto) igual que en la orden del taller. */
function Cobro({ token, cobro, onCambio }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState("efectivo");
  const [monto, setMonto] = useState("");
  const [ef, setEf] = useState("");
  const [tar, setTar] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState(null);
  if (!cobro) return null;
  const saldo = cobro.saldo || 0;
  const num = (v) => Number(String(v).replace(/[^0-9.]/g, "")) || 0;
  const aCobrar = tipo === "mixto" ? Math.round((num(ef) + num(tar)) * 100) / 100 : num(monto);
  const NOMBRE = { efectivo: "Efectivo", tarjeta: "Tarjeta", mixto: "Mixto" };

  function abrir() { setMsg(null); setTipo("efectivo"); setMonto(saldo > 0 ? String(saldo) : ""); setEf(""); setTar(""); setAbierto(true); }
  async function registrar(e) {
    e.preventDefault();
    if (!(aCobrar > 0)) return;
    setTrabajando(true); setMsg(null);
    try {
      const cuerpo = tipo === "mixto" ? { tipo_pago: tipo, efectivo: num(ef), tarjeta: num(tar) } : { tipo_pago: tipo, monto: num(monto) };
      const res = await fetch(`/api/domicilio/${encodeURIComponent(token)}/cobro`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setMsg({ tipo: "error", texto: data?.mensaje || data?.detail || "No se pudo registrar el cobro." }); return; }
      onCambio(data);
      setAbierto(false);
      setMsg({ tipo: "ok", texto: data.cambio > 0 ? `Cobro registrado. Entrega ${fmtMonto(data.cambio)} de cambio.` : "Cobro registrado." });
    } catch { setMsg({ tipo: "error", texto: "Sin conexión. Intenta de nuevo." }); } finally { setTrabajando(false); }
  }

  return (
    <section className="dmc-tarjeta">
      <small>Cobro</small>
      <div className="dmc-cobro-resumen">
        <div><span>Total</span><b>{fmtMonto(cobro.total || 0)}</b></div>
        <div><span>Cobrado</span><b>{fmtMonto(cobro.abonado || 0)}</b></div>
        <div className={saldo > 0 ? "saldo" : "pagado"}><span>{saldo > 0 ? "Saldo" : "Pagado"}</span><b>{fmtMonto(Math.max(saldo, 0))}</b></div>
      </div>
      {cobro.abonos?.length > 0 && (
        <ul className="dmc-cobro-lista">
          {cobro.abonos.map((a) => (
            <li key={a.numero}><span>{NOMBRE[a.tipo] || a.tipo}{a.fecha ? ` · ${new Date(a.fecha).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}` : ""}</span><b>{fmtMonto(a.monto)}</b></li>
          ))}
        </ul>
      )}
      {saldo > 0 && !abierto && <button type="button" className="dmc-btn" onClick={abrir} disabled={!(cobro.total > 0)}>{cobro.total > 0 ? "Cobrar" : "Agrega conceptos para cobrar"}</button>}
      {abierto && (
        <form onSubmit={registrar} className="dmc-ref-libre dmc-cobro-form">
          <label>Forma de pago</label>
          <div className="dmc-chips dmc-chips-pago" role="group" aria-label="Forma de pago">
            {["efectivo", "tarjeta", "mixto"].map((k) => (
              <button type="button" key={k} className={tipo === k ? "activo" : ""} onClick={() => setTipo(k)}>{NOMBRE[k]}</button>
            ))}
          </div>
          {tipo === "mixto" ? (
            <>
              <label htmlFor="dmc-cb-ef">En efectivo</label>
              <div className="dmc-monto-campo"><span aria-hidden="true">$</span><input id="dmc-cb-ef" className="dmc-ref-input" value={ef} onChange={(e) => setEf(soloMonto(e.target.value))} inputMode="decimal" maxLength={10} placeholder="0.00" autoComplete="off" /></div>
              <label htmlFor="dmc-cb-tar">Con tarjeta</label>
              <div className="dmc-monto-campo"><span aria-hidden="true">$</span><input id="dmc-cb-tar" className="dmc-ref-input" value={tar} onChange={(e) => setTar(soloMonto(e.target.value))} inputMode="decimal" maxLength={10} placeholder="0.00" autoComplete="off" /></div>
            </>
          ) : (
            <>
              <label htmlFor="dmc-cb-monto">Monto recibido</label>
              <div className="dmc-monto-campo"><span aria-hidden="true">$</span><input id="dmc-cb-monto" className="dmc-ref-input" value={monto} onChange={(e) => setMonto(soloMonto(e.target.value))} inputMode="decimal" maxLength={10} placeholder="0.00" autoComplete="off" autoFocus /></div>
            </>
          )}
          {aCobrar > saldo && <p className="dmc-meta">Cambio a entregar: <b>{fmtMonto(aCobrar - saldo)}</b></p>}
          <div className="dmc-edicion-acciones">
            <button type="button" className="dmc-btn dmc-sec" onClick={() => setAbierto(false)} disabled={trabajando}>Cancelar</button>
            <button className="dmc-btn" disabled={trabajando || !(aCobrar > 0)}>{trabajando ? "Registrando…" : `Registrar ${aCobrar > 0 ? fmtMonto(Math.min(aCobrar, saldo)) : "cobro"}`}</button>
          </div>
        </form>
      )}
      {msg && <p className={msg.tipo === "ok" ? "dmc-ok" : "dmc-error"} role="status">{msg.texto}</p>}
    </section>
  );
}

/** Finalizar: cierra la orden, genera la nota PDF y deja el WhatsApp listo para el cliente. */
function Finalizar({ token, cobro, tieneConceptos, onFinal }) {
  const [confirmando, setConfirmando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const saldo = cobro?.saldo || 0;
  const bloqueo = !tieneConceptos ? "Agrega refacciones o mano de obra para finalizar." : saldo > 0.005 ? `Cobra el saldo de ${fmtMonto(saldo)} para poder finalizar.` : "";

  async function finalizar() {
    setTrabajando(true); setError("");
    try {
      const res = await fetch(`/api/domicilio/${encodeURIComponent(token)}/finalizar`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.mensaje || data?.detail || "No se pudo finalizar. Intenta de nuevo."); setConfirmando(false); return; }
      onFinal(data);
    } catch { setError("Sin conexión. Intenta de nuevo."); setConfirmando(false); } finally { setTrabajando(false); }
  }

  return (
    <section className="dmc-tarjeta">
      <small>Finalizar servicio</small>
      {bloqueo ? <p className="dmc-meta">{bloqueo}</p> : <p className="dmc-meta">Al finalizar se cierra la orden y se genera la nota en PDF para el cliente.</p>}
      {!confirmando ? (
        <button type="button" className="dmc-btn" disabled={!!bloqueo} onClick={() => { setError(""); setConfirmando(true); }}>Finalizar servicio</button>
      ) : (
        <div className="dmc-edicion-acciones">
          <button type="button" className="dmc-btn dmc-sec" onClick={() => setConfirmando(false)} disabled={trabajando}>Cancelar</button>
          <button type="button" className="dmc-btn" onClick={finalizar} disabled={trabajando}>{trabajando ? "Finalizando…" : "Sí, finalizar"}</button>
        </div>
      )}
      {error && <p className="dmc-error" role="alert">{error}</p>}
    </section>
  );
}

/** Pantalla final: nota lista y envío por WhatsApp al cliente. */
function ServicioFinalizado({ r }) {
  let tel = String(r.cliente_telefono || "").replace(/\D/g, "");
  if (tel.length === 10) tel = `52${tel}`;
  const nota = r.nota_url || "";
  const texto = r.mensaje_whatsapp || "";
  const wa = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : null;
  return (
    <main className="dmc-pagina">
      <section className="dmc-tarjeta dmc-final">
        <div className="dmc-final-ico" aria-hidden="true">✓</div>
        <h1>Servicio finalizado</h1>
        <p className="dmc-meta">Orden #{r.folio}{r.cliente ? ` · ${r.cliente}` : ""}</p>
        <b className="dmc-final-total">{fmtMonto(r.total || 0)}</b>
        {r.enviado_auto && <p className="dmc-ok">La nota se está enviando al cliente por WhatsApp.</p>}
        {wa ? (
          <a className="dmc-btn dmc-wa" href={wa} target="_blank" rel="noopener noreferrer">Enviar nota por WhatsApp</a>
        ) : <p className="dmc-meta">El cliente no tiene teléfono registrado. Compártele la nota con el botón de abajo.</p>}
        <a className="dmc-btn dmc-sec" href={nota || `/api/domicilio/${encodeURIComponent(window.location.pathname.split("/").pop())}/nota`} target="_blank" rel="noopener noreferrer">Ver nota en PDF</a>
        <p className="dmc-meta">El cliente también la recibe en su app y por correo si lo tiene registrado.</p>
      </section>
    </main>
  );
}

/** Página pública para el mecánico: a dónde va, qué servicio hará y el código para iniciar. */
export default function Domicilio() {
  const { token } = useParams();
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState(null); // { codigo, mensaje }
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorCodigo, setErrorCodigo] = useState("");
  const [nota, setNota] = useState("");
  const [accion, setAccion] = useState(""); // qué se está enviando: "etapa" | "nota" | "foto"
  const [aviso, setAviso] = useState(null); // { tipo: "ok" | "error", texto }
  const [final, setFinal] = useState(null); // resultado de finalizar (pantalla de nota y WhatsApp)
  const [verInsp, setVerInsp] = useState(false); // abre la inspección con el auto (la misma de la orden)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/domicilio/${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok) { setDatos(data); setFallo(null); }
      else setFallo(data || { codigo: "error", mensaje: "No se pudo cargar el servicio." });
    } catch {
      setFallo((f) => f || { codigo: "red", mensaje: "Sin conexión. Reintentando…" });
    }
  }, [token]);

  useEffect(() => {
    document.title = "Servicio a domicilio";
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(t);
  }, [cargar]);

  async function iniciar(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(codigo)) { setErrorCodigo("El código tiene 6 dígitos."); return; }
    setEnviando(true); setErrorCodigo("");
    try {
      const res = await fetch(`/api/domicilio/${encodeURIComponent(token)}/iniciar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) setErrorCodigo(data?.mensaje || data?.detail || "Código incorrecto.");
      else setCodigo("");
      await cargar();
    } catch {
      setErrorCodigo("Sin conexión. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  // Acciones de progreso (solo con el servicio iniciado): cambian la orden y el taller/cliente la ven en vivo
  async function enviarAccion(tipo, ruta, opciones, okTexto) {
    setAccion(tipo); setAviso(null);
    try {
      const res = await fetch(`/api/domicilio/${encodeURIComponent(token)}/${ruta}`, opciones);
      const data = await res.json().catch(() => null);
      if (!res.ok) { setAviso({ tipo: "error", de: tipo, texto: data?.mensaje || data?.detail || "No se pudo guardar. Intenta de nuevo." }); return false; }
      setDatos((d) => (d ? { ...d, ...data } : d));
      setAviso({ tipo: "ok", de: tipo, texto: okTexto });
      return true;
    } catch {
      setAviso({ tipo: "error", de: tipo, texto: "Sin conexión. Intenta de nuevo." });
      return false;
    } finally {
      setAccion("");
    }
  }
  const marcarEtapa = (etapa) => enviarAccion("etapa", "etapa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ etapa }) }, "Estado actualizado. El taller ya lo ve.");
  async function guardarNota(e) {
    e.preventDefault();
    const texto = nota.trim();
    if (texto.length < 2) return;
    if (await enviarAccion("nota", "nota", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) }, "Nota guardada.")) setNota("");
  }
  async function subirFoto(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setAccion("foto"); setAviso(null);
    const cuerpo = new FormData();
    cuerpo.append("archivo", await reducirFoto(archivo));
    await enviarAccion("foto", "foto", { method: "POST", body: cuerpo }, "Foto subida.");
  }

  if (final) return <ServicioFinalizado r={final} />;

  if (!datos) {
    return (
      <main className="dmc-pagina">
        <div className="dmc-tarjeta dmc-centro">
          {fallo && fallo.codigo !== "red" ? (<><h1>{fallo.codigo === "finalizada" ? "Servicio finalizado" : "Enlace no válido"}</h1><p>{fallo.mensaje}</p></>) : <p>{fallo?.mensaje || "Cargando…"}</p>}
        </div>
      </main>
    );
  }

  const { taller, orden, cliente, domicilio: dom, siguientes } = datos;
  const telCliente = String(cliente?.telefono || "").replace(/\D/g, "");

  return (
    <main className="dmc-pagina">
      <header className="dmc-cab">
        <span>{taller?.nombre || "Taller"}</span>
        <b>Servicio a domicilio #{orden.folio}</b>
      </header>

      <section className="dmc-tarjeta">
        <small>Servicio</small>
        <h1>{orden.servicio}</h1>
        {orden.diagnostico && <p>{orden.diagnostico}</p>}
        <p className="dmc-meta">{orden.vehiculo}{orden.placas ? ` · ${orden.placas}` : ""}</p>
        <small className="dmc-sub">Estatus del servicio</small>
        <div className={`dmc-estatus et-${datos.etapa?.clave}`} aria-live="polite"><span className="dmc-punto" aria-hidden="true" /><span>{datos.etapa?.nombre || "—"}</span></div>
        {(() => {
          const idx = PASOS.findIndex(([k]) => k === datos.etapa?.clave);
          const permitidas = new Set((datos.etapas_permitidas || []).map((e) => e.clave));
          return (
            <>
              <ol className="dmc-pasos" aria-label="Avance del servicio">
                {PASOS.map(([k, etiqueta], i) => (
                  <li key={k} className={i < idx ? "hecho" : i === idx ? "actual" : ""} aria-current={i === idx ? "step" : undefined}>
                    <button type="button" disabled={!datos.iniciado || !!accion || i === idx || !permitidas.has(k)} onClick={() => marcarEtapa(k)} aria-label={`Marcar como ${etiqueta}`}>
                      <span className="dmc-paso-marca" aria-hidden="true">{i < idx ? "✓" : i + 1}</span>
                      <span className="dmc-paso-nombre">{etiqueta}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="dmc-meta dmc-pasos-ayuda">{datos.iniciado ? "Toca un paso para actualizar el estatus. El taller y el cliente lo ven al momento." : "Podrás actualizar el estatus cuando inicies el servicio con el código del cliente."}</p>
            </>
          );
        })()}
        {aviso?.de === "etapa" && <p className={aviso.tipo === "ok" ? "dmc-ok" : "dmc-error"} role="status">{aviso.texto}</p>}
      </section>

      <section className="dmc-tarjeta dmc-visita">
        <small>Datos de la visita</small>
        <div className="dmc-dato">
          <span className="dmc-dato-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></svg></span>
          <div className="dmc-dato-txt">
            <span className="dmc-dato-et">Dirección</span>
            <b>{dom.direccion || "Ubicación en el mapa"}</b>
            {dom.referencias && <span className="dmc-dato-ref">{dom.referencias}</span>}
          </div>
        </div>
        <div className="dmc-dato">
          <span className="dmc-dato-ico cli"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20.5c.6-4 3.6-6.3 7.5-6.3s6.9 2.3 7.5 6.3" /></svg></span>
          <div className="dmc-dato-txt">
            <span className="dmc-dato-et">Cliente</span>
            <b>{cliente?.nombre || "—"}</b>
            {cliente?.telefono && <span className="dmc-dato-ref">{cliente.telefono}</span>}
          </div>
        </div>
        {(dom.maps_url || telCliente) && (
          <div className={`dmc-visita-acciones${dom.maps_url && telCliente ? " dos" : ""}`}>
            {dom.maps_url && <a className="dmc-btn dmc-mapa" href={dom.maps_url} target="_blank" rel="noopener noreferrer">📍 Cómo llegar</a>}
            {telCliente && <a className="dmc-btn dmc-sec" href={`tel:${telCliente}`}>📞 Llamar</a>}
          </div>
        )}
      </section>

      {datos.iniciado && <RefaccionesUsadas token={token} usadas={datos.refacciones_usadas} onCambio={(r) => setDatos((d) => (d ? { ...d, ...r } : d))} />}

      {datos.iniciado && <Cobro token={token} cobro={datos.cobro} onCambio={(r) => setDatos((d) => (d ? { ...d, ...r } : d))} />}

      {datos.iniciado && <Finalizar token={token} cobro={datos.cobro} tieneConceptos={(datos.refacciones_usadas || []).length > 0} onFinal={setFinal} />}

      <section className="dmc-tarjeta">
        {datos.iniciado ? (
          <p className="dmc-ok">✔ Servicio iniciado. Ya puedes trabajar en la orden.</p>
        ) : datos.bloqueado ? (
          <p className="dmc-error">Código bloqueado por intentos fallidos. Avisa al taller para que genere uno nuevo.</p>
        ) : (
          <form onSubmit={iniciar}>
            <small>Código del cliente</small>
            <p>Pídele al cliente el código de 6 dígitos. Sin él no se puede iniciar el servicio.</p>
            <input className="dmc-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Código de 6 dígitos" />
            {errorCodigo && <p className="dmc-error" role="alert">{errorCodigo}</p>}
            {!errorCodigo && datos.intentos_restantes < 5 && <p className="dmc-meta">Intentos restantes: {datos.intentos_restantes}</p>}
            <button className="dmc-btn" disabled={enviando || codigo.length !== 6}>{enviando ? "Verificando…" : "Iniciar servicio"}</button>
          </form>
        )}
      </section>

      {datos.iniciado && (
        <section className="dmc-tarjeta">
          <small>Notas y fotos del avance</small>
          <form onSubmit={guardarNota} className="dmc-nota">
            <label htmlFor="dmc-nota">Agregar una nota de avance</label>
            <textarea id="dmc-nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={250} rows={3} placeholder="Ej. Cambié balatas delanteras, falta rectificar discos" />
            <button className="dmc-btn dmc-sec" disabled={!!accion || nota.trim().length < 2}>{accion === "nota" ? "Guardando…" : "Guardar nota"}</button>
          </form>

          <label className={`dmc-btn dmc-foto ${accion ? "off" : ""}`}>
            {accion === "foto" ? "Subiendo foto…" : "📷 Tomar o subir foto"}
            <input type="file" accept="image/*" capture="environment" onChange={subirFoto} disabled={!!accion} hidden />
          </label>
          {datos.fotos?.length > 0 && (
            <div className="dmc-fotos">
              {datos.fotos.map((f) => <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"><img src={f.url} alt={f.descripcion || "Foto del servicio"} loading="lazy" /></a>)}
            </div>
          )}
          {aviso && aviso.de !== "etapa" && <p className={aviso.tipo === "ok" ? "dmc-ok" : "dmc-error"} role="status">{aviso.texto}</p>}
        </section>
      )}

      {datos.iniciado && (
        <section className="dmc-tarjeta">
          <small>Inspección del vehículo</small>
          <p>Toca las zonas del auto, marca Bien / Regular / Mal y agrega fotos de lo que encuentres.</p>
          <button type="button" className="dmc-btn" onClick={() => setVerInsp(true)}>🚗 {datos.inspeccion_hecha ? "Ver o editar la inspección" : "Hacer la inspección"}</button>
        </section>
      )}
      {verInsp && (
        <Suspense fallback={null}>
          <InspeccionForm publico={{ token }} idVehiculo={null} idServicio={orden.folio} onGuardado={() => cargar()} onClose={() => { setVerInsp(false); cargar(); }} />
        </Suspense>
      )}

      {siguientes?.length > 0 && (
        <section className="dmc-tarjeta">
          <small>Tus siguientes servicios</small>
          <ul className="dmc-lista">
            {siguientes.map((s) => (
              <li key={s.folio}>
                <div><b>#{s.folio} · {s.servicio}</b><span>{s.cliente || ""}{s.direccion ? ` — ${s.direccion}` : ""}</span></div>
                {s.enlace && <a className="dmc-btn dmc-sec" href={soloRuta(s.enlace)}>Abrir</a>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {datos.bitacora?.length > 0 && (
        <section className="dmc-tarjeta">
          <small>Detalle del estatus</small>
          <ul className="dmc-bitacora">
            {datos.bitacora.map((b, i) => (
              <li key={i}><span>{fechaHora(b.fecha)} · {b.quien}</span><b>{b.etapa}</b>{b.comentario && <em>{b.comentario}</em>}</li>
            ))}
          </ul>
        </section>
      )}
      <footer className="dmc-pie">Actualizado {fechaHora(datos.actualizado)}</footer>
    </main>
  );
}
