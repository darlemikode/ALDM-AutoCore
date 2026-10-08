import { useEffect, useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import IconoModulo from "../components/IconoModulo";
import { IconoAuto } from "../components/Icono";
import PagarSuscripcion from "../components/PagarSuscripcion";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
const fecha = (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "—");

function estadoDe(s) {
  if (s.estado === "suspendida") return { texto: "Suspendida", clase: "rojo" };
  if (s.estado === "cancelada") return { texto: "Cancelada", clase: "rojo" };
  if (s.dias_restantes != null && s.dias_restantes < 0) return { texto: "Vencida", clase: "rojo" };
  if (s.dias_restantes != null && s.dias_restantes <= 7) return { texto: "Por vencer", clase: "ambar" };
  if (s.estado === "prueba") return { texto: "En prueba", clase: "azul" };
  return { texto: "Vigente", clase: "verde" };
}

export default function Suscripcion() {
  const { notify } = useUI();
  const [s, setS] = useState(null);
  const [error, setError] = useState("");
  const [pagando, setPagando] = useState(false);
  const [elegidos, setElegidos] = useState([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get("/pagos-en-linea/mi-suscripcion").then(setS).catch((e) => setError(e.message));
  }, []);

  async function solicitar(cuerpo, mensajeOk) {
    setEnviando(true);
    try {
      await api.post("/pagos-en-linea/solicitar-modulos", cuerpo);
      notify(mensajeOk, "success");
      setElegidos([]);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setEnviando(false);
    }
  }

  const alternar = (clave) => setElegidos((p) => (p.includes(clave) ? p.filter((x) => x !== clave) : [...p, clave]));

  return (
    <>
      <div className="page-header">
        <div className="page-header-titulo">
          <div>
            <h1><IconoModulo ruta="/suscripcion" /> Suscripción</h1>
            <div className="subtitle">Tu paquete, vencimiento, módulos y pagos</div>
          </div>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}
      {!s && !error && <div className="loading-text">Cargando…</div>}
      {s && !s.tiene && <div className="empty-state">Este taller aún no tiene una suscripción registrada.</div>}

      {s?.tiene && (() => {
        const est = estadoDe(s);
        const pct = s.dias_restantes == null ? 0 : Math.max(0, Math.min(100, Math.round((s.dias_restantes / 30) * 100)));
        return (
          <div className="susc-pagina">
            <section className="susc-hero">
              <div className="susc-hero-info">
                <div className="susc-etq">Tu paquete</div>
                <div className="susc-paquete">{s.paquete.nombre}</div>
                {s.paquete.descripcion && <div className="susc-desc">{s.paquete.descripcion}</div>}
                <div className="susc-datos">
                  <div><span>Vence</span><b>{fecha(s.fecha_vencimiento)}</b></div>
                  <div><span>Cobro</span><b>{s.tipo_cobro || "—"} · {fmt(s.monto_periodo)}</b></div>
                  <div><span>Usuarios</span><b>{s.paquete.limite_usuarios ?? "Sin límite"}</b></div>
                  <div><span>Desde</span><b>{fecha(s.fecha_inicio)}</b></div>
                </div>
              </div>
              <div className="susc-hero-estado">
                <span className={`susc-pill ${est.clase}`}>{est.texto}</span>
                <div className="susc-dias">
                  {s.dias_restantes == null ? "—" : s.dias_restantes < 0 ? `${Math.abs(s.dias_restantes)}` : s.dias_restantes}
                  <small>{s.dias_restantes == null ? "" : s.dias_restantes < 0 ? "días vencida" : "días restantes"}</small>
                </div>
                <div className="susc-barra"><div className={`susc-barra-fill ${est.clase}`} style={{ width: `${pct}%` }} /></div>
                <button className="btn btn-primary btn-grande" onClick={() => setPagando(true)}>Pagar / renovar</button>
              </div>
            </section>

            <section className="susc-seccion">
              <h2>Módulos incluidos</h2>
              <div className="susc-modulos">
                {s.modulos_incluidos.map((m) => (
                  <div className="susc-modulo activo" key={m.clave}>
                    <span className="susc-modulo-ico"><IconoAuto valor={m.icono || "✔️"} size={22} /></span>
                    <div><b>{m.nombre}</b>{m.descripcion && <small>{m.descripcion}</small>}</div>
                    <span className="susc-ok">✓</span>
                  </div>
                ))}
              </div>
            </section>

            {s.modulos_disponibles.length > 0 && (
              <section className="susc-seccion">
                <div className="susc-seccion-cab">
                  <h2>Agrega más módulos</h2>
                  <button className="btn btn-primary" disabled={elegidos.length === 0 || enviando}
                    onClick={() => solicitar({ modulos: elegidos.map((c) => s.modulos_disponibles.find((m) => m.clave === c)?.nombre || c) }, "Solicitud enviada. ALDM te contactará para activarlos.")}>
                    {enviando ? "Enviando…" : elegidos.length ? `Solicitar ${elegidos.length} módulo${elegidos.length > 1 ? "s" : ""}` : "Elige módulos"}
                  </button>
                </div>
                <div className="susc-modulos">
                  {s.modulos_disponibles.map((m) => (
                    <button type="button" key={m.clave} className={`susc-modulo opcion ${elegidos.includes(m.clave) ? "elegido" : ""}`} onClick={() => alternar(m.clave)}>
                      <span className="susc-modulo-ico"><IconoAuto valor={m.icono || "➕"} size={22} /></span>
                      <div><b>{m.nombre}</b>{m.descripcion && <small>{m.descripcion}</small>}</div>
                      <span className="susc-ok">{elegidos.includes(m.clave) ? "✓" : "+"}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {s.otros_paquetes.length > 1 && (
              <section className="susc-seccion">
                <h2>Paquetes</h2>
                <div className="susc-paquetes">
                  {s.otros_paquetes.map((p) => (
                    <div key={p.nombre} className={`susc-paq ${p.actual ? "actual" : ""}`}>
                      <div className="susc-paq-nombre">{p.nombre}{p.actual && <span className="susc-pill verde">Tu paquete</span>}</div>
                      <div className="susc-paq-precio">{fmt(p.precio_mensual)}<small> / mes</small></div>
                      {p.descripcion && <div className="susc-desc">{p.descripcion}</div>}
                      <div className="susc-paq-mods">{p.modulos.length} módulos</div>
                      {!p.actual && (
                        <button className="btn btn-secondary" disabled={enviando} onClick={() => solicitar({ paquete: p.nombre }, `Solicitud enviada: cambio a ${p.nombre}.`)}>Quiero este paquete</button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="susc-seccion">
              <h2>Historial de pagos</h2>
              {s.pagos.length === 0 ? <div className="empty-state">Aún no hay pagos registrados.</div> : (
                <div className="susc-pagos">
                  {s.pagos.map((p, i) => (
                    <div className="susc-pago" key={i}>
                      <span>{fecha(p.fecha)}</span>
                      <span className="susc-pago-per">{p.periodo_desde ? `${fecha(p.periodo_desde)} – ${fecha(p.periodo_hasta)}` : "—"}</span>
                      <span className="susc-pago-met">{p.metodo || "—"}</span>
                      <b>{fmt(p.monto)}</b>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        );
      })()}

      {pagando && <PagarSuscripcion onClose={() => setPagando(false)} />}
    </>
  );
}
