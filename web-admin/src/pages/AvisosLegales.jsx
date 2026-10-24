import { Link } from "react-router-dom";

const VIGENTE = "Octubre 2026";

/** Avisos legales de la aplicación — por ahora: cálculo de nómina. */
export default function AvisosLegales() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Avisos legales</h1>
          <div className="subtitle">Última actualización: {VIGENTE}</div>
        </div>
        <Link className="btn btn-secondary" to="/nomina">← Nómina</Link>
      </div>

      <div className="panel avisos-legales">
        <h2>Cálculo de nómina</h2>
        <p>
          ALDM AutoCore calcula la nómina como una <b>herramienta administrativa de apoyo</b>. Las cifras son un <b>estimado operativo</b>:
          no sustituyen el timbrado de CFDI de nómina, el cálculo de un contador público ni el cumplimiento de las obligaciones fiscales,
          laborales y de seguridad social del patrón. El taller es el único responsable de revisar y validar cada recibo antes de pagarlo.
        </p>

        <h3>1. Sueldo neto mensual y mes de 30 días</h3>
        <p>
          El sueldo se captura <b>neto, por mes</b>. Para el pago de cada periodo se toma el mes como de <b>30 días</b>, igual que en la Ley Federal del Trabajo:
        </p>
        <ul>
          <li><b>Sueldo diario</b> = sueldo mensual ÷ 30</li>
          <li><b>Pago semanal</b> = sueldo mensual × 7 ÷ 30</li>
          <li><b>Pago quincenal</b> = sueldo mensual × 15 ÷ 30 (la mitad del mes)</li>
          <li><b>Pago mensual</b> = sueldo mensual</li>
        </ul>
        <p>Ejemplo: con $12,000 al mes, el pago semanal es $2,800.00, el quincenal $6,000.00 y el diario $400.00.</p>

        <h3>2. Horas extra</h3>
        <p>
          Valor de la hora = sueldo diario ÷ 8. Las horas extra se pagan <b>dobles</b>: horas extra × valor de la hora × 2.
          La aplicación no distingue las horas que, conforme al artículo 67 de la Ley Federal del Trabajo, deben pagarse al triple
          (más de 9 horas extra a la semana) ni limita las horas extra permitidas; el taller debe ajustarlo manualmente cuando aplique.
        </p>

        <h3>3. Faltas</h3>
        <p>Descuento por faltas = días de falta × sueldo diario (sin exceder el sueldo del periodo).</p>

        <h3>4. Comisiones, destajo y bonos</h3>
        <p>
          La comisión se calcula como un porcentaje sobre la mano de obra de las órdenes cerradas que atendió el empleado dentro del periodo.
          Destajo, bonos, préstamos y otras deducciones son capturas manuales del taller y quedan registradas en la bitácora de auditoría.
        </p>

        <h3>5. ISR e IMSS (estimados)</h3>
        <p>
          Cuando se activa «Retener ISR e IMSS», la aplicación estima el ISR con la tarifa mensual del artículo 96 de la Ley del ISR y el subsidio para el empleo vigentes
          que están configurados en el sistema, y la cuota obrera del IMSS sobre el salario base de cotización estimado. Son aproximaciones: la retención real puede variar por antigüedad,
          prestaciones, topes, otros ingresos, ajustes anuales o cambios en las disposiciones fiscales.
        </p>

        <h3>6. Confidencialidad y control de acceso</h3>
        <p>
          El sueldo y los montos de nómina son datos personales y financieros sensibles. Se ocultan por defecto y solo se muestran tras confirmar la contraseña del administrador;
          cada consulta, corrección o eliminación de periodos, y cada cambio de sueldo, queda registrado en la bitácora de auditoría con usuario, fecha y hora.
          El tratamiento de estos datos se rige por el Aviso de Privacidad de ALDM AutoCore.
        </p>

        <p className="avisos-nota">
          Este aviso describe cómo funciona el cálculo en la aplicación y no constituye asesoría legal, fiscal ni contable. Consulta a un profesional para tu caso particular.
        </p>
      </div>
    </>
  );
}
