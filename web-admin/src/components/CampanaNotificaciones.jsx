// Campanita de avisos — mismo origen de datos que la app móvil
// (/api/notificaciones, ver notificaciones.py en el backend): mensajes y
// alertas del chat del cliente, y solicitudes de recuperación de
// contraseña, que antes solo se veían si alguien ya tenía esa orden
// abierta o recargaba la página.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icono } from "./Icono";
import { suscribirNotificaciones, cargarNotificaciones, marcarNotificacionesVistas } from "../notificaciones";

function hace(fechaISO) {
  const ms = Date.now() - new Date(fechaISO).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(fechaISO).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export default function CampanaNotificaciones({ grande = false }) {
  const navigate = useNavigate();
  const [conteo, setConteo] = useState(0);
  const [lista, setLista] = useState([]);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => suscribirNotificaciones(({ conteo, lista }) => { setConteo(conteo); setLista(lista); }), []);

  function alternar() {
    if (!abierta) cargarNotificaciones();
    setAbierta((v) => !v);
  }

  function cerrarYMarcarVistas() {
    setAbierta(false);
    marcarNotificacionesVistas();
  }

  function irA(n) {
    setAbierta(false);
    marcarNotificacionesVistas();
    if (n.id_servicio) navigate(`/servicios/${n.id_servicio}`);
    else if (n.tipo === "recuperacion_password") navigate("/usuarios");
    else if (n.tipo === "solicitud_demo") navigate("/superadmin/solicitudes");
  }

  return (
    <div className={"campana-wrap" + (grande ? " campana-wrap-grande" : "")}>
      <button type="button" className={"campana-boton" + (grande ? " campana-boton-grande" : "")} onClick={alternar} title="Notificaciones">
        <Icono nombre="notifications" size={grande ? 24 : 18} />
        {conteo > 0 && <span className={"campana-punto" + (grande ? " campana-punto-grande" : "")}>{conteo > 9 ? "9+" : conteo}</span>}
      </button>
      {abierta && (
        <>
          <div className="campana-velo" onClick={cerrarYMarcarVistas} />
          <div className="campana-hoja">
            <div className="campana-encabezado">
              <span>Notificaciones</span>
              <button type="button" className="campana-cerrar" onClick={cerrarYMarcarVistas}><Icono nombre="close" size={16} /></button>
            </div>
            <div className="campana-lista">
              {lista.length === 0 ? (
                <div className="campana-vacio">No hay notificaciones todavía.</div>
              ) : (
                lista.map((n) => (
                  <div
                    key={n.id_notificacion}
                    className={"campana-fila" + (!n.leida ? " no-leida" : "") + (n.id_servicio || n.tipo === "recuperacion_password" || n.tipo === "solicitud_demo" ? " clicable" : "")}
                    onClick={() => irA(n)}
                  >
                    <Icono nombre={n.tipo === "recuperacion_password" ? "key" : n.tipo === "solicitud_demo" ? "people" : "chatbubble"} size={16} />
                    <div className="campana-fila-texto">
                      <div className="campana-fila-titulo">{n.titulo}</div>
                      {n.mensaje && <div className="campana-fila-mensaje">{n.mensaje}</div>}
                      <div className="campana-fila-fecha">{hace(n.fecha)}</div>
                    </div>
                    {!n.leida && <span className="campana-punto-fila" />}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
