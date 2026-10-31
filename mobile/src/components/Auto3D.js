import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, PanResponder, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { capas, proyectar, PUNTOS3D } from "../lib/autoGeometria";

const SIMBOLO = { bien: "✓", regular: "!", mal: "✕", ninguno: "" };
const COLOR_PUNTO = { bien: "#1fb57a", regular: "#e49a1c", mal: "#e5484d", ninguno: "#5b6b85", ref: "#2f6fe0", refsel: "#1fb57a" };

/**
 * Auto deportivo en alambre azul (react-native-svg): gira solo, se arrastra con el dedo y se orienta
 * hacia la zona elegida. Mismo componente que el panel web.
 *  · puntos: clave -> { p: [[x,y,z]], ang } (por defecto, las zonas de la inspección)
 *  · estadoZona(clave) -> "bien" | "regular" | "mal" | "ninguno" · onSelect(clave) al tocar un punto
 *  · avance: { progreso, zonas } para iluminar el auto · sinPuntos: solo el auto · compacto: puntos chicos
 *  · etiqueta(clave, estado): texto dentro del punto · altura: alto en px · fps: cuadros por segundo
 */
export default function Auto3D({ estadoZona = () => "ninguno", elegida, onSelect = () => {}, puntos = PUNTOS3D, avance = null, sinPuntos = false, compacto = false, ayuda, etiqueta = null, altura = 300, fps = 20, girar = true }) {
  const [dim, setDim] = useState({ w: 0, h: altura });
  const [, setCuadro] = useState(0);
  const ang = useRef(-35);
  const objetivo = useRef(null);
  const arr = useRef({ activo: false, x: 0, movido: false, hasta: 0 });
  const avanceRef = useRef(avance);
  avanceRef.current = avance;
  const dimRef = useRef(dim);
  dimRef.current = dim;
  const girarRef = useRef(girar);
  girarRef.current = girar;

  useEffect(() => { objetivo.current = elegida && puntos[elegida] ? puntos[elegida].ang : null; }, [elegida, puntos]);

  useEffect(() => {
    let raf, ultimo = 0, previo = Date.now();
    const paso = () => {
      const ahora = Date.now();
      const dt = Math.min(64, ahora - previo);
      previo = ahora;
      const a = arr.current;
      if (!a.activo) {
        if (objetivo.current !== null) {
          const d = ((objetivo.current - ang.current + 540) % 360) - 180;
          if (Math.abs(d) > 0.2) ang.current += d * 0.1;
        } else if (girarRef.current && ahora > a.hasta) {
          ang.current += 0.3 * (dt / 16);
        }
      }
      if (ang.current > 180) ang.current -= 360;
      if (ang.current < -180) ang.current += 360;
      if (ahora - ultimo >= 1000 / fps && dimRef.current.w > 0) { ultimo = ahora; setCuadro((n) => (n + 1) % 1e9); }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [fps]);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { arr.current = { ...arr.current, activo: true, x: e.nativeEvent.pageX, movido: true }; objetivo.current = null; },
    onPanResponderMove: (e) => {
      const x = e.nativeEvent.pageX;
      ang.current += (x - arr.current.x) * 0.6;
      arr.current.x = x;
    },
    onPanResponderRelease: () => { arr.current.activo = false; arr.current.hasta = Date.now() + 3500; },
    onPanResponderTerminate: () => { arr.current.activo = false; arr.current.hasta = Date.now() + 3500; },
  })).current;

  const { w, h } = dim;
  const t = Date.now();
  const lista = w > 0 ? capas(w, h, ang.current, t, avanceRef.current) : [];
  const tam = compacto ? 22 : 26;

  return (
    <View style={s.caja}>
      <View style={[s.vista, { height: altura }]} onLayout={(e) => setDim({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...pan.panHandlers}>
        {w > 0 && (
          <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
            {lista.map((c, i) => <Path key={i} d={c.d} stroke={c.c} strokeOpacity={c.o} strokeWidth={c.w} strokeLinecap="round" fill="none" />)}
          </Svg>
        )}
        {w > 0 && !sinPuntos && Object.entries(puntos).map(([k, z]) => z.p.map((p, i) => {
          const q = proyectar(p, ang.current, w, h);
          const visible = (p[0] === 0 && p[1] >= 0.7) || q.zr > -0.5;
          const est = estadoZona(k);
          const activo = elegida === k;
          return (
            <TouchableOpacity key={`${k}-${i}`} activeOpacity={0.7} disabled={!visible} onPress={() => onSelect(k)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`${z.nombre || k}: ${est === "ninguno" ? "sin marcar" : est}`}
              style={[s.punto, { width: tam, height: tam, borderRadius: tam / 2, left: q.x - tam / 2, top: q.y - tam / 2, backgroundColor: COLOR_PUNTO[est] || COLOR_PUNTO.ninguno, opacity: visible ? 1 : 0.12, zIndex: visible ? Math.round(q.zc * 10) + 50 : 1 },
                activo && s.puntoActivo]}>
              <Text style={s.simbolo}>{etiqueta ? etiqueta(k, est) : SIMBOLO[est]}</Text>
            </TouchableOpacity>
          );
        }))}
      </View>
      <Text style={s.ayuda}>{ayuda || (sinPuntos ? "Arrastra para girar" : "Arrastra para girar · toca un punto para revisarlo")}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  caja: { width: "100%", alignItems: "center", gap: 6 },
  vista: { width: "100%", overflow: "hidden", borderRadius: 14, borderWidth: 1, borderColor: "rgba(80,160,255,0.35)", backgroundColor: "#050a15" },
  punto: { position: "absolute", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#dff0ff" },
  puntoActivo: { borderColor: "#8fd0ff", borderWidth: 3, transform: [{ scale: 1.2 }] },
  simbolo: { color: "#fff", fontSize: 11, fontWeight: "800" },
  ayuda: { fontSize: 11, color: "#7c8aa0", textAlign: "center" },
});
