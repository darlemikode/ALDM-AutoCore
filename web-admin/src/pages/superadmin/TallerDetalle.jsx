import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import FormModal from "../../components/FormModal";
import QrTaller from "../../components/QrTaller";
import { useUI } from "../../context/UIContext";
import { CAMPOS_TALLER, GRUPOS_TALLER } from "./Talleres";
import { Cargando, Dato, ESTADOS_MANUALES, EstadoBadge, METODOS_PAGO, fmt, fmtFecha, useCargar } from "./comun";
import { Icono } from "../../components/Icono";
import { IconoModuloSistema } from "../../components/IconoModulo";
import "./tallerDetalle.css";
import "./paqueteModal.css";

const iniciales = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

export default function TallerDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { confirmDialog, notify } = useUI();
  const [modal, setModal] = useState(null); // { tipo: "pago"|"suscripcion"|"datos", iniciales }
  const [verQr, setVerQr] = useState(false);
  const [enviandoInvitacion, setEnviandoInvitacion] = useState(false);
  const [cooldownInvitacion, setCooldownInvitacion] = useState(0);

  useEffect(() => {
    if (cooldownInvitacion <= 0) return;
    const t = setInterval(() => setCooldownInvitacion((s) => (s > 1 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldownInvitacion]);
  const { datos, error, recargar } = useCargar(async () => {
    const [taller, pagos, usuarios, paquetes, tipos] = await Promise.all([
      api.get(`/superadmin/talleres/${id}`),
      api.get(`/superadmin/pagos?id_taller=${id}`),
      api.get(`/superadmin/talleres/${id}/usuarios`),
      api.get("/superadmin/paquetes"),
      api.get("/superadmin/tipos-cobro"),
    ]);
    return { taller, pagos, usuarios, paquetes, tipos };
  }, [id]);

  if (!datos) return <Cargando error={error} />;
  const { taller: t, pagos, usuarios, paquetes, tipos } = datos;
  const s = t.suscripcion;
  const e = t.estado || {};

  const opcionesTipos = tipos.filter((x) => x.activo || x.id_tipo_cobro === s?.id_tipo_cobro)
    .map((x) => ({ value: x.id_tipo_cobro, label: `${x.nombre} (${x.meses} mes${x.meses > 1 ? "es" : ""}${x.descuento_porcentaje ? `, -${x.descuento_porcentaje}%` : ""})` }));
  const opcionesPaquetes = paquetes.filter((p) => p.activo || p.id_paquete === s?.id_paquete)
    .map((p) => ({ value: p.id_paquete, label: `${p.nombre} · ${fmt(p.precio_mensual)}/mes` }));

  function precioCalculado(idTipo) {
    if (s?.precio_pactado != null) return s.precio_pactado;
    const tipo = tipos.find((x) => x.id_tipo_cobro === Number(idTipo));
    const meses = tipo?.meses || 1;
    return (s?.paquete?.precio_mensual || 0) * meses * (1 - (tipo?.descuento_porcentaje || 0) / 100);
  }

  async function registrarPago(v) {
    const pago = await api.post(`/superadmin/talleres/${id}/renovar`, {
      id_tipo_cobro: v.id_tipo_cobro ? Number(v.id_tipo_cobro) : null,
      monto: v.monto === null || v.monto === undefined || v.monto === "" ? null : Number(v.monto),
      metodo_pago: v.metodo_pago || "transferencia", referencia: v.referencia || null, notas: v.notas || null,
    });
    setModal(null);
    await recargar();
    notify(`Pago de ${fmt(pago.monto)} registrado: cubre del ${fmtFecha(pago.periodo_desde)} al ${fmtFecha(pago.periodo_hasta)}.`, "success");
  }

  async function guardarSuscripcion(v) {
    const cuerpo = {
      id_paquete: v.id_paquete ? Number(v.id_paquete) : undefined,
      id_tipo_cobro: v.id_tipo_cobro ? Number(v.id_tipo_cobro) : undefined,
      estado: v.estado || undefined,
      fecha_vencimiento: v.fecha_vencimiento || null,
      notas: v.notas || null,
    };
    if (v.precio_pactado === null || v.precio_pactado === undefined || v.precio_pactado === "") cuerpo.quitar_precio_pactado = true;
    else cuerpo.precio_pactado = Number(v.precio_pactado);
    await api.put(`/superadmin/talleres/${id}/suscripcion`, cuerpo);
    setModal(null);
    recargar();
    notify("Suscripción actualizada.", "success");
  }

  async function guardarDatos(v) {
    const cuerpo = { ...v };
    if (!cuerpo.codigo) delete cuerpo.codigo;
    await api.put(`/superadmin/talleres/${id}`, cuerpo);
    setModal(null);
    recargar();
    notify("Datos del taller guardados.", "success");
  }

  async function suspender() {
    const ok = await confirmDialog(`${t.nombre_comercial} dejará de poder entrar al sistema. Sus datos se conservan.`, { title: "Suspender taller", danger: true, confirmar: "Sí, suspender" });
    if (!ok) return;
    try { await api.post(`/superadmin/talleres/${id}/suspender`, { motivo: null }); recargar(); } catch (err) { notify(err.message, "error"); }
  }
  async function reactivar() {
    try { await api.post(`/superadmin/talleres/${id}/reactivar`); recargar(); notify("Taller reactivado.", "success"); } catch (err) { notify(err.message, "error"); }
  }
  async function eliminarPago(p) {
    const ok = await confirmDialog(`¿Eliminar el pago de ${fmt(p.monto)} del ${fmtFecha(p.fecha_pago)}? La fecha de vencimiento NO se regresa sola; ajústala en la suscripción si hace falta.`, { title: "Eliminar pago", danger: true, confirmar: "Sí, eliminar" });
    if (!ok) return;
    try { await api.del(`/superadmin/pagos/${p.id_pago}`); recargar(); } catch (err) { notify(err.message, "error"); }
  }
  async function reenviarInvitacion() {
    if (cooldownInvitacion > 0) return;
    setEnviandoInvitacion(true);
    try {
      await api.post(`/superadmin/talleres/${id}/reenviar-invitacion`);
      recargar();
      notify(`Se mandó el enlace a ${t.correo}.`, "success");
      setCooldownInvitacion(60);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setEnviandoInvitacion(false);
    }
  }

  return (
    <>
      <div className="sa-titulo-fila" style={{ marginBottom: 12 }}>
        <Link to="/superadmin/talleres">← Talleres</Link>
      </div>

      <section className="td-hero">
        <div className="td-avatar" aria-hidden="true">{iniciales(t.nombre_comercial)}</div>
        <div className="td-hero-info">
          <div className="td-hero-fila">
            <h2>{t.nombre_comercial}</h2>
            <EstadoBadge estado={e.estado} />
          </div>
          <div className="td-hero-meta">
            {[t.razon_social, t.tipo_negocio, [t.ciudad, t.estado_mx].filter(Boolean).join(", ")].filter(Boolean).map((x, i) => <span key={i}>{x}</span>)}
            <span>Alta {fmtFecha(t.fecha_alta)}</span>
          </div>
          {e.mensaje && <div className="td-aviso" style={{ color: e.bloqueado ? "var(--red-600)" : "var(--warn-600)" }}>{e.mensaje}</div>}
          <div className="td-codigo">
            {t.codigo ? <><span className="sa-codigo mono">{t.codigo}</span><button className="btn btn-secondary btn-sm" onClick={() => setVerQr((x) => !x)}>{verQr ? "Ocultar QR" : "Ver QR"}</button></> : <span className="sa-sub">Sin código aún: lo captura el dueño</span>}
          </div>
        </div>
        <div className="td-hero-acciones">
          <button className="btn btn-primary td-btn" onClick={() => setModal({ tipo: "pago", iniciales: { id_tipo_cobro: s?.id_tipo_cobro || opcionesTipos[0]?.value, metodo_pago: "transferencia" } })}><span className="td-btn-ico"><Icono nombre="cash" size={20} /></span>Registrar pago</button>
          <button className="btn btn-secondary td-btn" onClick={() => setModal({ tipo: "suscripcion", iniciales: {
            id_paquete: s?.id_paquete, id_tipo_cobro: s?.id_tipo_cobro, estado: s?.estado,
            precio_pactado: s?.precio_pactado ?? "", fecha_vencimiento: s?.fecha_vencimiento?.slice(0, 10) || "", notas: s?.notas || "",
          } })}><span className="td-btn-ico"><Icono nombre="card" size={20} /></span>Suscripción</button>
        </div>
        {verQr && t.qr && (
          <div className="td-qr">
            <QrTaller contenido={t.qr} tamano={200} />
            <div className="sa-sub">Los clientes del taller lo escanean para entrar a la app "Mi Taller".</div>
          </div>
        )}
      </section>

      <div className="td-kpis">
        {[["Usuarios", t.uso?.usuarios_activos, "people"], ["Clientes", t.uso?.clientes, "user"], ["Vehículos", t.uso?.vehiculos, "car"], ["Órdenes este mes", t.uso?.ordenes_mes, "calendar"], ["Órdenes en total", t.uso?.ordenes_total, "document"]].map(([k, v, ico]) => (
          <div className="td-kpi" key={k}><span className="td-kpi-ico"><Icono nombre={ico} size={18} /></span><div><b>{(v || 0).toLocaleString("es-MX")}</b><small>{k}</small></div></div>
        ))}
        <div className="td-kpi td-kpi-texto"><span className="td-kpi-ico"><Icono nombre="clock" size={18} /></span><div><b>{t.uso?.ultima_actividad ? fmtFecha(t.uso.ultima_actividad) : "Sin actividad"}</b><small>Última orden</small></div></div>
      </div>

      {t.pendiente_activacion && (
        <div className="panel sa-activacion">
          <h2 className="sa-titulo">Pendiente de activar</h2>
          <div className="subtitle">Todavía nadie registró el administrador. Se mandó un enlace a <b>{t.correo || "su correo"}</b> para que cree su usuario y contraseña.</div>
          <div className="sa-acciones">
            <button className="btn btn-danger" onClick={reenviarInvitacion} disabled={enviandoInvitacion || cooldownInvitacion > 0}>
              {enviandoInvitacion ? "Enviando…" : cooldownInvitacion > 0 ? `Reenviado ✓ · de nuevo en ${cooldownInvitacion}s` : "Reenviar enlace"}
            </button>
          </div>
        </div>
      )}

      <div className="td-dos">
        <section className="td-tarjeta">
          <header className="td-tarjeta-cab">
            <h3>Suscripción</h3>
            <span className="td-plan"><b>{s?.paquete?.nombre || "Sin paquete"}</b>{t.precio_periodo != null && <small>{fmt(t.precio_periodo)} por periodo</small>}</span>
          </header>
          {s?.fecha_vencimiento && (() => {
            const ini = s.fecha_inicio ? new Date(s.fecha_inicio).getTime() : null;
            const fin = new Date(s.fecha_vencimiento).getTime();
            const pct = ini && fin > ini ? Math.min(100, Math.max(0, ((Date.now() - ini) / (fin - ini)) * 100)) : null;
            const dias = e.dias_restantes;
            const tono = dias != null && dias < 0 ? "rojo" : dias != null && dias <= 7 ? "ambar" : "verde";
            return (
              <div className="td-vence">
                <div className="td-vence-txt"><span>Vence el <b>{fmtFecha(s.fecha_vencimiento)}</b></span>{dias != null && <em className={`td-dias td-${tono}`}>{dias < 0 ? `vencida hace ${-dias} d` : dias === 0 ? "vence hoy" : `${dias} días`}</em>}</div>
                {pct != null && <div className="td-barra"><i className={`td-${tono}`} style={{ width: `${pct}%` }} /></div>}
              </div>
            );
          })()}
          <Dato etiqueta="Tipo de cobro">{s?.tipo_cobro?.nombre || "Sin definir"}</Dato>
          {s?.precio_pactado != null && <Dato etiqueta="Precio pactado" tono="blue">Sí (precio especial)</Dato>}
          <Dato etiqueta="Inicio">{fmtFecha(s?.fecha_inicio)}</Dato>
          {!s?.fecha_vencimiento && <Dato etiqueta="Vence">Sin vencimiento</Dato>}
          {e.fin_gracia && <Dato etiqueta="Fin de gracia (solo consulta)">{fmtFecha(e.fin_gracia)}</Dato>}
          {e.fecha_depuracion && <Dato etiqueta="Conservar datos hasta" tono={e.para_depurar ? "red" : null}>{fmtFecha(e.fecha_depuracion)}</Dato>}
          {s?.notas && <div className="sa-notas">{s.notas}</div>}
        </section>

        <section className="td-tarjeta">
          <header className="td-tarjeta-cab"><h3>Módulos incluidos</h3><span className="sa-sub">{(s?.paquete?.modulos || []).length} en {s?.paquete?.nombre || "—"}</span></header>
          <div className="td-modulos">
            {(s?.paquete?.modulos || []).map((m) => <span key={m.clave} className="pk-mod"><IconoModuloSistema clave={m.clave} size={13} />{m.nombre}</span>)}
            {!(s?.paquete?.modulos || []).length && <span className="sa-sub">—</span>}
          </div>
        </section>
      </div>

      <div className="panel">
        <div className="sa-titulo-fila"><h2 className="sa-titulo">Pagos ({pagos.length})</h2>{pagos.length > 0 && <span className="sa-sub">Total cobrado: <b>{fmt(pagos.reduce((a, p) => a + (Number(p.monto) || 0), 0))}</b></span>}</div>
        {pagos.length === 0 ? <div className="empty-state">Todavía no hay pagos registrados.</div> : (
          <div className="sa-tabla">
            <table>
              <thead><tr><th>Fecha</th><th className="num">Monto</th><th>Forma de pago</th><th>Tipo</th><th>Cubre</th><th></th></tr></thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id_pago}>
                    <td>{fmtFecha(p.fecha_pago)}</td>
                    <td className="num"><strong>{fmt(p.monto)}</strong></td>
                    <td>{p.metodo_pago || "—"}{p.referencia ? <div className="sa-sub">{p.referencia}</div> : null}</td>
                    <td>{p.tipo_cobro ? <span className="badge badge-petrol">{p.tipo_cobro.nombre}</span> : "—"}</td>
                    <td>{p.periodo_desde ? `${fmtFecha(p.periodo_desde)} – ${fmtFecha(p.periodo_hasta)}` : "—"}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => eliminarPago(p)}>Eliminar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="sa-columnas">
        <div className="panel">
          <h2 className="sa-titulo">Usuarios ({usuarios.length})</h2>
          {usuarios.length === 0 ? <div className="subtitle">Nadie tiene acceso todavía.</div> : usuarios.map((u) => {
            const m = u.membresias.find((x) => x.id_taller === t.id_taller);
            return (
              <button key={u.id_usuario} type="button" className="sa-item" onClick={() => navigate(`/superadmin/usuarios/${u.id_usuario}`)}>
                <span className="td-usuario">
                  <span className="td-mini-avatar" aria-hidden="true">{iniciales(u.nombre_completo)}</span>
                  <span><strong>{u.nombre_completo}</strong>
                  <div className="sa-sub">@{u.username} · {m?.rol?.nombre}{u.membresias.length > 1 ? ` · ${u.membresias.length} talleres` : ""}</div></span>
                </span>
                {m && !m.activo ? <span className="badge badge-grey">sin acceso</span> : <span className="sa-sub">›</span>}
              </button>
            );
          })}
        </div>

        <div className="panel">
          <div className="sa-titulo-fila">
            <h2 className="sa-titulo">Datos de contacto</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setModal({ tipo: "datos", iniciales: { ...t } })}>Editar</button>
          </div>
          <Dato etiqueta="Contacto">{t.contacto_nombre}</Dato>
          <Dato etiqueta="Teléfono">{t.telefono}</Dato>
          <Dato etiqueta="Correo">{t.correo}</Dato>
          <Dato etiqueta="Ciudad">{[t.ciudad, t.estado_mx].filter(Boolean).join(", ") || null}</Dato>
          <Dato etiqueta="Alta">{fmtFecha(t.fecha_alta)}</Dato>
          {t.notas && <div className="sa-notas">{t.notas}</div>}
        </div>
      </div>

      <section className="td-riesgo">
        <div><b>{e.bloqueado && (e.estado === "suspendida" || e.estado === "cancelada") ? "Taller suspendido" : "Zona de riesgo"}</b><div className="sa-sub">{e.bloqueado && (e.estado === "suspendida" || e.estado === "cancelada") ? "No puede entrar al sistema. Sus datos se conservan." : "Suspender impide el acceso al sistema; los datos se conservan."}</div></div>
        {e.bloqueado && (e.estado === "suspendida" || e.estado === "cancelada")
          ? <button className="btn btn-primary" onClick={reactivar}>Reactivar taller</button>
          : <button className="btn btn-danger" onClick={suspender}>Suspender taller</button>}
      </section>

      {modal?.tipo === "pago" && (
        <FormModal tema="sa"
          title="Registrar pago"
          subtitulo="Renueva la suscripción: el nuevo periodo empieza al terminar el actual (o hoy, si ya venció)."
          icono="💵"
          initialValues={modal.iniciales}
          fields={(v) => [
            { name: "id_tipo_cobro", label: "Tipo de cobro", type: "select", required: true, options: opcionesTipos, noOrdenar: true },
            { name: "monto", label: "Monto cobrado", type: "number", hint: `Vacío = ${fmt(precioCalculado(v.id_tipo_cobro))} (precio calculado)` },
            { name: "metodo_pago", label: "Forma de pago", type: "select", options: METODOS_PAGO, noOrdenar: true },
            { name: "referencia", label: "Referencia (folio, núm. de operación…)" },
            { name: "notas", label: "Notas", type: "textarea", full: true },
          ]}
          onSubmit={registrarPago}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === "suscripcion" && (
        <FormModal tema="sa"
          title="Suscripción"
          subtitulo="Paquete, forma de cobro, precio especial y fechas."
          icono="⚙️"
          initialValues={modal.iniciales}
          fields={[
            { name: "id_paquete", label: "Paquete", type: "select", required: true, options: opcionesPaquetes },
            { name: "id_tipo_cobro", label: "Tipo de cobro", type: "select", options: opcionesTipos, noOrdenar: true },
            { name: "precio_pactado", label: "Precio especial por periodo", type: "number", hint: "Vacío = precio de lista del paquete" },
            { name: "fecha_vencimiento", label: "Vence el", type: "date", hint: "Para dar días extra de prueba o corregir fechas" },
            { name: "estado", label: "Estado", type: "select", options: ESTADOS_MANUALES, noOrdenar: true },
            { name: "notas", label: "Notas", type: "textarea", full: true },
          ]}
          onSubmit={guardarSuscripcion}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === "datos" && (
        <FormModal tema="sa"
          title="Datos del taller"
          subtitulo={t.nombre_comercial}
          icono="🏢"
          grupos={GRUPOS_TALLER}
          initialValues={modal.iniciales}
          fields={CAMPOS_TALLER}
          onSubmit={guardarDatos}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
