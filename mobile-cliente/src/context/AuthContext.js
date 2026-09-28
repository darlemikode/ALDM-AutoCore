import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "../api";
import { olvidarNavegacion } from "../navigation/estadoNavegacion";
import { iniciarActualizacionesGlobales, detenerActualizacionesGlobales } from "../actualizacionesGlobales";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [cliente, setCliente] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    validarSesion();
  }, []);

  async function validarSesion() {
    const token = await getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const perfil = await api.get("/portal-cliente/me");
      setCliente(perfil);
      iniciarActualizacionesGlobales();
    } catch {
      await setToken(null);
    } finally {
      setLoading(false);
    }
  }

  async function activarCuenta(identificador, codigoInvitacion, passwordNueva) {
    const data = await api.post("/portal-cliente/activar", {
      identificador,
      codigo_invitacion: codigoInvitacion,
      password_nueva: passwordNueva,
    });
    await setToken(data.access_token);
    await validarSesion();
  }

  async function login(identificador, password) {
    const data = await api.post("/portal-cliente/login", { identificador, password });
    await setToken(data.access_token);
    await validarSesion();
  }

  async function logout() {
    olvidarNavegacion(); // al volver a entrar se empieza en la pantalla principal
    await setToken(null);
    setCliente(null);
    detenerActualizacionesGlobales();
  }

  return (
    <AuthContext.Provider value={{ cliente, loading, login, activarCuenta, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
