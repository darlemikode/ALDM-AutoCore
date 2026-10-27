import { useEffect, useRef } from "react";
import ModalPortal from "../ModalPortal";
import { Icono } from "../Icono";

/** Vista previa de un PDF (blob) con botones de imprimir y descargar. */
export default function PdfModal({ url, titulo, nombre = "documento.pdf", onClose }) {
  const marco = useRef(null);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  if (!url) return null;
  function imprimir() {
    try { marco.current?.contentWindow?.focus(); marco.current?.contentWindow?.print(); } catch { window.open(url, "_blank"); }
  }
  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal modal-pdf">
          <div className="modal-pdf-header">
            <span>{titulo}</span>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={imprimir}><Icono nombre="printer" size={15} /> Imprimir</button>
              <a className="btn btn-secondary btn-sm" href={url} download={nombre}>Descargar</a>
              <button className="btn btn-secondary btn-sm" onClick={onClose}>Cerrar</button>
            </div>
          </div>
          <iframe ref={marco} src={url} title={titulo} className="modal-pdf-frame" />
        </div>
      </div>
    </ModalPortal>
  );
}
