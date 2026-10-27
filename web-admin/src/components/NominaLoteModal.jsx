import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

const RANGOS = [
  ["mes", "Este mes"], ["mes_sig", "Próximo mes"], ["trimestre", "Este trimestre"], ["semestre", "Este semestre"], ["anio", "Todo el año"],
];
const FRECUENCIAS = [
  ["semanal", "Semanal", "Cada semana"], ["quincenal", "Quincenal", "Días 15 y fin de mes"], ["mensual", "Mensual", "Una vez al mes"],
];
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/**
 * Asistente para generar varios periodos de nómina. Muestra una vista previa
 * exacta de lo que se va a crear (y qué periodos ya existen y se omitirán).
 * `generar(rango, periodicidad, dia)` => [{inicio, fin, nombre, existe}]
 */
export default function NominaLoteModal({ empleados, generar, onSubmit, onClose }) {
  const [rango, setRango] = useState("mes");
  const [frecuencia, setFrecuencia] = useState("semanal");
  const [dia, setDia] = useState(4);
  const [elegidos, setElegidos] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const lista = useMemo(() => generar(rango, frecuencia, dia), [generar, rango, frecuencia, dia]);
  const nuevos = lista.filter((p) => !p.existe).length;
  const omitidos = lista.length - nuevos;
  const todos = elegidos.length === 0;
  const quien = todos ? `todos los empleados que cobran (${empleados.length})` : `${elegidos.length} empleado(s) elegido(s)`;

  const toggle = (v) => setElegidos((a) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]));

  async function guardar() {
    setGuardando(true);
    try { await onSubmit({ rango, periodicidad: frecuencia, dia_pago: String(dia), empleados: elegidos }); }
    finally { setGuardando(false); }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal nom-lote">
        <h2 style={{ fontSize: 21 }}>Generar varios periodos</h2>
        <div className="modal-subtitulo">Elige qué tanto generar. Abajo ves exactamente qué se va a crear antes de guardar.</div>

        <div className="nl-paso"><span className="nl-num">1</span> ¿Qué tanto quieres generar?</div>
        <div className="nl-seg">
          {RANGOS.map(([v, l]) => <button type="button" key={v} className={rango === v ? "on" : ""} onClick={() => setRango(v)}>{l}</button>)}
        </div>

        <div className="nl-paso"><span className="nl-num">2</span> ¿Cada cuándo se paga?</div>
        <div className="nl-frec">
          {FRECUENCIAS.map(([v, l, d]) => (
            <button type="button" key={v} className={frecuencia === v ? "on" : ""} onClick={() => setFrecuencia(v)}>
              <b>{l}</b><small>{d}</small>
            </button>
          ))}
        </div>
        {frecuencia === "semanal" && (
          <div className="nl-dias">
            <span>Se paga el:</span>
            {DIAS.map((l, i) => <button type="button" key={l} className={dia === i ? "on" : ""} onClick={() => setDia(i)}>{l.slice(0, 3)}</button>)}
          </div>
        )}

        <div className="nl-paso"><span className="nl-num">3</span> ¿A quién se le paga?</div>
        <div className="nl-emps">
          <button type="button" className={`nl-emp todos ${todos ? "on" : ""}`} onClick={() => setElegidos([])}>Todos los que cobran</button>
          {empleados.map((e) => (
            <button type="button" key={e.value} className={`nl-emp ${elegidos.includes(e.value) ? "on" : ""}`} onClick={() => toggle(e.value)}>{e.label}</button>
          ))}
        </div>

        <div className="nl-prev">
          <div className="nl-prev-tit">Vista previa · {lista.length} periodo(s)</div>
          <div className="nl-prev-lista">
            {lista.length === 0 ? <div className="nl-vacio">No hay periodos en ese rango.</div> : lista.map((p) => (
              <div key={p.inicio} className={`nl-fila ${p.existe ? "existe" : ""}`}>
                <span>{p.nombre}</span>
                <small>{p.rangoTxt}</small>
                <em title={p.choque ? `Se traslapa con el periodo ya registrado ${p.choque}` : undefined}>{p.existe ? "Ya existe · se omite" : "Se creará"}</em>
                {p.existe && p.choque && <small className="nl-choque">Se traslapa con el periodo {p.choque}</small>}
              </div>
            ))}
          </div>
        </div>

        <div className="nl-resumen">
          Se crearán <b>{nuevos}</b> periodo(s) para <b>{quien}</b>{omitidos ? ` · ${omitidos} ya existían y no se tocan` : ""}.
          <br /><small>Cada periodo genera el recibo de cada empleado con su sueldo y comisiones actuales; podrás revisarlos antes de pagar.</small>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={guardando || nuevos === 0} onClick={guardar}>
            {guardando ? "Creando…" : nuevos ? `Crear ${nuevos} periodo(s)` : "Nada que crear"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
