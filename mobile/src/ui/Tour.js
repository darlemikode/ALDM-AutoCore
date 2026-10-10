import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, BackHandler, useWindowDimensions } from "react-native";
import { initialWindowMetrics } from "react-native-safe-area-context";
import { colors, temaActivo } from "../theme";
import { crearEstilos } from "./estilos";

/*
 * Recorrido con globos de texto (tutorial) para la app.
 *   - Cada elemento que se quiere señalar se registra con useObjetivoTour("clave")
 *     (ref + collapsable={false} en el View).
 *   - abrirTour(pasos, onTerminar) lo muestra; <TourHost /> va una sola vez en App.js.
 *   - El globo se pone ARRIBA o ABAJO de lo iluminado, nunca encima: se prueba
 *     primero el lado con más espacio y se elige el que no tape el elemento.
 *   - Si un paso apunta a algo que no está en pantalla, se brinca.
 * pasos: [{ objetivo?: "clave", parte?: { i, n }, centro?: true, titulo, texto }]
 *   parte: toma solo la porción i de n (p. ej. una pestaña de la barra de abajo).
 */
const MARGEN = 14;   // aire entre lo iluminado y el globo
const RELLENO = 6;   // aire alrededor de lo iluminado
const ORILLA = 14;   // distancia mínima a las orillas de la pantalla

const objetivos = new Map(); // clave -> Set de refs
export function useObjetivoTour(clave) {
  const ref = useRef(null);
  useEffect(() => {
    if (!objetivos.has(clave)) objetivos.set(clave, new Set());
    const lista = objetivos.get(clave);
    lista.add(ref);
    return () => { lista.delete(ref); };
  }, [clave]);
  return ref;
}

function medir(ref) {
  return new Promise((ok) => {
    const n = ref?.current;
    if (!n || !n.measureInWindow) return ok(null);
    n.measureInWindow((x, y, w, h) => ok(w > 0 && h > 0 ? { x, y, w, h } : null));
  });
}

async function buscar(paso, pantalla) {
  if (paso.centro) return null;
  const lista = [...(objetivos.get(paso.objetivo) || [])].reverse(); // el más reciente primero
  for (const ref of lista) {
    const r = await medir(ref);
    if (r && r.x < pantalla.w && r.y < pantalla.h && r.x + r.w > 0 && r.y + r.h > 0) {
      if (paso.parte) {
        const ancho = r.w / paso.parte.n;
        return { x: r.x + ancho * paso.parte.i, y: r.y, w: ancho, h: r.h };
      }
      return r;
    }
  }
  return null;
}

let abrirExterno = null;
export function abrirTour(pasos, onTerminar) {
  abrirExterno?.({ pasos, onTerminar });
}

export function TourHost() {
  const [tour, setTour] = useState(null);
  const [i, setI] = useState(0);
  const [hueco, setHueco] = useState(null);   // rectángulo iluminado (coordenadas del host)
  const [listo, setListo] = useState(false);
  const [altoGlobo, setAltoGlobo] = useState(0);
  const origen = useRef({ x: 0, y: 0 });
  const hostRef = useRef(null);
  const dir = useRef(1);
  const { width: W, height: H } = useWindowDimensions();
  const ins = initialWindowMetrics?.insets || { top: 0, bottom: 0 };

  useEffect(() => {
    abrirExterno = (t) => { dir.current = 1; setI(0); setListo(false); setHueco(null); setTour(t); };
    return () => { abrirExterno = null; };
  }, []);

  const terminar = useCallback((completo) => {
    const t = tour;
    setTour(null);
    t?.onTerminar?.(completo);
  }, [tour]);

  const paso = tour?.pasos[i];

  // Ubica lo que se va a iluminar (o brinca el paso si no está en pantalla)
  useEffect(() => {
    if (!tour || !paso) return undefined;
    let vivo = true;
    setListo(false);
    const t = setTimeout(async () => {
      const o = await medir(hostRef);
      if (o) origen.current = { x: o.x, y: o.y };
      const r = await buscar(paso, { w: W, h: H });
      if (!vivo) return;
      if (!paso.centro && !r) {
        const sig = i + dir.current;
        if (sig >= 0 && sig < tour.pasos.length) setI(sig); else terminar(true);
        return;
      }
      setHueco(r ? { x: r.x - origen.current.x - RELLENO, y: r.y - origen.current.y - RELLENO, w: r.w + RELLENO * 2, h: r.h + RELLENO * 2 } : null);
      setListo(true);
    }, 220);
    return () => { vivo = false; clearTimeout(t); };
  }, [tour, paso, i, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tour) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { terminar(false); return true; });
    return () => sub.remove();
  }, [tour, terminar]);

  if (!tour || !paso) return null;

  const ir = (delta) => {
    dir.current = delta;
    const sig = i + delta;
    if (sig >= tour.pasos.length) terminar(true);
    else if (sig >= 0) { setListo(false); setI(sig); }
  };

  const oscuro = temaActivo() === "oscuro";
  const velo = oscuro ? "rgba(0,0,0,0.72)" : "rgba(10,24,30,0.66)";
  const anchoGlobo = Math.min(W - ORILLA * 2, 380);
  const arribaMin = ins.top + ORILLA;
  const abajoMax = H - ins.bottom - ORILLA;

  // Dónde va el globo: arriba o abajo de lo iluminado, sin taparlo
  let globo = { left: (W - anchoGlobo) / 2, top: Math.max(arribaMin, (H - altoGlobo) / 2) };
  if (hueco && listo) {
    const espacioAbajo = abajoMax - (hueco.y + hueco.h + MARGEN);
    const espacioArriba = (hueco.y - MARGEN) - arribaMin;
    const left = Math.min(Math.max(ORILLA, hueco.x + hueco.w / 2 - anchoGlobo / 2), W - anchoGlobo - ORILLA);
    const abajo = { left, top: hueco.y + hueco.h + MARGEN };
    const arriba = { left, top: hueco.y - MARGEN - altoGlobo };
    if (espacioAbajo >= altoGlobo && (espacioAbajo >= espacioArriba || espacioArriba < altoGlobo)) globo = abajo;
    else if (espacioArriba >= altoGlobo) globo = arriba;
    else globo = espacioAbajo >= espacioArriba ? { left, top: abajoMax - altoGlobo } : { left, top: arribaMin };
  }

  const ultimo = i === tour.pasos.length - 1;
  const mostrar = listo && altoGlobo > 0;

  return (
    <View ref={hostRef} collapsable={false} style={styles.capa} pointerEvents="auto"
      accessibilityViewIsModal onStartShouldSetResponder={() => true}>
      {hueco && listo ? (
        <>
          <View style={[styles.sombra, { backgroundColor: velo, left: 0, top: 0, right: 0, height: Math.max(0, hueco.y) }]} />
          <View style={[styles.sombra, { backgroundColor: velo, left: 0, top: hueco.y + hueco.h, right: 0, bottom: 0 }]} />
          <View style={[styles.sombra, { backgroundColor: velo, left: 0, top: hueco.y, width: Math.max(0, hueco.x), height: hueco.h }]} />
          <View style={[styles.sombra, { backgroundColor: velo, left: hueco.x + hueco.w, top: hueco.y, right: 0, height: hueco.h }]} />
          <View pointerEvents="none" style={[styles.marco, { left: hueco.x, top: hueco.y, width: hueco.w, height: hueco.h, borderColor: colors.petrol500 }]} />
        </>
      ) : (
        <View style={[styles.sombra, { backgroundColor: velo, left: 0, top: 0, right: 0, bottom: 0 }]} />
      )}

      <View
        onLayout={(e) => setAltoGlobo(e.nativeEvent.layout.height)}
        style={[styles.globo, { width: anchoGlobo, left: globo.left, top: globo.top, opacity: mostrar ? 1 : 0 }]}
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.cuenta}>Paso {i + 1} de {tour.pasos.length}</Text>
        <Text style={styles.titulo}>{paso.titulo}</Text>
        <Text style={styles.texto}>{paso.texto}</Text>
        <View style={styles.puntos}>
          {tour.pasos.map((_, k) => <View key={k} style={[styles.punto, k === i && styles.puntoActivo]} />)}
        </View>
        <View style={styles.acciones}>
          <TouchableOpacity onPress={() => terminar(false)} hitSlop={10} style={styles.saltar} accessibilityRole="button">
            <Text style={styles.saltarTexto}>{i === 0 ? "Ahora no" : "Saltar"}</Text>
          </TouchableOpacity>
          <View style={styles.nav}>
            {i > 0 && (
              <TouchableOpacity onPress={() => ir(-1)} style={[styles.boton, styles.botonSec]} accessibilityRole="button">
                <Text style={[styles.botonTexto, { color: colors.ink900 }]}>Atrás</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => ir(1)} style={[styles.boton, { backgroundColor: colors.petrol600 }]} accessibilityRole="button">
              <Text style={[styles.botonTexto, { color: oscuro ? colors.paper100 : "#fff" }]}>{i === 0 ? "Empezar" : ultimo ? "Terminar" : "Siguiente"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = crearEstilos({
  capa: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000 },
  sombra: { position: "absolute" },
  marco: { position: "absolute", borderWidth: 3, borderRadius: 14 },
  globo: {
    position: "absolute", backgroundColor: colors.paper100, borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: colors.ink300,
    elevation: 14, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
  },
  cuenta: { fontSize: 13, fontWeight: "700", color: colors.petrol600, textTransform: "uppercase", letterSpacing: 0.8 },
  titulo: { fontFamily: "BarlowCondensed_700Bold", fontSize: 26, lineHeight: 30, color: colors.ink900, marginTop: 4 },
  texto: { fontSize: 17, lineHeight: 25, color: colors.ink700, marginTop: 6 },
  puntos: { flexDirection: "row", gap: 6, marginTop: 14 },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink300 },
  puntoActivo: { width: 22, backgroundColor: colors.petrol500 },
  acciones: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, gap: 10 },
  saltar: { paddingVertical: 12, paddingRight: 8 },
  saltarTexto: { fontSize: 16, fontWeight: "600", color: colors.ink700, textDecorationLine: "underline" },
  nav: { flexDirection: "row", gap: 10 },
  boton: { minHeight: 50, paddingHorizontal: 20, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  botonSec: { backgroundColor: colors.paper0, borderWidth: 1, borderColor: colors.ink300 },
  botonTexto: { fontSize: 17, fontWeight: "700" },
});
