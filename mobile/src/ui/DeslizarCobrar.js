import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Animated, PanResponder, Easing } from "react-native";
import { Ionicons } from "./IconoWeb";
import { colors, temaActivo } from "../theme";
import { crearEstilos } from "./estilos";

/*
 * "Desliza para cobrar": se arrastra la perilla hasta el final para confirmar.
 * Si se suelta antes, regresa sola. Al llegar al final llama a onConfirmar y
 * vuelve a su sitio (la pantalla que se abre después ya es la de finalizar).
 */
// Azul petróleo: más profundo en tema claro, más luminoso en oscuro
export const tonoPetroleo = () => (temaActivo() === "oscuro" ? { base: "#1b9db8", oscuro: "#0d6479", claro: "#7fe3f5" } : { base: "#0e7490", oscuro: "#0a5266", claro: "#67d4ea" });

const PERILLA = 46;
const MARGEN = 4;

export default function DeslizarCobrar({ etiqueta, monto, onConfirmar, deshabilitado }) {
  const tono = tonoPetroleo();
  const color = tono.base;
  const pista = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const lazo = Animated.loop(Animated.sequence([
      Animated.timing(pista, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(pista, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    lazo.start();
    return () => lazo.stop();
  }, [pista]);
  const [ancho, setAncho] = useState(0);
  const [listo, setListo] = useState(false);
  const x = useRef(new Animated.Value(0)).current;
  const recorrido = Math.max(0, ancho - PERILLA - MARGEN * 2);
  const recorridoRef = useRef(0);
  const bloqueado = useRef(false);
  const confirmarRef = useRef(onConfirmar);
  useEffect(() => { recorridoRef.current = recorrido; }, [recorrido]);
  useEffect(() => { confirmarRef.current = onConfirmar; }, [onConfirmar]);
  useEffect(() => { bloqueado.current = !!deshabilitado; }, [deshabilitado]);

  const volver = () => Animated.spring(x, { toValue: 0, useNativeDriver: false, friction: 7, tension: 80 }).start();

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !bloqueado.current,
    onMoveShouldSetPanResponder: () => !bloqueado.current,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => x.setValue(Math.min(Math.max(0, g.dx), recorridoRef.current)),
    onPanResponderRelease: (_, g) => {
      const r = recorridoRef.current;
      if (r > 0 && g.dx >= r * 0.85) {
        setListo(true);
        Animated.timing(x, { toValue: r, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(() => {
          confirmarRef.current && confirmarRef.current();
          setTimeout(() => { setListo(false); volver(); }, 450);
        });
      } else volver();
    },
    onPanResponderTerminate: volver,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [x]);

  const opacidadTexto = x.interpolate({ inputRange: [0, Math.max(1, recorrido * 0.6)], outputRange: [1, 0], extrapolate: "clamp" });
  const relleno = x.interpolate({ inputRange: [0, Math.max(1, recorrido)], outputRange: [PERILLA + MARGEN * 2, Math.max(PERILLA + MARGEN * 2, ancho)], extrapolate: "clamp" });

  const empuje = pista.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });
  const brillo = pista.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] });

  return (
    <View
      style={[styles.pista, { backgroundColor: tono.oscuro, borderColor: color }, deshabilitado && { opacity: 0.45 }]}
      onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
      accessibilityLabel={`${etiqueta} ${monto || ""}`}
    >
      <View style={[styles.reflejo, { backgroundColor: tono.claro }]} />
      <Animated.View style={[styles.relleno, { width: relleno, backgroundColor: color }]} />
      <Animated.View style={[styles.textos, { opacity: opacidadTexto }]} pointerEvents="none">
        <Text style={styles.etiqueta} numberOfLines={1}>{etiqueta}</Text>
        {monto ? <Text style={styles.monto} numberOfLines={1} adjustsFontSizeToFit>{monto}</Text> : null}
      </Animated.View>
      <Animated.View style={[styles.guia, { opacity: Animated.multiply(opacidadTexto, brillo), transform: [{ translateX: empuje }] }]} pointerEvents="none">
        <Ionicons name="chevron-forward-outline" size={18} color={tono.claro} />
        <Ionicons name="chevron-forward-outline" size={18} color={tono.claro} style={{ marginLeft: -9 }} />
      </Animated.View>
      <Animated.View style={[styles.perilla, { transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        <View style={[styles.perillaNucleo, { backgroundColor: color }]}>
          <Ionicons name={listo ? "checkmark-outline" : "arrow-forward-outline"} size={22} color="#ffffff" />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = crearEstilos({
  pista: { flex: 1, height: PERILLA + MARGEN * 2, borderRadius: (PERILLA + MARGEN * 2) / 2, justifyContent: "center", overflow: "hidden", borderWidth: 1, elevation: 6, shadowColor: "#0e7490", shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  reflejo: { position: "absolute", left: 0, right: 0, top: 0, height: "46%", opacity: 0.12 },
  relleno: { position: "absolute", left: 0, top: 0, bottom: 0, opacity: 0.55 },
  textos: { position: "absolute", left: PERILLA + MARGEN * 2 + 4, right: 34, alignItems: "center" },
  etiqueta: { fontSize: 10.5, fontWeight: "800", color: "#d9f6fc", textTransform: "uppercase", letterSpacing: 0.9 },
  monto: { fontFamily: "Inter_800ExtraBold", fontSize: 18, color: "#ffffff" },
  guia: { position: "absolute", right: 12, flexDirection: "row", alignItems: "center" },
  perilla: { position: "absolute", left: MARGEN, width: PERILLA, height: PERILLA, borderRadius: PERILLA / 2, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", elevation: 4, padding: 3 },
  perillaNucleo: { flex: 1, alignSelf: "stretch", borderRadius: PERILLA / 2, alignItems: "center", justifyContent: "center" },
});
