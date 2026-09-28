import { useEffect, useRef, useState } from "react";
import { api, getToken } from "../api";
import { useUI } from "../context/UIContext";

/**
 * Chat en vivo de una orden de servicio — mismo canal que usa la app de
 * clientes. Mensajes por WebSocket al instante; enviar sigue siendo un POST.
 * Admite fotos: botón 📷, pegar una imagen (Ctrl+V) o arrastrarla al chat.
 */
function hora(fecha) {
  return new Date(fecha).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function dia(fecha) {
  const d = new Date(fecha);
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

function iniciales(nombre) {
  return (nombre || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export default function ChatOrden({ servicioId, nombreCliente }) {
  const { notify } = useUI();
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");
  const [conectado, setConectado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [fotoGrande, setFotoGrande] = useState(null);
  const finRef = useRef(null);
  const archivoRef = useRef(null);

  useEffect(() => {
    api.get(`/servicios/${servicioId}/chat/mensajes`).then(setMensajes).catch(() => setMensajes([]));
  }, [servicioId]);

  useEffect(() => {
    const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocolo}//${window.location.host}/api/ws/servicio/${servicioId}?token=${getToken()}`);
    socket.onopen = () => setConectado(true);
    socket.onclose = () => setConectado(false);
    socket.onerror = () => setConectado(false);
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.tipo === "chat") {
          setMensajes((prev) => (prev.some((m) => m.id_mensaje === data.id_mensaje) ? prev : [...prev, {
            id_mensaje: data.id_mensaje, autor_tipo: data.autor_tipo, autor_nombre: data.autor_nombre,
            tipo: data.mensaje_tipo, texto: data.texto, ruta_foto: data.ruta_foto, fecha: data.fecha,
          }]));
        }
      } catch {
        /* mensaje no reconocido */
      }
    };
    return () => socket.close();
  }, [servicioId]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes]);

  async function enviar() {
    const contenido = texto.trim();
    if (!contenido) return;
    setTexto("");
    try {
      await api.post(`/servicios/${servicioId}/chat/mensajes`, { texto: contenido, tipo: "mensaje" });
    } catch (err) {
      setTexto(contenido);
      notify(err.message, "error");
    }
  }

  async function enviarFotos(archivos) {
    const imagenes = [...archivos].filter((a) => a.type.startsWith("image/"));
    if (imagenes.length === 0) return;
    setSubiendo(true);
    const pie = texto.trim();
    try {
      for (const [i, archivo] of imagenes.entries()) {
        const fd = new FormData();
        fd.append("archivo", archivo);
        if (pie && i === 0) fd.append("texto", pie);
        await api.postForm(`/servicios/${servicioId}/chat/foto`, fd);
      }
      if (pie) setTexto("");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setSubiendo(false);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  }

  function alPegar(e) {
    const archivos = [...(e.clipboardData?.files || [])];
    if (archivos.some((a) => a.type.startsWith("image/"))) {
      e.preventDefault();
      enviarFotos(archivos);
    }
  }

  let diaAnterior = null;

  return (
    <div
      className={`chat-orden ${arrastrando ? "arrastrando" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => { e.preventDefault(); setArrastrando(false); enviarFotos(e.dataTransfer.files); }}
    >
      <div className="chat-orden-estado">
        <span className="chat-orden-avatar">{iniciales(nombreCliente)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="chat-orden-nombre">{nombreCliente || "Cliente"}</div>
          <div className={`chat-orden-conexion ${conectado ? "on" : ""}`}>
            <span /> {conectado ? "Conectado en vivo" : "Conectando…"}
          </div>
        </div>
      </div>

      <div className="chat-orden-mensajes">
        {mensajes.length === 0 && (
          <div className="chat-orden-vacio">
            <div style={{ fontSize: 34 }}>💬</div>
            Aún no hay mensajes. Escribe al cliente o mándale una foto del avance.
          </div>
        )}
        {mensajes.map((m, i) => {
          const d = dia(m.fecha);
          const separador = d !== diaAnterior;
          diaAnterior = d;
          const mio = m.autor_tipo === "taller";
          return (
            <div key={m.id_mensaje || i}>
              {separador && <div className="chat-orden-dia"><span>{d}</span></div>}
              <div className={`chat-burbuja ${mio ? "mia" : "suya"} ${m.tipo === "alerta" ? "alerta" : ""}`}>
                {!mio && <div className="chat-burbuja-autor">{m.autor_nombre || "Cliente"}</div>}
                {m.tipo === "alerta" && <div className="chat-burbuja-alerta">🚨 Aviso urgente</div>}
                {m.ruta_foto && (
                  <button type="button" className="chat-burbuja-foto" onClick={() => setFotoGrande(`/uploads/${m.ruta_foto}`)} title="Ver foto completa">
                    <img src={`/uploads/${m.ruta_foto}`} alt={m.texto || "Foto"} loading="lazy" />
                  </button>
                )}
                {!(m.ruta_foto && m.texto === "📷 Foto") && <div className="chat-burbuja-texto">{m.texto}</div>}
                <div className="chat-burbuja-hora">{hora(m.fecha)}</div>
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      <div className="chat-orden-escribir">
        <input ref={archivoRef} type="file" accept="image/*" multiple hidden onChange={(e) => enviarFotos(e.target.files)} />
        <button type="button" className="icon-btn" onClick={() => archivoRef.current?.click()} disabled={subiendo} title="Enviar fotos (también puedes pegarlas o arrastrarlas aquí)">
          {subiendo ? "⏳" : "📷"}
        </button>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          onPaste={alPegar}
          placeholder="Escribe un mensaje…"
          rows={1}
        />
        <button type="button" className="chat-orden-enviar" onClick={enviar} disabled={!texto.trim()} title="Enviar mensaje (Enter)">
          ➤
        </button>
      </div>

      {arrastrando && <div className="chat-orden-soltar">📷 Suelta la foto para enviarla</div>}

      {fotoGrande && (
        <div className="chat-foto-grande" onClick={() => setFotoGrande(null)} title="Cerrar">
          <img src={fotoGrande} alt="Foto del chat" />
        </div>
      )}
    </div>
  );
}
