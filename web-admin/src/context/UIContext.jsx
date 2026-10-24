import { useNavigate } from "react-router-dom";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import ModalPortal from "../components/ModalPortal";
import { avisoOmitido, omitirAviso } from "../preferencias";

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null); // { message, resolve }
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);
  const navigate = useNavigate();

  const [noPreguntar, setNoPreguntar] = useState(false);
  const [errorEmergente, setErrorEmergente] = useState(null);

  // `recordar: "clave"` agrega la casilla "No volver a preguntar"; si el
  // usuario ya la marcó antes, se confirma solo sin mostrar el diálogo.
  const confirmDialog = useCallback((message, { title = "Confirmar", danger = false, exito = false, recordar = null, confirmar = null } = {}) => {
    if (recordar && avisoOmitido(recordar)) return Promise.resolve(true);
    return new Promise((resolve) => {
      setNoPreguntar(false);
      setConfirmState({ message, title, danger, exito, recordar, confirmar, resolve });
    });
  }, []);

  function resolveConfirm(value) {
    if (value && noPreguntar && confirmState?.recordar) omitirAviso(confirmState.recordar);
    confirmState?.resolve(value);
    setConfirmState(null);
  }

  // Tope de avisos apilados: si el usuario da clic varias veces seguidas
  // (p.ej. un botón deshabilitado que igual se alcanza a pulsar de más),
  // no se amontonan decenas de avisos idénticos tapando la pantalla.
  const MAX_TOASTS = 3;
  const notify = useCallback((message, type = "info") => {
    // Los errores salen como ventana emergente que hay que aceptar (no se pierden como un aviso fugaz)
    if (type === "error") { setErrorEmergente({ message }); return; }
    setToasts((t) => {
      // Mismo mensaje y tipo ya mostrado: se reemplaza en vez de duplicarse.
      const repetido = t.find((x) => x.message === message && x.type === type);
      if (repetido) return t;
      const id = ++toastId.current;
      const siguiente = [...t, { id, message, type }];
      setTimeout(() => setToasts((t2) => t2.filter((x) => x.id !== id)), 3000);
      return siguiente.length > MAX_TOASTS ? siguiente.slice(siguiente.length - MAX_TOASTS) : siguiente;
    });
  }, []);

  return (
    <UIContext.Provider value={{ confirmDialog, notify }}>
      {children}

      {confirmState && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && resolveConfirm(false)}>
          <div className={`modal dialogo-confirmar ${confirmState.danger ? "peligro" : ""} ${confirmState.exito ? "exito" : ""}`} role="alertdialog" aria-modal="true">
            <div className="dialogo-franja" aria-hidden="true" />
            <div className="dialogo-cuerpo">
              <span className="dialogo-icono-zona" aria-hidden="true">
                <span className="dialogo-icono">{confirmState.danger ? "!" : confirmState.exito ? "$" : "?"}</span>
              </span>
              <h2 className="dialogo-titulo">{confirmState.title}</h2>
              {confirmState.message && <p className="dialogo-mensaje">{confirmState.message}</p>}
            </div>
            {confirmState.recordar && (
              <label className="no-preguntar">
                <input type="checkbox" checked={noPreguntar} onChange={(e) => setNoPreguntar(e.target.checked)} />
                No volver a preguntar
              </label>
            )}
            <div className="modal-actions dialogo-acciones">
              <button
                className={confirmState.danger ? "btn btn-danger" : confirmState.exito ? "btn btn-exito" : "btn btn-primary"}
                onClick={() => resolveConfirm(true)}
                autoFocus
              >
                {confirmState.confirmar || (confirmState.danger ? "Sí, continuar" : "Confirmar")}
              </button>
              <button className="btn btn-secondary" onClick={() => resolveConfirm(false)}>Cancelar</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {errorEmergente && (
        <ModalPortal>
        <div className="modal-backdrop" style={{ zIndex: 6000 }} onClick={(e) => e.target === e.currentTarget && setErrorEmergente(null)}>
          <div className="modal dialogo-confirmar peligro" role="alertdialog" aria-modal="true">
            <div className="dialogo-franja" aria-hidden="true" />
            <div className="dialogo-cuerpo">
              <span className="dialogo-icono-zona" aria-hidden="true"><span className="dialogo-icono">!</span></span>
              <h2 className="dialogo-titulo">Atención</h2>
              <p className="dialogo-mensaje">{errorEmergente.message}</p>
            </div>
            <div className="modal-actions dialogo-acciones">
              {(() => {
                const m = /orden\s*#(\d+)/i.exec(errorEmergente.message || "");
                return m ? (
                  <button className="btn btn-danger" autoFocus onClick={() => { setErrorEmergente(null); navigate(`/servicios/${m[1]}`); }}>Ir a la orden #{m[1]}</button>
                ) : null;
              })()}
              <button className={/orden\s*#\d+/i.test(errorEmergente.message || "") ? "btn btn-secondary" : "btn btn-danger"} onClick={() => setErrorEmergente(null)} autoFocus={!/orden\s*#\d+/i.test(errorEmergente.message || "")}>Entendido</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      <ModalPortal>
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role="status"><span className="toast-ico" aria-hidden="true">{t.type === "success" ? "✓" : t.type === "error" ? "!" : "i"}</span><span className="toast-texto">{t.message}</span></div>
        ))}
      </div>
      </ModalPortal>
    </UIContext.Provider>
  );
}

export function useUI() {
  return useContext(UIContext);
}
