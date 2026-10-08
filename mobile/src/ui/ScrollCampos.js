import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ScrollView, Keyboard, TextInput } from "react-native";

/*
 * ScrollView para formularios y hojas sin KeyboardAvoidingView: al escribir,
 * deja el campo enfocado (con su etiqueta arriba) visible por encima del
 * teclado. Agrega al final el alto del teclado para que siempre haya hasta
 * dónde desplazar.
 */
const ScrollCampos = forwardRef(function ScrollCampos({ children, contentContainerStyle, ...rest }, ref) {
  const scroll = useRef(null);
  const [tecladoAlto, setTecladoAlto] = useState(0);
  useImperativeHandle(ref, () => scroll.current);

  useEffect(() => {
    let ultimo = null;
    let timer = null;
    const mostrar = (campo) => {
      const sv = scroll.current;
      const contenedor = sv?.getInnerViewRef?.() || sv?.getInnerViewNode?.();
      if (!campo || !sv || !contenedor || !campo.measureLayout) return;
      // si el campo no pertenece a este scroll, measureLayout falla en silencio
      campo.measureLayout(contenedor, (_x, y) => sv.scrollTo({ y: Math.max(0, y - 110), animated: true }), () => {});
    };
    const revisar = () => {
      const campo = TextInput.State.currentlyFocusedInput?.();
      if (campo && campo !== ultimo) { ultimo = campo; mostrar(campo); }
    };
    const s1 = Keyboard.addListener("keyboardDidShow", (e) => {
      setTecladoAlto(e?.endCoordinates?.height || 0);
      ultimo = null;
      setTimeout(revisar, 60);
      clearInterval(timer);
      timer = setInterval(revisar, 250);
    });
    const s2 = Keyboard.addListener("keyboardDidHide", () => { clearInterval(timer); ultimo = null; setTecladoAlto(0); });
    return () => { s1.remove(); s2.remove(); clearInterval(timer); };
  }, []);

  const base = Array.isArray(contentContainerStyle) ? Object.assign({}, ...contentContainerStyle) : (contentContainerStyle || {});
  return (
    <ScrollView
      ref={scroll}
      keyboardShouldPersistTaps="handled"
      {...rest}
      contentContainerStyle={{ ...base, paddingBottom: (base.paddingBottom ?? base.padding ?? 0) + tecladoAlto }}
    >
      {children}
    </ScrollView>
  );
});
export default ScrollCampos;
