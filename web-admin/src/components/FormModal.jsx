import Combo from "./Combo";
import { propsContacto, limpiarValorContacto } from "../validacion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { IconoAuto, Icono } from "./Icono";

/**
 * Modal con formulario genérico, dirigido por configuración.
 *
 * fields: [{ name, label, type: 'text'|'number'|'select'|'textarea'|'checkbox'|'date'|'multiselect',
 *            options?: [{value,label}], required?, full?, disabled?, icono?, grupo?, hint? (texto de ayuda bajo el campo),
 *            creatable?: {                 // habilita "+ Nuevo" junto al select
 *              endpoint: '/vehiculos-marcas',   // endpoint del catálogo
 *              createField: 'nombre_marca',      // nombre del campo que espera el POST
 *              label: 'marca',                   // texto para "Nueva marca"
 *              idField: 'id_marca_vehiculo',      // llave primaria que regresa la API
 *              onCreated: (nuevoItem) => void,    // para refrescar las opciones en la página padre
 *            } }]
 * initialValues: valores por defecto (para editar) o {} para crear
 * onSubmit(values): función async que guarda
 * onClose(): cierra el modal
 *
 * icono / colorAcento / subtitulo: opcionales — le dan al modal el mismo
 * encabezado con avatar de color que tiene "Nuevo cliente". colorAcento es
 * uno de: petrol | teal | warn | violet | blue.
 *
 * grupos: opcional — { clave: { icono, titulo, acento? } }. Si se manda,
 * cada campo con `grupo: 'clave'` se agrupa en un bloque con encabezado de
 * color (como los 3 bloques de "Nuevo cliente"); los campos sin `grupo`
 * reconocido caen en un bloque final "Otros datos". Si no se manda, los
 * campos se muestran en una sola cuadrícula plana (comportamiento original).
 *
 * Cada campo de texto/número/fecha también puede traer `icono: '📱'` para
 * mostrarlo dentro del input — si no lo trae, FormModal intenta inferirlo
 * del nombre del campo (correo, teléfono, precio, fecha, código postal…).
 */
export default function FormModal({ title, fields, initialValues, onSubmit, onClose, footerExtra, icono, colorAcento = "petrol", subtitulo, grupos }) {
  const [values, setValues] = useState(initialValues || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [camposFaltantes, setCamposFaltantes] = useState([]); // nombres de campos obligatorios vacíos, para marcarlos en rojo
  const [quickAdd, setQuickAdd] = useState(null); // { field } cuando el mini-formulario está abierto
  const [quickAddValue, setQuickAddValue] = useState("");
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddError, setQuickAddError] = useState("");

  useEffect(() => {
    setValues(initialValues || {});
  }, [initialValues]);

  // `fields` puede ser un array fijo, o una función(values) => array para
  // que un campo dependa de lo que el usuario ya eligió en otro (ej. la
  // lista de vehículos depende del cliente seleccionado).
  const resolvedFields = typeof fields === "function" ? fields(values) : fields;
  // Todos los combos se ordenan alfabéticamente por defecto — un campo
  // puede pedir noOrdenar:true si el orden ya trae un sentido propio
  // (ej. catálogos donde el orden natural importa).
  const camposConOpcionesOrdenadas = resolvedFields.map((f) =>
    f.options && !f.noOrdenar
      ? { ...f, options: [...f.options].sort((a, b) => a.label.localeCompare(b.label, "es")) }
      : f
  );

  // Los campos obligatorios se muestran primero (el orden relativo se conserva)
  const camposOrdenados = [...camposConOpcionesOrdenadas.filter((f) => f.required), ...camposConOpcionesOrdenadas.filter((f) => !f.required)];

  function update(name, value) {
    setValues((v) => {
      const siguiente = { ...v, [name]: value };
      // Un campo puede definir onElegir(valorElegido, valoresActuales) => campos
      // extra a autocompletar — ej. al elegir un vehículo, precargar su
      // último kilometraje conocido en "km_llegada".
      const campo = camposConOpcionesOrdenadas.find((f) => f.name === name);
      if (campo?.onElegir) {
        const extra = campo.onElegir(value, siguiente);
        if (extra) Object.assign(siguiente, extra);
      }
      return siguiente;
    });
    // En cuanto la persona corrige un campo marcado en rojo, se le quita la
    // marca — no hace falta esperar a que vuelva a dar clic en Guardar.
    if (camposFaltantes.includes(name)) {
      setCamposFaltantes((prev) => prev.filter((n) => n !== name));
    }
  }

  function estaVacio(valor) {
    return valor === undefined || valor === null || valor === "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const faltantes = camposConOpcionesOrdenadas
      .filter((f) => f.required && !f.disabled && estaVacio(values[f.name]))
      .map((f) => f.name);
    if (faltantes.length > 0) {
      setCamposFaltantes(faltantes);
      setError("Faltan campos obligatorios por completar (marcados en rojo).");
      return;
    }
    setCamposFaltantes([]);
    setSaving(true);
    setError("");
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  function abrirAltaRapida(field) {
    setQuickAdd({ field });
    setQuickAddValue("");
    setQuickAddError("");
  }

  async function guardarAltaRapida(e) {
    e.preventDefault();
    const { field } = quickAdd;
    if (!quickAddValue.trim()) {
      setQuickAddError("Escribe un nombre.");
      return;
    }
    setQuickAddSaving(true);
    setQuickAddError("");
    try {
      const extra = field.creatable.extraFields ? field.creatable.extraFields(values) : {};
      const nuevo = await api.post(field.creatable.endpoint, {
        [field.creatable.createField]: quickAddValue.trim(),
        ...extra,
      });
      field.creatable.onCreated?.(nuevo);
      update(field.name, nuevo[field.creatable.idField]);
      setQuickAdd(null);
    } catch (err) {
      setQuickAddError(err.message);
    } finally {
      setQuickAddSaving(false);
    }
  }

  // Ícono dentro del input para campos de texto/número/fecha — explícito
  // con `f.icono`, si no se infiere del nombre para no tener que anotar
  // campo por campo en cada página.
  function inferirIcono(f) {
    if (f.icono) return f.icono;
    if (f.type === "date") return "📅";
    const n = f.name.toLowerCase();
    if (n.includes("correo") || n.includes("email")) return "✉️";
    if (n.includes("telefono") || n.includes("tel_")) return "📱";
    if (n.includes("precio") || n.includes("costo") || n.includes("monto") || n.includes("pago") || n.includes("comision")) return "💲";
    if (n.includes("cp_") || n.includes("codigo_postal") || n === "cp") return "📮";
    if (n.includes("direccion") || n.includes("calle") || n.includes("ubicacion")) return "📍";
    if (n.includes("stock") || n.includes("cantidad") || n.includes("kilometraje") || n.includes("km_")) return "🔢";
    if (n.includes("rfc")) return "🧾";
    if (n.includes("placa")) return "🚗";
    return null;
  }

  function renderCampo(f) {
    return (
      <div className={`field ${f.full ? "full" : ""} ${camposFaltantes.includes(f.name) ? "campo-con-error" : ""}`} key={f.name}>
        <label>{f.label}{f.required && <span className="req" aria-hidden="true"> *</span>}</label>
        {f.type === "buscable" ? (
          <ComboBuscable
            options={f.options}
            value={values[f.name] ?? ""}
            onChange={(v) => update(f.name, v)}
            disabled={f.disabled}
            placeholder={f.placeholder || "Escribe para buscar…"}
          />
        ) : f.type === "select" ? (
          <div className="select-with-add">
            <Combo
              required={f.required}
              disabled={f.disabled}
              value={values[f.name] ?? ""}
              opciones={f.options}
              onChange={(v) => update(f.name, v === null || v === "" ? null : v)}
            />
            {f.creatable && !f.disabled && (
              <button
                type="button"
                className="btn-quick-add"
                title={`Agregar ${f.creatable.label}`}
                onClick={() => abrirAltaRapida(f)}
              >
                + Nuevo
              </button>
            )}
          </div>
        ) : f.type === "textarea" ? (
          <textarea
            value={values[f.name] ?? ""}
            onChange={(e) => update(f.name, e.target.value)}
          />
        ) : f.type === "checkbox" ? (
          <input
            type="checkbox"
            checked={!!values[f.name]}
            onChange={(e) => update(f.name, e.target.checked)}
          />
        ) : f.type === "file-multiple" ? (
          <div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => update(f.name, Array.from(e.target.files || []))}
            />
            {values[f.name]?.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 6 }}>
                {values[f.name].length} foto(s) lista(s) para subir con la orden.
              </div>
            )}
          </div>
        ) : f.type === "multiselect" ? (
          <div className="chips-select">
            {f.options.map((opt) => {
              const seleccionado = (values[f.name] || []).includes(opt.value);
              return (
                <button
                  type="button"
                  key={opt.value}
                  className={`chip-toggle ${seleccionado ? "chip-toggle-on" : ""}`}
                  onClick={() => {
                    const actuales = values[f.name] || [];
                    update(f.name, seleccionado ? actuales.filter((v) => v !== opt.value) : [...actuales, opt.value]);
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        ) : (
          (() => {
            const iconoCampo = inferirIcono(f);
            const input = (
              <input
                type={f.type || "text"}
                required={f.required}
                disabled={f.disabled}
                value={values[f.name] ?? ""}
                {...propsContacto(f.name)}
                onChange={(e) => {
                  if (f.type === "number") {
                    // Si se deja vacío, se guarda vacío (no 0) — si no,
                    // al escribir el siguiente dígito se pega después
                    // del "0" en vez de reemplazarlo (ej. "010").
                    update(f.name, e.target.value === "" ? "" : Number(e.target.value));
                  } else {
                    update(f.name, limpiarValorContacto(f.name, e.target.value));
                  }
                }}
              />
            );
            return iconoCampo ? (
              <div className="input-icono">
                <span className="icono-prefijo"><IconoAuto valor={iconoCampo} size={17} /></span>
                {input}
              </div>
            ) : input;
          })()
        )}
        {f.hint && <div className="field-hint">{f.hint}</div>}
      </div>
    );
  }

  // Si se mandó `grupos`, los campos se acomodan en bloques con encabezado
  // de color (mismo patrón que "Nuevo cliente"); si no, cuadrícula plana.
  let bloques = null;
  if (grupos) {
    const usados = new Set(Object.keys(grupos));
    bloques = Object.entries(grupos)
      .map(([clave, meta]) => ({ clave, ...meta, campos: camposOrdenados.filter((f) => f.grupo === clave) }))
      .filter((b) => b.campos.length > 0);
    const resto = camposOrdenados.filter((f) => !f.grupo || !usados.has(f.grupo));
    if (resto.length > 0) bloques.push({ clave: "__otros", icono: "📝", titulo: "Otros datos", campos: resto });
    bloques = [...bloques.filter((b) => b.campos.some((c) => c.required)), ...bloques.filter((b) => !b.campos.some((c) => c.required))];
  }

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${bloques ? "modal-ancho" : ""}`}>
        <div className="modal-header-icono">
          <div className="modal-avatar-icono" style={{ "--acc": `var(--${colorAcento}-600)`, "--acc-soft": `var(--${colorAcento}-100)` }}>
            <IconoAuto valor={icono || "📝"} size={24} />
          </div>
          <div>
            <h2>{title}</h2>
            {subtitulo && <div className="modal-subtitulo">{subtitulo}</div>}
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          {bloques ? (
            <div className="bloques-grid">
            {bloques.map((b) => (
              <div className={`nota-bloque ${b.acento || ""}`} key={b.clave}>
                <div className="nota-bloque-header">
                  <span className="icono"><IconoAuto valor={b.icono} size={18} /></span>
                  <h2>{b.titulo}</h2>
                </div>
                <div className="nota-bloque-body form-grid">
                  {b.campos.map((f) => renderCampo(f))}
                </div>
              </div>
            ))}
            </div>
          ) : (
            <div className="form-grid">
              {camposOrdenados.map((f) => renderCampo(f))}
            </div>
          )}
          {error && <div className="error-text">{error}</div>}
          {footerExtra}
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

      {quickAdd && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setQuickAdd(null)}>
          <div className="modal" style={{ maxWidth: 360 }}>
            <h2 style={{ fontSize: 19 }}>Nuevo{quickAdd.field.creatable.label ? ` ${quickAdd.field.creatable.label}` : ""}</h2>
            <form onSubmit={guardarAltaRapida}>
              <div className="field">
                <label>Nombre</label>
                <input
                  autoFocus
                  value={quickAddValue}
                  onChange={(e) => setQuickAddValue(e.target.value)}
                />
              </div>
              {quickAddError && <div className="error-text">{quickAddError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setQuickAdd(null)}>
                  <span className="btn-ico"><Icono nombre="close" size={20} /></span>Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={quickAddSaving}>
                  {quickAddSaving ? "Guardando..." : "Agregar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

/**
 * Combo con buscador — para catálogos largos (clientes, refacciones) donde
 * desplazarse por un <select> normal con cientos de opciones es lento.
 * Escribes y filtra; al elegir una opción, se cierra y queda seleccionada.
 */
function ComboBuscable({ options, value, onChange, disabled, placeholder }) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const opcionElegida = options.find((o) => String(o.value) === String(value));

  const filtradas = texto.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(texto.trim().toLowerCase()))
    : options;

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        disabled={disabled}
        value={abierto ? texto : (opcionElegida?.label || "")}
        placeholder={placeholder}
        onFocus={() => { setTexto(""); setAbierto(true); }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
      />
      {abierto && (
        <div className="suggestions" style={{ maxHeight: 220 }}>
          {filtradas.length === 0 ? (
            <div className="suggestion-item" style={{ color: "var(--ink-500)", cursor: "default" }}>Sin resultados</div>
          ) : (
            filtradas.slice(0, 50).map((o) => (
              <div
                key={o.value}
                className="suggestion-item"
                onMouseDown={() => { onChange(o.value); setAbierto(false); }}
              >
                {o.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
