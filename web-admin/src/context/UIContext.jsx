import { createContext, useCallback, useContext, useRef, useState } from "react";
import ModalPortal from "../components/ModalPortal";
import { avisoOmitido, omitirAviso } from "../preferencias";

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null); // { message, resolve }
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const [noPreguntar, setNoPreguntar] = useState(false);

  // `recordar: "clave"` agrega la casilla "No volver a preguntar"; si el
  // usuario ya la marcó antes, se confirma solo sin mostrar el diálogo.
  const confirmDialog = useCallback((message, { title = "Confirmar", danger = false, recordar = null } = {}) => {
    if (recordar && avisoOmitido(recordar)) return Promise.resolve(true);
    return new Promise((resolve) => {
      setNoPreguntar(false);
      setConfirmState({ message, title, danger, recordar, resolve });
    });
  }, []);

  function resolveConfirm(value) {
    if (value && noPreguntar && confirmState?.recordar) omitirAviso(confirmState.recordar);
    confirmState?.resolve(value);
    setConfirmState(null);
  }

  const notify = useCallback((message, type = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <UIContext.Provider value={{ confirmDialog, notify }}>
      {children}

      {confirmState && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && resolveConfirm(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h2 style={{ fontSize: 19 }}>{confirmState.title}</h2>
            <p style={{ color: "var(--ink-500)", fontSize: 14, lineHeight: 1.5, margin: "10px 0 0" }}>
              {confirmState.message}
            </p>
            {confirmState.recordar && (
              <label className="no-preguntar">
                <input type="checkbox" checked={noPreguntar} onChange={(e) => setNoPreguntar(e.target.checked)} />
                No volver a preguntar
              </label>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => resolveConfirm(false)}>Cancelar</button>
              <button
                className={confirmState.danger ? "btn btn-danger" : "btn btn-primary"}
                onClick={() => resolveConfirm(true)}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      <ModalPortal>
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
      </ModalPortal>
    </UIContext.Provider>
  );
}

export function useUI() {
  return useContext(UIContext);
}
