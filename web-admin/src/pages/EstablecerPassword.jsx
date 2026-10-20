import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import logoAldm from "../assets/logo-aldm.png";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { Icono } from "../components/Icono";
import { validarPassword } from "../validarPassword";

// Pantalla a la que llega el enlace que se manda por correo: tanto para
// "crea tu contraseña" (alta de usuario) como para "olvidé mi contraseña"
// (self-service) — el texto cambia según el tipo que diga el token.
export default function EstablecerPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const { entrarConToken } = useAuth();

  const [estado, setEstado] = useState("verificando"); // verificando | valido | invalido | listo
  const [info, setInfo] = useState(null);
  const [username, setUsername] = useState("");
  const [usernameEstado, setUsernameEstado] = useState(null); // null | "checando" | "disponible" | "ocupado" | "invalido"
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [ver, setVer] = useState({ n: false, c: false });
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!token) {
      setEstado("invalido");
      return;
    }
    api.get(`/auth/password/validar?token=${encodeURIComponent(token)}`)
      .then((res) => {
        setInfo(res);
        if (res.tipo === "setup") setUsername(res.username || "");
        setEstado(res.valido ? "valido" : "invalido");
      })
      .catch(() => setEstado("invalido"));
  }, [token]);

  // Valida en vivo, mientras se escribe, que el nombre de usuario no exista.
  useEffect(() => {
    if (info?.tipo !== "setup") return;
    const limpio = username.trim();
    if (limpio.length < 3 || limpio.includes(" ")) {
      setUsernameEstado(limpio ? "invalido" : null);
      return;
    }
    setUsernameEstado("checando");
    const t = setTimeout(() => {
      api.get(`/auth/username-disponible?username=${encodeURIComponent(limpio)}`)
        .then((res) => setUsernameEstado(res.disponible ? "disponible" : "ocupado"))
        .catch(() => setUsernameEstado(null));
    }, 400);
    return () => clearTimeout(t);
  }, [username, info]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (esAlta && usernameEstado !== "disponible") {
      setError("Escribe un nombre de usuario disponible.");
      return;
    }
    if (!reglas.every((r) => r.ok)) {
      setError("La contraseña no cumple los requisitos.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setCargando(true);
    try {
      const data = await api.post("/auth/password/establecer", {
        token, password_nueva: password,
        ...(esAlta ? { username: username.trim() } : {}),
      });
      await entrarConToken(data.access_token);
      setEstado("listo");
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  const esAlta = info?.tipo === "setup";
  const reglas = validarPassword(password, [esAlta ? username : info?.username]);

  return (
    <div className="login-screen">
      <aside className="login-aside">
        <img src={logoAldm} alt="ALDM AutoCore · Administración de talleres mecánicos" className="login-logo" />
        <h1 className="login-aside-titulo">
          Todo tu taller,<br />
          <span>en un solo lugar</span>
        </h1>
        <p className="login-aside-sub">Órdenes, clientes, inventario y facturación sobre la misma información — sin pagar por usuario.</p>
        <div className="login-aside-pie">Administración de talleres mecánicos</div>
      </aside>

      <div className="login-main">
        <img src={logoAldm} alt="ALDM AutoCore · Administración de talleres mecánicos" className="login-logo-movil" />
        <div className="login-card">
          <div className="brand">{esAlta ? "Crea tu contraseña" : "Restablece tu contraseña"}</div>

          {estado === "verificando" && <div className="recovery-msg">Un momento…</div>}

          {estado === "invalido" && (
            <>
              <div className="recovery-msg">
                Este enlace ya no es válido — venció o ya se usó. Pide uno nuevo desde "¿Olvidaste tu contraseña?".
              </div>
              <Link to="/login" className="btn-link">← Volver a iniciar sesión</Link>
            </>
          )}

          {estado === "valido" && (
            <>
              <div className="tagline">{esAlta ? "Elige tu nombre de usuario y tu nueva contraseña." : `Hola ${info?.username}, escribe tu nueva contraseña.`}</div>
              <form onSubmit={handleSubmit}>
                <div className="field-stack">
                  {esAlta && (
                    <div className="field">
                      <label>Nombre de usuario</label>
                      <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
                      {usernameEstado === "checando" && <div className="field-hint">Checando disponibilidad…</div>}
                      {usernameEstado === "disponible" && <div className="field-hint" style={{ color: "#1a9d4f" }}>Disponible</div>}
                      {usernameEstado === "ocupado" && <div className="field-hint" style={{ color: "#e10600" }}>Ese nombre de usuario ya está ocupado.</div>}
                      {usernameEstado === "invalido" && <div className="field-hint" style={{ color: "#e10600" }}>Al menos 3 caracteres, sin espacios.</div>}
                    </div>
                  )}
                  <div className="field">
                    <label>Nueva contraseña</label>
                    <div className="pass-caja">
                      <input
                        type={ver.n ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoFocus={!esAlta}
                      />
                      <button
                        type="button"
                        className={"pass-ojo" + (ver.n ? " activo" : "")}
                        aria-pressed={ver.n}
                        aria-label={ver.n ? "Ocultar contraseña" : "Ver contraseña"}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setVer((v) => ({ ...v, n: !v.n }))}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" />{!ver.n && <path d="M3 3l18 18" />}
                        </svg>
                      </button>
                    </div>
                    {password && (
                      <ul className="password-checklist">
                        {reglas.map((r) => (
                          <li key={r.clave} className={r.ok ? "ok" : ""}>
                            <Icono nombre={r.ok ? "check-circle" : "x-circle"} size={14} />
                            {r.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="field">
                    <label>Confirmar contraseña</label>
                    <div className="pass-caja">
                      <input
                        type={ver.c ? "text" : "password"}
                        value={confirmar}
                        onChange={(e) => setConfirmar(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className={"pass-ojo" + (ver.c ? " activo" : "")}
                        aria-pressed={ver.c}
                        aria-label={ver.c ? "Ocultar contraseña" : "Ver contraseña"}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setVer((v) => ({ ...v, c: !v.c }))}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" />{!ver.c && <path d="M3 3l18 18" />}
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                {error && <div className="error-text">{error}</div>}
                <button className="btn btn-entrar" style={{ width: "100%" }} disabled={cargando || (esAlta && usernameEstado !== "disponible") || !reglas.every((r) => r.ok) || password !== confirmar}>
                  {cargando ? (
                    "Guardando…"
                  ) : (
                    <>
                      {esAlta ? "Crear mi contraseña y entrar" : "Cambiar contraseña y entrar"}
                      <Icono nombre="log-out" size={18} className="btn-entrar-ico" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
