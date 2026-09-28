import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { KeyboardAvoidingView, ScrollView, Keyboard, TextInput } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";

/*
 * ScrollView de formulario que nunca deja un campo tapado por el teclado:
 * - KeyboardAvoidingView con "padding" en Android e iOS (Android edge-to-edge
 *   ya no redimensiona la ventana sola).
 * - Al abrir el teclado o cambiar de campo, desplaza hasta el campo enfocado.
 */
function useAlturaEncabezado() {
  try { return useHeaderHeight(); } catch { return 0; }
}

const FormScroll = forwardRef(function FormScroll({ children, style, contentContainerStyle, offsetExtra = 0, ...rest }, ref) {
  const scroll = useRef(null);
  const altura = useAlturaEncabezado();
  useImperativeHandle(ref, () => scroll.current);

  useEffect(() => {
    let ultimo = null;
    let timer = null;
    const mostrar = (campo) => {
      const sv = scroll.current;
      const contenedor = sv?.getInnerViewRef?.() || sv?.getInnerViewNode?.();
      if (!campo || !sv || !contenedor || !campo.measureLayout) return;
      campo.measureLayout(contenedor, (_x, y) => sv.scrollTo({ y: Math.max(0, y - 110), animated: true }), () => {});
    };
    const revisar = () => {
      const campo = TextInput.State.currentlyFocusedInput?.();
      if (campo && campo !== ultimo) { ultimo = campo; mostrar(campo); }
    };
    const s1 = Keyboard.addListener("keyboardDidShow", () => {
      ultimo = null;
      revisar();
      clearInterval(timer);
      timer = setInterval(revisar, 250);
    });
    const s2 = Keyboard.addListener("keyboardDidHide", () => { clearInterval(timer); ultimo = null; });
    return () => { s1.remove(); s2.remove(); clearInterval(timer); };
  }, []);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={altura + offsetExtra}>
      <ScrollView ref={scroll} style={style} contentContainerStyle={contentContainerStyle} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" {...rest}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
});
export default FormScroll;
