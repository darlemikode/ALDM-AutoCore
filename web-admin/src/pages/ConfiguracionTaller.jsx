import { IconoAuto } from "../components/Icono";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import QrTaller from "../components/QrTaller";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

/**
 * Los datos que aparecen en el encabezado del recibo y la nota de
 * remisión que se le entregan al cliente, más los datos fiscales que se
 * usan para timbrar (razón social, RFC y régimen del emisor).
 */
const OPCIONES_HORA = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2), m = i % 2 ? "30" : "00";
  return { v: `${String(h).padStart(2, "0")}:${m}`, t: `${String(h % 12 || 12)}:${m} ${h < 12 ? "a. m." : "p. m."}` };
});

const SECCIONES = [
  { id: "identidad", icono: "🏢", titulo: "Identidad del taller", desc: "Nombre, logo y contacto — así aparece en tus documentos" },
  { id: "ubicacion", icono: "📍", titulo: "Ubicación", desc: "Dónde está tu taller — así sale en notas y cotizaciones" },
  { id: "fiscal", icono: "🧾", titulo: "Datos fiscales de la empresa", desc: "Se usan al timbrar tus facturas (CFDI)" },
  { id: "seguridad", icono: "🔒", titulo: "Seguridad", desc: "" },
];

export default function ConfiguracionTaller() {
  const { notify } = useUI();
  const { user, hasPermission, refrescarPerfil } = useAuth();
  const puedeFiscal = hasPermission("facturacion.configurar");
  const [data, setData] = useState(null);
  const [estados, setEstados] = useState([]);
  const [ciudades, setCiudades] = useState([]);
    const [buscandoCp, setBuscandoCp] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [verificacion2Pasos, setVerificacion2Pasos] = useState(() => localStorage.getItem("sm_verificacion_2_pasos") === "true");
  const inputRef = useRef(null);

  // Datos fiscales — vienen de configuración fiscal (facturación electrónica)
  const [fiscal, setFiscal] = useState(null);
  const [regimenes, setRegimenes] = useState([]);
  const [sinAccesoFiscal, setSinAccesoFiscal] = useState(false);

  useEffect(() => {
    api.get("/configuracion-taller/").then(setData);
    api.get("/estados/").then(setEstados).catch(() => setEstados([]));
    api.get("/facturacion/configuracion").then(setFiscal).catch(() => setSinAccesoFiscal(true));
    api.get("/facturacion/catalogos").then((c) => setRegimenes(c.regimenes_fiscales || [])).catch(() => setRegimenes([]));
  }, []);

  useEffect(() => {
    if (!data?.id_estado) { setCiudades([]); return; }
    api.get(`/ciudades/?id_estado=${data.id_estado}`).then(setCiudades).catch(() => setCiudades([]));
  }, [data?.id_estado]);

  // Guardado automático: se guarda solo, un momento después de dejar de escribir.
  const [estadoGuardado, setEstadoGuardado] = useState("");
  const ultimoTaller = useRef(null);
  const ultimoFiscal = useRef(null);
  const ultimoError = useRef("");

  function cuerpoTaller(d) {
    return {
      nombre_taller: d.nombre_taller, direccion: d.direccion,
      telefono: d.telefono, telefono2: d.telefono2, telefono3: d.telefono3,
      correo: d.correo, correo2: d.correo2, rfc: d.rfc, cp: d.cp, calle: d.calle,
      numero_taller: d.numero_taller, id_estado: d.id_estado || null, id_ciudad: d.id_ciudad || null,
      codigo_taller: d.codigo_taller || null,
      hora_apertura: d.hora_apertura || null, hora_cierre: d.hora_cierre || null, dias_atencion: d.dias_atencion || null,
    };
  }

  useEffect(() => {
    if (!data) return;
    const cuerpo = JSON.stringify(cuerpoTaller(data));
    if (ultimoTaller.current === null) { ultimoTaller.current = cuerpo; return; }
    if (cuerpo === ultimoTaller.current) return;
    const t = setTimeout(async () => {
      setEstadoGuardado("Guardando…");
      try {
        const actualizado = await api.put("/configuracion-taller/", JSON.parse(cuerpo));
        ultimoTaller.current = cuerpo;
        ultimoError.current = "";
        setEstadoGuardado("Guardado ✓");
        if (actualizado.codigo_taller && !user?.codigo_taller) refrescarPerfil();
      } catch (err) {
        setEstadoGuardado("");
        if (ultimoError.current !== err.message) { ultimoError.current = err.message; notify(err.message, "error"); }
      }
    }, 900);
    return () => clearTimeout(t);
  }, [data]);

  useEffect(() => {
    if (!fiscal || !puedeFiscal) return;
    const cuerpo = JSON.stringify({ ...fiscal, rfc_emisor: (fiscal.rfc_emisor || "").toUpperCase() });
    if (ultimoFiscal.current === null) { ultimoFiscal.current = cuerpo; return; }
    if (cuerpo === ultimoFiscal.current) return;
    const t = setTimeout(async () => {
      setEstadoGuardado("Guardando…");
      try {
        await api.put("/facturacion/configuracion", JSON.parse(cuerpo));
        ultimoFiscal.current = cuerpo;
        ultimoError.current = "";
        setEstadoGuardado("Guardado ✓");
      } catch (err) {
        setEstadoGuardado("");
        if (ultimoError.current !== err.message) { ultimoError.current = err.message; notify(err.message, "error"); }
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [fiscal]);

  // Igual que en Clientes: al escribir un CP conocido, se autocompletan
  // Estado y Municipio — así no hay que buscarlos a mano si ya se sabe el CP.
  async function alCambiarCp(valor) {
    setData((d) => ({ ...d, cp: valor }));
    if (valor.length !== 5) return;
    setBuscandoCp(true);
    try {
      const info = await api.get(`/codigos-postales/${valor}`);
      const estadoEncontrado = estados.find((e) => e.nombre_estado === info.estado);
      if (estadoEncontrado) {
        const ciudadesDelEstado = await api.get(`/ciudades/?id_estado=${estadoEncontrado.id_estado}`);
        setCiudades(ciudadesDelEstado);
        const ciudadEncontrada = ciudadesDelEstado.find((c) => c.nombre_ciudad === info.ciudad);
        setData((d) => ({
          ...d,
          id_estado: estadoEncontrado.id_estado,
          id_ciudad: ciudadEncontrada?.id_ciudad || d.id_ciudad,
        }));
      }
    } catch {
      // CP no encontrado en el catálogo cargado — no truena nada, se sigue llenando a mano.
    } finally {
      setBuscandoCp(false);
    }
  }

  async function subirLogo(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    const formData = new FormData();
    formData.append("archivo", archivo);
    setSubiendoLogo(true);
    try {
      const actualizado = await api.postForm("/configuracion-taller/logo", formData);
      setData(actualizado);
      notify("Logo actualizado.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setSubiendoLogo(false);
    }
  }

  if (!data) return <div className="loading-text">Cargando…</div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-titulo">
          <div>
            <h1><IconoModulo ruta="/configuracion-taller" /> Datos del taller</h1>
            <div className="subtitle">Esto aparece en el encabezado del recibo, la nota de remisión y tus facturas · Los cambios se guardan solos {estadoGuardado && <b className="cfg-guardado">{estadoGuardado}</b>}</div>
          </div>
        </div>
      </div>

      <div className="cfg-layout">
        <section className="cfg-card">
          <div className="cfg-card-header">
            <span className="cfg-card-icono"><IconoAuto valor={SECCIONES[0].icono} size={18} /></span>
            <div>
              <h2>{SECCIONES[0].titulo}</h2>
              <div className="cfg-card-desc">{SECCIONES[0].desc}</div>
            </div>
          </div>

          <div className="cfg-logo-row">
            {data.ruta_logo ? (
              <img src={`/uploads/${data.ruta_logo}`} alt="Logo" className="cfg-logo" />
            ) : (
              <div className="cfg-logo cfg-logo-vacio"><IconoAuto valor="🏢" size={34} /></div>
            )}
            <div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={subiendoLogo}>
                {subiendoLogo ? "Subiendo…" : "Cambiar logo"}
              </button>
              <div className="field-hint" style={{ marginTop: 6 }}>PNG o JPG, fondo transparente de preferencia</div>
              <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={subirLogo} />
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Nombre del taller</label>
              <input value={data.nombre_taller || ""} onChange={(e) => setData({ ...data, nombre_taller: e.target.value })} />
            </div>
            <div className="field">
              <label>Código del taller (para su QR)</label>
              {data.codigo_taller ? (
                <input value={data.codigo_taller} disabled title="Ya quedó fijo; no se puede cambiar." />
              ) : (
                <input value={data.codigo_taller || ""} onChange={(e) => setData({ ...data, codigo_taller: e.target.value.toUpperCase() })} placeholder="Ej. MITALLER" />
              )}
              <div className="field-hint">{data.codigo_taller ? "Ya quedó fijo: no se puede cambiar." : "Elígelo con cuidado: una vez guardado, ya no se puede cambiar."}</div>
            </div>
            <div className="field">
              <label>Teléfono 1</label>
              <input value={data.telefono || ""} onChange={(e) => setData({ ...data, telefono: e.target.value })} />
            </div>
            <div className="field">
              <label>Teléfono 2 (opcional)</label>
              <input value={data.telefono2 || ""} onChange={(e) => setData({ ...data, telefono2: e.target.value })} />
            </div>
            <div className="field">
              <label>Teléfono 3 (opcional)</label>
              <input value={data.telefono3 || ""} onChange={(e) => setData({ ...data, telefono3: e.target.value })} />
            </div>
            <div className="field">
              <label>Correo 1</label>
              <input value={data.correo || ""} onChange={(e) => setData({ ...data, correo: e.target.value })} />
            </div>
            <div className="field full">
              <label>Correo 2 (opcional)</label>
              <input value={data.correo2 || ""} onChange={(e) => setData({ ...data, correo2: e.target.value })} />
            </div>
          </div>
        </section>

        <section className="cfg-card">
          <div className="cfg-card-header">
            <span className="cfg-card-icono"><IconoAuto valor={SECCIONES[1].icono} size={18} /></span>
            <div>
              <h2>{SECCIONES[1].titulo}</h2>
              <div className="cfg-card-desc">{SECCIONES[1].desc}</div>
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Código postal</label>
              <input value={data.cp || ""} onChange={(e) => alCambiarCp(e.target.value)} maxLength={5} />
              {buscandoCp && <div className="field-hint">Buscando…</div>}
            </div>
            <div className="field">
              <label>Estado</label>
              <select value={data.id_estado || ""} onChange={(e) => setData({ ...data, id_estado: e.target.value ? Number(e.target.value) : null, id_ciudad: null })}>
                <option value="">-- Selecciona --</option>
                {estados.map((e) => <option key={e.id_estado} value={e.id_estado}>{e.nombre_estado}</option>)}
              </select>
            </div>
            <div className="field full">
              <label>Municipio</label>
              <select value={data.id_ciudad || ""} onChange={(e) => setData({ ...data, id_ciudad: e.target.value ? Number(e.target.value) : null })} disabled={!data.id_estado}>
                <option value="">{data.id_estado ? "-- Selecciona --" : "Elige un estado primero"}</option>
                {ciudades.map((c) => <option key={c.id_ciudad} value={c.id_ciudad}>{c.nombre_ciudad}</option>)}
              </select>
            </div>
            <div className="field full">
              <label>Colonia</label>
              <input value={data.direccion || ""} onChange={(e) => setData({ ...data, direccion: e.target.value })} placeholder="Ej. Portales de la Arboleda" />
            </div>
            <div className="field">
              <label>Calle</label>
              <input value={data.calle || ""} onChange={(e) => setData({ ...data, calle: e.target.value })} />
            </div>
            <div className="field">
              <label>Número</label>
              <input value={data.numero_taller || ""} onChange={(e) => setData({ ...data, numero_taller: e.target.value })} />
            </div>
          </div>
        </section>

        <section className="cfg-card">
          <div className="cfg-card-header">
            <span className="cfg-card-icono"><Icono nombre="clock" size={18} /></span>
            <div>
              <h2>Horario de atención</h2>
              <div className="cfg-card-desc">Es el horario que se marca en el calendario de citas.</div>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Apertura</label>
              <select value={data.hora_apertura || "08:00"} onChange={(e) => setData({ ...data, hora_apertura: e.target.value })}>
                {OPCIONES_HORA.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Cierre</label>
              <select value={data.hora_cierre || "18:00"} onChange={(e) => setData({ ...data, hora_cierre: e.target.value })}>
                {OPCIONES_HORA.filter((o) => o.v > (data.hora_apertura || "08:00")).map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
              </select>
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Días de atención</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[["1", "Lun"], ["2", "Mar"], ["3", "Mié"], ["4", "Jue"], ["5", "Vie"], ["6", "Sáb"], ["7", "Dom"]].map(([n, t]) => {
                const dias = (data.dias_atencion || "1,2,3,4,5,6").split(",");
                const on = dias.includes(n);
                return (
                  <button type="button" key={n} className={`btn btn-sm ${on ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setData({ ...data, dias_atencion: (on ? dias.filter((x) => x !== n) : [...dias, n]).sort().join(",") })}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {!sinAccesoFiscal && (
          <section className="cfg-card cfg-card-fiscal">
            <div className="cfg-card-header">
              <span className="cfg-card-icono cfg-card-icono-fiscal"><IconoAuto valor={SECCIONES[2].icono} size={18} /></span>
              <div>
                <h2>{SECCIONES[2].titulo}</h2>
                <div className="cfg-card-desc">{SECCIONES[2].desc}</div>
              </div>
              {fiscal && (
                <span className={`badge ${fiscal.pac_modo === "simulado" ? "badge-grey" : "badge-teal"}`} style={{ marginLeft: "auto" }} title="Estado de la facturación electrónica">
                  {fiscal.pac_modo === "simulado" ? "Modo simulado" : "Timbrado real"}
                </span>
              )}
            </div>

            {!fiscal ? (
              <div className="loading-text">Cargando…</div>
            ) : (
              <fieldset className="insp-fieldset" disabled={!puedeFiscal}>
                <div className="form-grid">
                  <div className="field full">
                    <label>Razón social (como en tu constancia de situación fiscal)</label>
                    <input value={fiscal.razon_social_emisor || ""} onChange={(e) => setFiscal({ ...fiscal, razon_social_emisor: e.target.value.toUpperCase() })} placeholder="ALDM AUTOCORE SA DE CV" />
                  </div>
                  <div className="field">
                    <label>RFC</label>
                    <input value={fiscal.rfc_emisor || ""} onChange={(e) => setFiscal({ ...fiscal, rfc_emisor: e.target.value.toUpperCase() })} maxLength={13} placeholder="XAXX010101000" />
                  </div>
                  <div className="field">
                    <label>Código postal de expedición</label>
                    <input value={fiscal.cp_expedicion || ""} onChange={(e) => setFiscal({ ...fiscal, cp_expedicion: e.target.value })} maxLength={5} />
                  </div>
                  <div className="field full">
                    <label>Régimen fiscal</label>
                    <select value={fiscal.regimen_fiscal_emisor || ""} onChange={(e) => setFiscal({ ...fiscal, regimen_fiscal_emisor: e.target.value })}>
                      <option value="">-- Selecciona --</option>
                      {regimenes.map((r) => <option key={r.clave} value={r.clave}>{r.clave} · {r.descripcion}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field-hint" style={{ marginTop: 4, marginBottom: 12 }}>
                  Serie, folio y demás ajustes de timbrado están en Facturación → <IconoAuto valor="⚙️" size={18} /> Configuración fiscal.
                </div>
              </fieldset>
            )}
          </section>
        )}

        <section className="cfg-card">
          <div className="cfg-card-header">
            <span className="cfg-card-icono"><IconoAuto valor={SECCIONES[3].icono} size={18} /></span>
            <div>
              <h2>{SECCIONES[3].titulo}</h2>
            </div>
          </div>
          <label className="cfg-switch-row">
            <input
              type="checkbox"
              checked={verificacion2Pasos}
              onChange={(e) => {
                setVerificacion2Pasos(e.target.checked);
                localStorage.setItem("sm_verificacion_2_pasos", e.target.checked ? "true" : "false");
              }}
            />
            <div>
              <div className="cfg-switch-titulo">Verificación en 2 pasos al crear órdenes</div>
              <div className="field-hint">Pide un código que confirma el cliente antes de abrir la orden</div>
            </div>
          </label>
        </section>
        {user?.qr_taller && (
          <section className="cfg-card">
            <div className="cfg-card-header">
              <span className="cfg-card-icono"><IconoAuto valor="📱" size={24} /></span>
              <div>
                <h2>QR para tus clientes</h2>
                <div className="cfg-card-desc">Tus clientes lo escanean con su celular para entrar a la app de tu taller</div>
              </div>
            </div>
            <div className="qr-taller">
              <QrTaller contenido={user.qr_taller} />
              <div>
                <div className="field-hint">Código de tu taller</div>
                <div className="qr-taller-codigo">{user.codigo_taller}</div>
                <div className="field-hint" style={{ marginTop: 10 }}>Imprímelo y ponlo en recepción, o mándalo por WhatsApp. Si el cliente no puede escanear, puede escribir el código en la app.</div>
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
