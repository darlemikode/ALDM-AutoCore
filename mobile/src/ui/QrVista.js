// Dibuja un código QR con Views (sin librerías nativas): una fila por
// renglón del QR, y cada módulo negro es un cuadrito.
import { useMemo } from "react";
import { View } from "react-native";
import { toQR } from "../lib/toqr";

export default function QrVista({ contenido, tamano = 200 }) {
  const { filas, modulo } = useMemo(() => {
    if (!contenido) return { filas: [], modulo: 0 };
    const matriz = toQR(contenido);
    const n = Math.round(Math.sqrt(matriz.length));
    const margen = 4;
    const total = n + margen * 2;
    const filas = [];
    for (let y = -margen; y < n + margen; y++) {
      const tramos = [];
      let x = -margen;
      while (x < n + margen) {
        const negro = y >= 0 && y < n && x >= 0 && x < n && (matriz[y * n + x] & 1) === 1;
        let largo = 1;
        while (x + largo < n + margen) {
          const sig = x + largo;
          const sigNegro = y >= 0 && y < n && sig >= 0 && sig < n && (matriz[y * n + sig] & 1) === 1;
          if (sigNegro !== negro) break;
          largo++;
        }
        tramos.push({ negro, largo });
        x += largo;
      }
      filas.push(tramos);
    }
    return { filas, modulo: tamano / total };
  }, [contenido, tamano]);

  if (!filas.length) return null;
  return (
    <View style={{ width: tamano, height: tamano, backgroundColor: "#ffffff" }} accessibilityLabel="Código QR del taller">
      {filas.map((tramos, i) => (
        <View key={i} style={{ flexDirection: "row", height: modulo }}>
          {tramos.map((t, j) => (
            <View key={j} style={{ width: modulo * t.largo, height: modulo, backgroundColor: t.negro ? "#000000" : "#ffffff" }} />
          ))}
        </View>
      ))}
    </View>
  );
}
