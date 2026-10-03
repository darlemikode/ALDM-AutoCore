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

  return (
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.label}</th>
          ))}
          {(onEdit || onDelete || extraActions) && <th></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id ?? i} style={acentoFila ? { "--acc": acentoFila(row) } : acentoDe(i)}>
            {columns.map((col) => (
              <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
            ))}
            {(onEdit || onDelete || extraActions) && (
              <td>
                <div className="row-actions">
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
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
