import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { aplicarPaleta } from "../theme";

// Preferencia de tema: "sistema" (sigue al celular), "claro" u "oscuro".
// Equivale al interruptor de tema de la barra lateral de la web.
const LLAVE = "sm_tema_preferencia";

const TemaContext = createContext({ preferencia: "sistema", tema: "claro", cambiarPreferencia: () => {} });

export function TemaProvider({ children }) {
  const esquemaSistema = useColorScheme();
  const [preferencia, setPreferencia] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(LLAVE)
      .then((v) => setPreferencia(v === "claro" || v === "oscuro" ? v : "sistema"))
      .catch(() => setPreferencia("sistema"));
  }, []);

  const cambiarPreferencia = useCallback((valor) => {
    setPreferencia(valor);
    AsyncStorage.setItem(LLAVE, valor).catch(() => {});
  }, []);

  const tema = preferencia === "oscuro" || (preferencia === "sistema" && esquemaSistema === "dark") ? "oscuro" : "claro";
  // Se aplica durante el render (antes que los hijos) para que todos los
  // estilos que se calculen en esta pasada ya usen la paleta correcta.
  aplicarPaleta(tema);

  if (preferencia === null) return null;

  return (
    <TemaContext.Provider value={{ preferencia, tema, cambiarPreferencia }}>
      {children}
    </TemaContext.Provider>
  );
}

export function useTema() {
  return useContext(TemaContext);
}
