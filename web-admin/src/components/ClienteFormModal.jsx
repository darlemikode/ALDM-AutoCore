import { useEffect, useState } from "react";
import { marcarCampo, propsContacto, limpiarValorContacto } from "../validacion";
import { createPortal } from "react-dom";
import { api } from "../api";
import { IconoAuto, Icono } from "./Icono";

const ESTADOS_MEXICO = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas",
  "Chihuahua", "Ciudad de México", "Coahuila", "Colima", "Durango", "Estado de México",
  "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit",
  "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
];

/**
 * Formulario de cliente con código postal inteligente: al escribir un CP de
 * 5 dígitos que exista en el catálogo cargado (por ahora solo León, GTO —
 * ver README), llena solos estado/municipio y sugiere colonias.
 *
 * Es un componente aparte de FormModal porque necesita lógica propia (el
 * fetch al CP, las sugerencias de colonia) que el formulario genérico no
 * contempla.
 */
export default function ClienteFormModal({ title, initialValues, onSubmit, onClose }) {
  const [values, setValues] = useState(() => ({
    nombre_cliente: "", paterno_cliente: "", materno_cliente: "",
    telefono1: "", telefono2: "", correo_cliente: "", empresa_cliente: "", rfc_cliente: "",
    cp_cliente: "", estado_texto: "", ciudad_cliente: "", colonia_cliente: "",
    calle_cliente: "", numexterior_cliente: "", numinterior_cliente: "", comentarios: "",
    ...initialValues,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [buscandoCp, setBuscandoCp] = useState(false);
  const [coloniasSugeridas, setColoniasSugeridas] = useState([]);
  const [filtrarColonia, setFiltrarColonia] = useState(false); // solo filtra si el usuario está escribiendo
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  function update(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  // Si se está editando un cliente que ya tiene id_estado/id_ciudad
  // guardados (catálogo), se traducen de vuelta a texto para mostrarlos —
  // si no, el formulario se vería vacío aunque el cliente sí tenga dirección.
  useEffect(() => {
    if (!initialValues?.id_estado) return;
    (async () => {
      const estados = await api.get("/estados/");
      const estado = estados.find((e) => e.id_estado === initialValues.id_estado);
      let nombreCiudad = "";
      if (initialValues.id_ciudad && initialValues.id_estado) {
        const ciudades = await api.get(`/ciudades/?id_estado=${initialValues.id_estado}`);
        nombreCiudad = ciudades.find((c) => c.id_ciudad === initialValues.id_ciudad)?.nombre_ciudad || "";
      }
      setValues((v) => ({ ...v, estado_texto: estado?.nombre_estado || "", ciudad_cliente: nombreCiudad }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function alCambiarCp(valor) {
    update("cp_cliente", valor);
    if (valor.length !== 5) return;
    setBuscandoCp(true);
    try {
      const info = await api.get(`/codigos-postales/${valor}`);
      setValues((v) => ({ ...v, estado_texto: info.estado || v.estado_texto, ciudad_cliente: info.ciudad || v.ciudad_cliente }));
      setColoniasSugeridas(info.colonias || []);
      setMostrarSugerencias(true);
    } catch {
      // CP no encontrado en el catálogo cargado — no truena nada, se sigue
      // llenando a mano.
      setColoniasSugeridas([]);
    } finally {
      setBuscandoCp(false);
    }
  }

  // El backend guarda estado/ciudad como catálogo (id_estado/id_ciudad),
  // no como texto libre — antes este formulario capturaba el texto y lo
  // descartaba sin guardarlo. Aquí se busca (o se crea si no existe) la
  // fila correspondiente en el catálogo, y se manda su ID.
  async function resolverEstadoYCiudad(estadoTexto, ciudadTexto) {
    let idEstado = null;
    let idCiudad = null;
    if (estadoTexto?.trim()) {
      const estados = await api.get("/estados/");
      let estado = estados.find((e) => e.nombre_estado.toLowerCase() === estadoTexto.trim().toLowerCase());
      if (!estado) {
        const paises = await api.get("/paises/");
        let mexico = paises.find((p) => p.nombre_pais.toLowerCase().includes("méxico") || p.nombre_pais.toLowerCase().includes("mexico"));
        if (!mexico) mexico = await api.post("/paises/", { nombre_pais: "México" });
        estado = await api.post("/estados/", { nombre_estado: estadoTexto.trim(), id_pais: mexico.id_pais });
      }
      idEstado = estado.id_estado;

      if (ciudadTexto?.trim()) {
        const ciudades = await api.get(`/ciudades/?id_estado=${idEstado}`);
        let ciudad = ciudades.find((c) => c.nombre_ciudad.toLowerCase() === ciudadTexto.trim().toLowerCase());
        if (!ciudad) ciudad = await api.post("/ciudades/", { nombre_ciudad: ciudadTexto.trim(), id_estado: idEstado });
        idCiudad = ciudad.id_ciudad;
      }
    }
    return { idEstado, idCiudad };
  }

  const iniciales = ((values.nombre_cliente || "").trim()[0] || "") + ((values.paterno_cliente || "").trim()[0] || "");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.nombre_cliente.trim()) {
      marcarCampo(e.currentTarget.querySelector("input"), "Escribe el nombre del cliente");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { estado_texto, ciudad_cliente, ...resto } = values;
      const { idEstado, idCiudad } = await resolverEstadoYCiudad(estado_texto, ciudad_cliente);
      await onSubmit({ ...resto, id_estado: idEstado, id_ciudad: idCiudad });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-ancho modal-cliente">
        <div className="cliente-modal-header">
          <div className="cliente-avatar" style={{ "--acc": "var(--petrol-600)", "--acc-soft": "var(--petrol-100)", width: 46, height: 46, fontSize: 17 }}>
            {iniciales || <IconoAuto valor="🧑" size={22} />}
          </div>
          <div>
            <h2>{title}</h2>
            <div className="cliente-modal-subtitulo">Completa los datos de contacto y dirección del cliente.</div>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="bloques-grid">
          <div className="nota-bloque">
            <div className="nota-bloque-header">
              <span className="icono"><IconoAuto valor="🧑" size={18} /></span>
              <h2>Datos personales</h2>
            </div>
            <div className="nota-bloque-body form-grid">
              <div className="field">
                <label>Nombres<span className="req" aria-hidden="true"> *</span></label>
                <input value={values.nombre_cliente} onChange={(e) => update("nombre_cliente", e.target.value)} required />
              </div>
              <div className="field">
                <label>Apellido paterno</label>
                <input value={values.paterno_cliente || ""} onChange={(e) => update("paterno_cliente", e.target.value)} />
              </div>
              <div className="field">
                <label>Apellido materno</label>
                <input value={values.materno_cliente || ""} onChange={(e) => update("materno_cliente", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="nota-bloque acento-teal">
            <div className="nota-bloque-header">
              <span className="icono"><IconoAuto valor="📇" size={18} /></span>
              <h2>Contacto y empresa</h2>
            </div>
            <div className="nota-bloque-body form-grid">
              <div className="field">
                <label>Teléfono principal</label>
                <div className="input-icono">
                  <span className="icono-prefijo"><IconoAuto valor="📱" size={18} /></span>
                  <input value={values.telefono1 || ""} {...propsContacto("telefono1")} onChange={(e) => update("telefono1", limpiarValorContacto("telefono1", e.target.value))} />
                </div>
              </div>
              <div className="field">
                <label>Teléfono secundario</label>
                <div className="input-icono">
                  <span className="icono-prefijo"><IconoAuto valor="☎️" size={18} /></span>
                  <input value={values.telefono2 || ""} {...propsContacto("telefono2")} onChange={(e) => update("telefono2", limpiarValorContacto("telefono2", e.target.value))} />
                </div>
              </div>
              <div className="field">
                <label>Correo</label>
                <div className="input-icono">
                  <span className="icono-prefijo"><IconoAuto valor="✉️" size={18} /></span>
                  <input value={values.correo_cliente || ""} {...propsContacto("correo_cliente")} onChange={(e) => update("correo_cliente", limpiarValorContacto("correo_cliente", e.target.value))} />
                </div>
              </div>
              <div className="field">
                <label>Empresa</label>
                <div className="input-icono">
                  <span className="icono-prefijo"><IconoAuto valor="🏢" size={18} /></span>
                  <input value={values.empresa_cliente || ""} onChange={(e) => update("empresa_cliente", e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>RFC</label>
                <div className="input-icono">
                  <span className="icono-prefijo"><IconoAuto valor="🧾" size={18} /></span>
                  <input value={values.rfc_cliente || ""} onChange={(e) => update("rfc_cliente", e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="nota-bloque acento-ambar">
            <div className="nota-bloque-header">
              <span className="icono"><IconoAuto valor="📍" size={18} /></span>
              <h2>Dirección</h2>
            </div>
            <div className="nota-bloque-body form-grid">
              <div className="field">
                <label>Código postal</label>
                <div className="input-icono">
                  <span className="icono-prefijo"><IconoAuto valor="📮" size={18} /></span>
                  <input
                    value={values.cp_cliente || ""}
                    onChange={(e) => alCambiarCp(e.target.value)}
                    maxLength={5}
                    placeholder="37000"
                  />
                </div>
                {buscandoCp && <div style={{ fontSize: 11, color: "var(--ink-500)" }}>Buscando…</div>}
              </div>
              <div className="field">
                <label>Estado</label>
                <select value={values.estado_texto || ""} onChange={(e) => update("estado_texto", e.target.value)}>
                  <option value="">-- Selecciona --</option>
                  {ESTADOS_MEXICO.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Municipio / Ciudad</label>
                <input value={values.ciudad_cliente || ""} onChange={(e) => update("ciudad_cliente", e.target.value)} placeholder="Se llena con el CP" />
              </div>
              <div className="field" style={{ position: "relative" }}>
                <label>Colonia</label>
                <input
                  value={values.colonia_cliente || ""}
                  onChange={(e) => { update("colonia_cliente", e.target.value); setFiltrarColonia(true); setMostrarSugerencias(true); }}
                  onFocus={() => { setFiltrarColonia(false); setMostrarSugerencias(true); }}
                  onClick={() => { setFiltrarColonia(false); setMostrarSugerencias(true); }}
                  onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
                  placeholder="Escribe o elige del CP"
                  autoComplete="off"
                />
                {mostrarSugerencias && coloniasSugeridas.length > 0 && (
                  <div className="suggestions">
                    {coloniasSugeridas
                      .filter((c) => !filtrarColonia || c.toLowerCase().includes((values.colonia_cliente || "").toLowerCase()))
                      .map((c) => (
                        <div key={c} className="suggestion-item" onMouseDown={(e) => { e.preventDefault(); update("colonia_cliente", c); setMostrarSugerencias(false); }}>
                          {c}
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <div className="field full">
                <label>Calle</label>
                <input value={values.calle_cliente || ""} onChange={(e) => update("calle_cliente", e.target.value)} />
              </div>
              <div className="field">
                <label>Número ext.</label>
                <input value={values.numexterior_cliente || ""} onChange={(e) => update("numexterior_cliente", e.target.value)} />
              </div>
              <div className="field">
                <label>Número int.</label>
                <input value={values.numinterior_cliente || ""} onChange={(e) => update("numinterior_cliente", e.target.value)} />
              </div>
              <div className="field full">
                <label>Comentarios</label>
                <textarea value={values.comentarios || ""} onChange={(e) => update("comentarios", e.target.value)} />
              </div>
            </div>
          </div>
          </div>
          {error && <div className="error-text">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              <span className="btn-ico"><Icono nombre="close" size={20} /></span>Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Guardando…" : <><span className="btn-ico"><Icono nombre="save" size={20} /></span>Guardar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  ,
  document.body
  );
}
