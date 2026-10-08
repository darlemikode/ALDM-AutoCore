// Mismo ciclo de acentos que Roles y Clientes — cada fila toma un color
// distinto (borde izquierdo) para que las tablas largas se lean más rápido
// y no se vean todas iguales.
import { Icono } from "./Icono";

const COLORES = ["petrol", "teal", "warn", "violet", "blue"];
function acentoDe(indice) {
  const c = COLORES[indice % COLORES.length];
  return { "--acc": `var(--${c}-600)` };
}

/**
 * Tabla genérica.
 * columns: [{ key, label, render?(row) }]
 * rows: array de objetos
 * onEdit / onDelete: opcionales, agregan botones de acción por fila
 * extraActions?(row): opcional, regresa JSX extra para la columna de acciones
 * emptyMessage: texto cuando no hay filas
 */
export default function DataTable({ columns, rows, onEdit, onDelete, extraActions, acentoFila, emptyMessage = "Sin registros todavía." }) {
  if (!rows || rows.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  const hayAcc = onEdit || onDelete || extraActions;
  const [primera, ...resto] = columns;
  return (
    <div className="ordenes-lista">
      {rows.map((row, i) => (
        <div key={row.id ?? i} className="orden-fila fila-tabla" style={acentoFila ? { "--acc": acentoFila(row) } : acentoDe(i)}>
          <div className="orden-main">
            <div className="orden-titulo">{primera.render ? primera.render(row) : row[primera.key]}</div>
            {resto.length > 0 && (
              <div className="fila-datos">
                {resto.map((col) => {
                  const v = col.render ? col.render(row) : row[col.key];
                  if (v === null || v === undefined || v === "") return null;
                  return (
                    <div key={col.key} className="fila-dato">
                      <span className="fila-dato-etq">{col.label}</span>
                      <span className="fila-dato-val">{v}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {hayAcc && (
            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
              {extraActions && extraActions(row)}
              {onEdit && (
                <button className="btn-icono" title="Editar" aria-label="Editar" onClick={() => onEdit(row)}>
                  <Icono nombre="pencil" size={18} />
                </button>
              )}
              {onDelete && (
                <button className="btn-icono btn-icono-peligro" title="Eliminar" aria-label="Eliminar" onClick={() => onDelete(row)}>
                  <Icono nombre="trash" size={18} />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
