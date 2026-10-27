import { useEffect, useRef, useState } from "react";
import ModalPortal from "../ModalPortal";

/** Escáner con la cámara (usa BarcodeDetector del navegador; en equipos sin soporte se usa lector USB/Bluetooth, que escribe el código como teclado). */
export default function EscanerCamara({ onCodigo, onClose }) {
  const video = useRef(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let parar = false, flujo, temporizador;
    (async () => {
      if (!("BarcodeDetector" in window)) {
        setError("Este navegador no puede leer códigos con la cámara. Usa un lector de códigos (USB o Bluetooth) o escribe el código.");
        return;
      }
      try {
        const detector = new window.BarcodeDetector({ formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39", "qr_code"] });
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (parar) { flujo.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = flujo;
        await video.current.play();
        temporizador = setInterval(async () => {
          try {
            const r = await detector.detect(video.current);
            if (r.length) { clearInterval(temporizador); onCodigo(r[0].rawValue); }
          } catch { /* fotograma sin código */ }
        }, 250);
      } catch {
        setError("No se pudo abrir la cámara. Revisa el permiso del navegador.");
      }
    })();
    return () => { parar = true; clearInterval(temporizador); flujo?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ maxWidth: 440 }}>
          <h2 style={{ fontSize: 18 }}>Escanear código</h2>
          {error ? <p className="field-hint">{error}</p> : (
            <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#000" }}>
              <video ref={video} playsInline muted style={{ width: "100%", display: "block" }} />
              <div style={{ position: "absolute", left: "10%", right: "10%", top: "42%", height: 2, background: "var(--petrol-500)", boxShadow: "0 0 8px var(--petrol-500)" }} />
            </div>
          )}
          <div className="modal-actions"><button className="btn btn-secondary" onClick={onClose}>Cerrar</button></div>
        </div>
      </div>
    </ModalPortal>
  );
}
