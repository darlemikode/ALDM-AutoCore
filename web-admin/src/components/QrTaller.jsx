import { useEffect, useRef } from "react";
import { toQR } from "../lib/toqr";

/** Dibuja un QR en un <canvas> (sin dependencias externas). */
export default function QrTaller({ contenido, tamano = 200 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !contenido) return;
    const matriz = toQR(contenido);
    const n = Math.round(Math.sqrt(matriz.length));
    const margen = 4; // zona blanca obligatoria alrededor del QR
    const total = n + margen * 2;
    const escala = Math.max(1, Math.floor(tamano / total));
    canvas.width = total * escala;
    canvas.height = total * escala;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (matriz[y * n + x] & 1) ctx.fillRect((x + margen) * escala, (y + margen) * escala, escala, escala);
      }
    }
  }, [contenido, tamano]);

  function descargar() {
    const enlace = document.createElement("a");
    enlace.download = "qr-taller.png";
    enlace.href = ref.current.toDataURL("image/png");
    enlace.click();
  }

  return (
    <div>
      <canvas ref={ref} aria-label="Código QR del taller" />
      <div style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={descargar}>Descargar QR</button>
      </div>
    </div>
  );
}
