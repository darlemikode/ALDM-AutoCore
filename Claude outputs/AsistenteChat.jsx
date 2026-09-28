import React, { useEffect, useRef, useState } from "react";
import "./AsistenteChat.css";

/**
 * Asistente — panel de consultas rápidas de uso interno.
 * Rediseño en formato chat: chips de acceso rápido + conversación con
 * respuestas simuladas para clientes, estatus de servicios y reportes.
 *
 * Sustituye el fetch() de MOCK_RESPONDER por tus llamadas reales al
 * backend (clientes, servicios, reportes) cuando lo integres.
 */

const QUICK_CHIPS = [
  { label: "Buscar cliente", emoji: "👤", query: "Buscar cliente" },
  { label: "Abiertos", emoji: "🛠️", query: "Servicios abiertos" },
  { label: "Cerrados", emoji: "✅", query: "Servicios cerrados" },
  { label: "Cancelados", emoji: "✕", query: "Servicios cancelados" },
  { label: "Pendientes de pago", emoji: "💳", query: "Pendientes de pago" },
  { label: "Stock bajo", emoji: "📦", query: "Stock bajo" },
  { label: "Próximos a servicio", emoji: "🔔", query: "Próximos a dar servicio" },
  { label: "Deuda proveedores", emoji: "📄", query: "Deuda con proveedores" },
];

const TAG_COLORS = {
  emerald: { background: "rgba(52,211,153,0.15)", color: "#34d399" },
  amber: { background: "rgba(242,185,80,0.15)", color: "#f2b950" },
  teal: { background: "rgba(34,211,199,0.15)", color: "#5be6dc" },
  red: { background: "rgba(255,113,102,0.15)", color: "#ff7166" },
};

// TODO: reemplazar por datos reales (contexto / API) al integrar.
const MOCK_CLIENTS = [
  { name: "Juan Pérez", account: "CTE-1042", phone: "55 2891 0043", tag: "Al corriente", color: "emerald" },
  { name: "María López", account: "CTE-0877", phone: "81 3345 9021", tag: "2 servicios abiertos", color: "teal" },
  { name: "Diego Herrera", account: "CTE-1190", phone: "33 1120 8845", tag: "Pago pendiente", color: "amber" },
];

function ResultCard({ rows }) {
  return (
    <div className="asistente-result-card">
      {rows.map((r, i) => (
        <div className="asistente-result-row" key={i}>
          <div>
            <div className="asistente-rtitle">{r.title}</div>
            <div className="asistente-rsub">{r.subtitle}</div>
          </div>
          <span className="asistente-rtag" style={TAG_COLORS[r.color] || TAG_COLORS.teal}>
            {r.tag}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Genera la respuesta simulada del asistente a partir del texto del usuario.
 * Devuelve un nodo React (texto, o texto + <ResultCard />).
 * Sustituir por la respuesta real del backend cuando se conecte.
 */
function getMockResponse(query) {
  const q = query.toLowerCase();

  if (q.includes("buscar") || MOCK_CLIENTS.some((c) => q.includes(c.name.toLowerCase().split(" ")[0]))) {
    const matches =
      q === "buscar cliente"
        ? MOCK_CLIENTS
        : MOCK_CLIENTS.filter((c) => q.includes(c.name.toLowerCase().split(" ")[0]));
    const list = (matches.length ? matches : MOCK_CLIENTS).slice(0, 3);
    return (
      <>
        Encontré {list.length} coincidencia(s):
        <ResultCard
          rows={list.map((c) => ({
            title: c.name,
            subtitle: `${c.account} · ${c.phone}`,
            tag: c.tag,
            color: c.color,
          }))}
        />
      </>
    );
  }

  if (q.includes("abiert")) {
    return (
      <>
        Servicios <b>abiertos</b> ahora:
        <ResultCard
          rows={[
            { title: "Nissan Versa · HXR-812", subtitle: "Diagnóstico · Juan P.", tag: "En proceso", color: "teal" },
            { title: "VW Jetta · GPT-330", subtitle: "Frenos y suspensión · Marco R.", tag: "Esperando refacción", color: "red" },
          ]}
        />
      </>
    );
  }

  if (q.includes("cerrad")) {
    return (
      <>
        Servicios <b>cerrados</b> hoy:
        <ResultCard
          rows={[{ title: "Chevrolet Aveo · LKM-045", subtitle: "Servicio mayor · Diego H.", tag: "Entregado", color: "emerald" }]}
        />
      </>
    );
  }

  if (q.includes("cancelad")) {
    return (
      <>
        No hay servicios cancelados en los últimos 7 días.
        <span className="asistente-hint">Último cancelado: 12 sep · Kia Rio MXP-221</span>
      </>
    );
  }

  if (q.includes("pago")) {
    return (
      <>
        Cuentas con <b>pago pendiente</b>:
        <ResultCard rows={[{ title: "Diego Herrera", subtitle: "CTE-1190", tag: "$3,480", color: "amber" }]} />
      </>
    );
  }

  if (q.includes("stock")) {
    return (
      <>
        <b>3 piezas</b> con stock crítico: balatas delanteras, filtro de aceite 5W-30 y banda de distribución. ¿Quieres
        que arme la orden de reabastecimiento?
      </>
    );
  }

  if (q.includes("próximos") || q.includes("proximos")) {
    return (
      <>
        <b>4 vehículos</b> próximos a servicio esta semana, según kilometraje registrado.
      </>
    );
  }

  if (q.includes("deuda")) {
    return (
      <>
        Deuda actual con proveedores: <b>$18,240 MXN</b> · 2 proveedores con saldo vencido.
      </>
    );
  }

  return "No tengo un resultado exacto para eso todavía. Prueba con el nombre de un cliente, un estatus de servicio o el nombre de un reporte — o usa un acceso rápido de arriba.";
}

export default function AsistenteChat() {
  const [messages, setMessages] = useState([
    {
      role: "bot",
      content: (
        <>
          Hola, soy el asistente interno. Pregúntame por un cliente, el estatus de servicios o un reporte — o usa los
          accesos rápidos de arriba.
          <span className="asistente-hint">Ej. "buscar Juan Pérez" · "servicios cerrados hoy" · "stock bajo"</span>
        </>
      ),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const threadRef = useRef(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, typing]);

  function handleSend(rawText) {
    const query = (rawText ?? input).trim();
    if (!query) return;

    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setInput("");
    setTyping(true);

    const delay = 420 + Math.random() * 380;
    setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { role: "bot", content: getMockResponse(query) }]);
    }, delay);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleSend();
  }

  return (
    <div className="asistente-page">
      <div className="asistente-top">
        <span className="asistente-top-ico">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#04201d" strokeWidth="2.4">
            <path d="M21 11.5a8.5 8.5 0 0 1-11.8 7.8L3 21l1.7-6.2A8.5 8.5 0 1 1 21 11.5z" />
          </svg>
        </span>
        <div>
          <h1>Asistente</h1>
          <p className="asistente-top-sub">Consultas rápidas de uso interno</p>
        </div>
        <span className="asistente-status-dot">
          <span className="asistente-pulse" /> En línea
        </span>
      </div>

      <div className="asistente-panel">
        <div className="asistente-chips-bar">
          {QUICK_CHIPS.map((chip) => (
            <button key={chip.query} className="asistente-chip" onClick={() => handleSend(chip.query)} type="button">
              <span className="asistente-em">{chip.emoji}</span> {chip.label}
            </button>
          ))}
        </div>

        <div className="asistente-thread" ref={threadRef}>
          {messages.map((m, i) => (
            <div className={`asistente-msg ${m.role}`} key={i}>
              <span className={`asistente-avatar ${m.role}`}>{m.role === "bot" ? "A" : "Tú"[0]}</span>
              <div className="asistente-bubble">{m.content}</div>
            </div>
          ))}
          {typing && (
            <div className="asistente-msg bot">
              <span className="asistente-avatar bot">A</span>
              <div className="asistente-bubble">
                <div className="asistente-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="asistente-composer">
          <div className="asistente-input-row">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu consulta… (nombre, cuenta, teléfono o reporte)"
              autoComplete="off"
            />
            <button className="asistente-send-btn" onClick={() => handleSend()} aria-label="Enviar" type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          <p className="asistente-composer-hint">
            Presiona <kbd>Enter</kbd> para enviar
          </p>
        </div>
      </div>
    </div>
  );
}
