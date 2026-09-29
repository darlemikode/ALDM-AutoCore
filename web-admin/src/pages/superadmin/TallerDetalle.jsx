import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import FormModal from "../../components/FormModal";
import QrTaller from "../../components/QrTaller";
import { useUI } from "../../context/UIContext";
import { CAMPOS_TALLER, GRUPOS_TALLER } from "./Talleres";
import { Cargando, Dato, ESTADOS_MANUALES, EstadoBadge, METODOS_PAGO, copiar, fmt, fmtFecha, useCargar } from "./comun";

export default function TallerDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { confirmDialog, notify } = useUI();
  const [modal, setModal] = useState(null); // { tipo: "pago"|"suscripcion"|"datos", iniciales }
  const [verQr, setVerQr] = useState(false);
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
    const ok = await confirmDialog(`${t.nombre_comercial} dejará de poder entrar al sistema. Sus datos se conservan.`, { title: "Suspender taller", danger: true });
    if (!ok) return;
    try { await api.post(`/superadmin/talleres/${id}/suspender`, { motivo: null }); recargar(); } catch (err) { notify(err.message, "error"); }
  }
  async function reactivar() {
    try { await api.post(`/superadmin/talleres/${id}/reactivar`); recargar(); notify("Taller reactivado.", "success"); } catch (err) { notify(err.message, "error"); }
  }
  async function eliminarPago(p) {
    const ok = await confirmDialog(`¿Eliminar el pago de ${fmt(p.monto)} del ${fmtFecha(p.fecha_pago)}? La fecha de vencimiento NO se regresa sola; ajústala en la suscripción si hace falta.`, { title: "Eliminar pago", danger: true });
    if (!ok) return;
    try { await api.del(`/superadmin/pagos/${p.id_pago}`); recargar(); } catch (err) { notify(err.message, "error"); }
  }
  async function nuevoCodigo() {
    const ok = await confirmDialog("El código de activación anterior dejará de servir.", { title: "Nuevo código de activación" });
    if (!ok) return;
    try { await api.post(`/superadmin/talleres/${id}/codigo-activacion`); recargar(); } catch (err) { notify(err.message, "error"); }
  }
  const mensajeActivacion = `Bienvenido a ALDM AutoCore\n\nPara entrar por primera vez a tu sistema abre la página o la app del taller, toca "¿Primera vez? Activa tu taller" y escribe:\n\nCódigo del taller: ${t.codigo}\nCódigo de activación: ${t.codigo_activacion}\n\nAhí creas tu usuario y contraseña de administrador.`;

  return (
    <>
      <div className="sa-titulo-fila" style={{ marginBottom: 12 }}>
        <Link to="/superadmin/talleres">← Talleres</Link>
      </div>

      <div className="panel">
        <div className="sa-titulo-fila">
          <div>
            <h2 style={{ fontSize: 24 }}>{t.nombre_comercial}</h2>
            <div className="subtitle">{[t.razon_social, t.tipo_negocio].filter(Boolean).join(" · ")}</div>
          </div>
          <EstadoBadge estado={e.estado} />
        </div>
        {e.mensaje && <div className="sa-mensaje" style={{ color: e.bloqueado ? "var(--red-600)" : "var(--warn-600)" }}>{e.mensaje}</div>}
        <div className="sa-acciones">
          <span className="sa-codigo mono">{t.codigo}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setVerQr((x) => !x)}>{verQr ? "Ocultar QR" : "Ver QR"}</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={() => setModal({ tipo: "pago", iniciales: { id_tipo_cobro: s?.id_tipo_cobro || opcionesTipos[0]?.value, metodo_pago: "transferencia" } })}>Registrar pago</button>
          <button className="btn btn-secondary" onClick={() => setModal({ tipo: "suscripcion", iniciales: {
            id_paquete: s?.id_paquete, id_tipo_cobro: s?.id_tipo_cobro, estado: s?.estado,
            precio_pactado: s?.precio_pactado ?? "", fecha_vencimiento: s?.fecha_vencimiento?.slice(0, 10) || "", notas: s?.notas || "",
          } })}>Suscripción</button>
        </div>
        {verQr && t.qr && (
          <div style={{ marginTop: 14 }}>
            <QrTaller contenido={t.qr} tamano={220} />
            <div className="sa-sub" style={{ marginTop: 6 }}>Los clientes del taller lo escanean para entrar a la app "Mi Taller".</div>
          </div>
        )}
      </div>

      {t.pendiente_activacion && (
        <div className="panel sa-activacion">
          <h2 className="sa-titulo">Pendiente de activar</h2>
          <div className="subtitle">Todavía nadie registró el administrador. El dueño lo crea la primera vez que entra, con el código del taller y este código de activación:</div>
          {t.codigo_activacion ? <div className="sa-activacion-codigo mono">{t.codigo_activacion}</div> : <div className="subtitle">Sin código vigente: genera uno.</div>}
          <div className="sa-acciones">
            {t.codigo_activacion && <button className="btn btn-primary" onClick={() => copiar(mensajeActivacion, notify)}>Copiar mensaje para el dueño</button>}
            <button className="btn btn-secondary" onClick={nuevoCodigo}>Nuevo código</button>
          </div>
        </div>
      )}

      <div className="sa-columnas">
        <div className="panel">
          <h2 className="sa-titulo">Suscripción</h2>
          <Dato etiqueta="Paquete">{s?.paquete?.nombre}</Dato>
          <Dato etiqueta="Tipo de cobro">{s?.tipo_cobro?.nombre || "Sin definir"}</Dato>
          <Dato etiqueta="Precio por periodo">{t.precio_periodo != null ? fmt(t.precio_periodo) : "—"}</Dato>
          {s?.precio_pactado != null && <Dato etiqueta="Precio pactado" tono="blue">Sí (precio especial)</Dato>}
          <Dato etiqueta="Inicio">{fmtFecha(s?.fecha_inicio)}</Dato>
          <Dato etiqueta="Vence" tono={e.dias_restantes != null && e.dias_restantes < 0 ? "red" : null}>{s?.fecha_vencimiento ? fmtFecha(s.fecha_vencimiento) : "Sin vencimiento"}</Dato>
          {e.fin_gracia && <Dato etiqueta="Fin de gracia (solo consulta)">{fmtFecha(e.fin_gracia)}</Dato>}
          {e.fecha_depuracion && <Dato etiqueta="Conservar datos hasta" tono={e.para_depurar ? "red" : null}>{fmtFecha(e.fecha_depuracion)}</Dato>}
          <div className="sa-sub" style={{ marginTop: 8 }}>Módulos: {(s?.paquete?.modulos || []).map((m) => m.nombre).join(", ") || "—"}</div>
          {s?.notas && <div className="sa-notas">{s.notas}</div>}
        </div>

        <div className="panel">
          <h2 className="sa-titulo">Uso</h2>
          <div className="sa-uso">
            {[["Usuarios", t.uso?.usuarios_activos], ["Clientes", t.uso?.clientes], ["Vehículos", t.uso?.vehiculos], ["Órdenes mes", t.uso?.ordenes_mes], ["Órdenes total", t.uso?.ordenes_total]].map(([k, v]) => (
              <div key={k}><div className="sa-uso-valor">{v || 0}</div><div className="sa-sub">{k}</div></div>
            ))}
          </div>
          <div className="sa-sub" style={{ marginTop: 10 }}>Última orden: {t.uso?.ultima_actividad ? fmtFecha(t.uso.ultima_actividad) : "sin actividad"}</div>
        </div>
      </div>

      <div className="panel">
        <h2 className="sa-titulo">Pagos ({pagos.length})</h2>
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
                <span>
                  <strong>{u.nombre_completo}</strong>
                  <div className="sa-sub">@{u.username} · {m?.rol?.nombre}{u.membresias.length > 1 ? ` · ${u.membresias.length} talleres` : ""}</div>
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

      <div style={{ marginBottom: 30 }}>
        {e.bloqueado && (e.estado === "suspendida" || e.estado === "cancelada")
          ? <button className="btn btn-primary" onClick={reactivar}>Reactivar taller</button>
          : <button className="btn btn-danger" onClick={suspender}>Suspender taller</button>}
      </div>

      {modal?.tipo === "pago" && (
        <FormModal
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
        <FormModal
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
        <FormModal
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
