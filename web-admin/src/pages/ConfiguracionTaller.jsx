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
const SECCIONES = [
  { id: "identidad", icono: "🏢", titulo: "Identidad del taller", desc: "Nombre, logo y contacto — así aparece en tus documentos" },
  { id: "ubicacion", icono: "📍", titulo: "Ubicación", desc: "Dirección del taller" },
  { id: "fiscal", icono: "🧾", titulo: "Datos fiscales de la empresa", desc: "Se usan al timbrar tus facturas (CFDI)" },
  { id: "seguridad", icono: "🔒", titulo: "Seguridad", desc: "" },
];

export default function ConfiguracionTaller() {
  const { notify } = useUI();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [estados, setEstados] = useState([]);
  const [ciudades, setCiudades] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [buscandoCp, setBuscandoCp] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [verificacion2Pasos, setVerificacion2Pasos] = useState(() => localStorage.getItem("sm_verificacion_2_pasos") === "true");
  const inputRef = useRef(null);

  // Datos fiscales — vienen de configuración fiscal (facturación electrónica)
  const [fiscal, setFiscal] = useState(null);
  const [regimenes, setRegimenes] = useState([]);
  const [guardandoFiscal, setGuardandoFiscal] = useState(false);
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

  async function guardar() {
    setGuardando(true);
    try {
      const actualizado = await api.put("/configuracion-taller/", {
        nombre_taller: data.nombre_taller,
        direccion: data.direccion,
        telefono: data.telefono,
        correo: data.correo,
        rfc: data.rfc,
        cp: data.cp,
        calle: data.calle,
        numero_taller: data.numero_taller,
        id_estado: data.id_estado || null,
        id_ciudad: data.id_ciudad || null,
      });
      setData(actualizado);
      notify("Datos del taller actualizados.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarFiscal() {
    setGuardandoFiscal(true);
    try {
      const actualizado = await api.put("/facturacion/configuracion", {
        ...fiscal,
        rfc_emisor: (fiscal.rfc_emisor || "").toUpperCase(),
      });
      setFiscal(actualizado);
      notify("Datos fiscales actualizados.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardandoFiscal(false);
    }
  }

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
          <Link className="icon-btn" to="/configuracion" title="Volver a Configuración">←</Link>
          <div>
            <h1><IconoModulo ruta="/configuracion-taller" /> Datos del taller</h1>
            <div className="subtitle">Esto aparece en el encabezado del recibo, la nota de remisión y tus facturas</div>
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
              <label>Teléfono</label>
              <input value={data.telefono || ""} onChange={(e) => setData({ ...data, telefono: e.target.value })} />
            </div>
            <div className="field full">
              <label>Correo</label>
              <input value={data.correo || ""} onChange={(e) => setData({ ...data, correo: e.target.value })} />
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
            <div className="field full">
              <label>Dirección (referencia, como se ve en la nota)</label>
              <input value={data.direccion || ""} onChange={(e) => setData({ ...data, direccion: e.target.value })} />
            </div>
            <div className="field">
              <label>Código postal</label>
              <input value={data.cp || ""} onChange={(e) => alCambiarCp(e.target.value)} maxLength={5} />
              {buscandoCp && <div className="field-hint">Buscando…</div>}
            </div>
            <div className="field">
              <label>Calle</label>
              <input value={data.calle || ""} onChange={(e) => setData({ ...data, calle: e.target.value })} />
            </div>
            <div className="field">
              <label>Número (exterior / de sucursal)</label>
              <input value={data.numero_taller || ""} onChange={(e) => setData({ ...data, numero_taller: e.target.value })} />
            </div>
            <div className="field">
              <label>Estado</label>
              <select value={data.id_estado || ""} onChange={(e) => setData({ ...data, id_estado: e.target.value ? Number(e.target.value) : null, id_ciudad: null })}>
                <option value="">-- Selecciona --</option>
                {estados.map((e) => <option key={e.id_estado} value={e.id_estado}>{e.nombre_estado}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Municipio</label>
              <select value={data.id_ciudad || ""} onChange={(e) => setData({ ...data, id_ciudad: e.target.value ? Number(e.target.value) : null })} disabled={!data.id_estado}>
                <option value="">{data.id_estado ? "-- Selecciona --" : "Elige un estado primero"}</option>
                {ciudades.map((c) => <option key={c.id_ciudad} value={c.id_ciudad}>{c.nombre_ciudad}</option>)}
              </select>
            </div>
          </div>

          <button className="btn btn-primary" onClick={guardar} disabled={guardando} style={{ marginTop: 16 }}>
            {guardando ? "Guardando…" : <><span className="btn-ico"><Icono nombre="save" size={20} /></span>Guardar datos del taller</>}
          </button>
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
              <>
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
                <button className="btn btn-primary" onClick={guardarFiscal} disabled={guardandoFiscal}>
                  {guardandoFiscal ? "Guardando…" : <><span className="btn-ico"><Icono nombre="save" size={20} /></span>Guardar datos fiscales</>}
                </button>
              </>
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
