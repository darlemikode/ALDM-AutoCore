import ModalPortal from "./ModalPortal";

/**
 * Modal de aviso/mensaje — mismo diseño elegante que el diálogo de
 * confirmación (dialogo-confirmar): franja superior, icono circular,
 * título y cuerpo centrados. Úsalo para cualquier "mensaje" (código,
 * contraseña temporal, "¿quieres hacer X ahora?", etc.) en vez de armar
 * un <div className="modal"> distinto en cada página — así todos se ven
 * igual en todo el sistema.
 */
export default function MensajeModal({ icono = "✓", titulo, children, primario, secundario, onCerrar, ancho = 420 }) {
  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCerrar?.()}>
        <div className="modal dialogo-confirmar" style={{ maxWidth: ancho }} role="alertdialog" aria-modal="true">
          {onCerrar && (
            <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={onCerrar}>✕</button>
          )}
          <div className="dialogo-franja" aria-hidden="true" />
          <div className="dialogo-cuerpo">
            <span className="dialogo-icono-zona" aria-hidden="true"><span className="dialogo-icono">{icono}</span></span>
            <h2 className="dialogo-titulo">{titulo}</h2>
            <div className="dialogo-mensaje">{children}</div>
          </div>
          {(primario || secundario) && (
            <div className="modal-actions dialogo-acciones">
              {primario && (
                <button type="button" className="btn btn-primary" onClick={primario.onClick} autoFocus>
                  {primario.icono}{primario.texto}
                </button>
              )}
              {secundario && (
                <button type="button" className="btn btn-secondary" onClick={secundario.onClick}>{secundario.texto}</button>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
