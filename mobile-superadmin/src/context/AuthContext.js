import { registrarPush } from "../push";
import { createContext, useContext, useEffect, useState } from "react";
import { api, cargarServidor, getToken, login as apiLogin, onSesionExpirada, setToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  async function logout() {
    await setToken(null);
    setUsuario(null);
  }

  useEffect(() => {
    onSesionExpirada(() => logout());
    (async () => {
      await cargarServidor();
      try {
        if (await getToken()) {
          const me = await api.get("/auth/me");
          if (me.es_superadmin) { setUsuario(me); registrarPush(); }
          else await setToken(null);
        }
      } catch {
        await setToken(null);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  async function login(username, password) {
    await apiLogin(username, password);
    setUsuario(await api.get("/auth/me"));
    registrarPush();
  }

  return <AuthContext.Provider value={{ usuario, cargando, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
