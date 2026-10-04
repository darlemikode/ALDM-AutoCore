import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ModalPortal from "./ModalPortal";
import { marcarCampo } from "../validacion";
import {
  atajosActivos, escucharAtajos, setSidebarCompacta, setTemaOscuro,
  sidebarCompactaActiva, temaOscuroActivo,
} from "../preferencias";

const RUTAS = {
  KeyP: "/", KeyO: "/servicios", KeyC: "/clientes", KeyV: "/vehiculos", KeyT: "/cotizaciones",
  KeyF: "/facturacion", KeyR: "/refacciones", KeyI: "/inventario", KeyA: "/citas", KeyB: "/asistente",
};

export const ATAJOS = [
  { grupo: "Ir a", items: [
    ["Alt + P", "Panel"], ["Alt + O", "Órdenes de servicio"], ["Alt + C", "Clientes"], ["Alt + V", "Vehículos"],
    ["Alt + T", "Cotizaciones"], ["Alt + F", "Facturación"], ["Alt + R", "Refacciones"], ["Alt + I", "Inventario"],
    ["Alt + A", "Citas solicitadas"], ["Alt + B", "Asistente (chat del mecánico)"],
  ] },
  { grupo: "Acciones", items: [
    ["Alt + N", "Nuevo (orden, cliente, vehículo, refacción… según la pantalla)"],
    ["Alt + S  ó  /", "Ir a la barra de búsqueda"], ["Alt + M", "Mostrar u ocultar el menú lateral"],
    ["Alt + L", "Cambiar tema claro / oscuro"], ["Alt + ?", "Ver la lista de atajos"],
  ] },
  { grupo: "Órdenes y ventanas", items: [
    ["Esc", "Cerrar ventana o lista"], ["Enter", "Aceptar / elegir"], ["↑  ↓", "Moverse en listas y buscadores"],
    ["Alt + G", "Finalizar y generar nota (orden abierta)"], ["Alt + D", "Descargar recibo (orden cerrada)"],
  ] },
];

export function ListaAtajos() {
  return (
    <div className="atajos-grid">
      {ATAJOS.map((g) => (
        <div key={g.grupo} className="atajos-grupo">
          <div className="cat-grupo-titulo">{g.grupo}</div>
          {g.items.map(([teclas, desc]) => (
            <div key={teclas} className="atajo-fila">
              <span className="atajo-teclas">{teclas.split(/\s*\+\s*/).map((t, i) => <kbd key={i}>{t.trim()}</kbd>)}</span>
              <span className="atajo-desc">{desc}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function visible(el) { return !!el && el.offsetParent !== null && !el.disabled; }
function botonConTexto(texto) {
  return [...document.querySelectorAll("button")].find((b) => visible(b) && b.textContent.includes(texto));
}

export default function Atajos() {
  const navigate = useNavigate();
  const [activo, setActivo] = useState(atajosActivos);
  const [ayuda, setAyuda] = useState(false);

  useEffect(() => escucharAtajos(() => setActivo(atajosActivos())), []);

  // Validación visible: el aviso nativo del navegador casi no se ve, así que
  // se marca el campo en rojo con su mensaje y se enfoca el primero.
  useEffect(() => {
    function invalido(e) {
      e.preventDefault();
      const el = e.target;
      const campo = el.closest(".field") || el.parentElement;
      const visible = el.classList.contains("combo-requerido") ? campo?.querySelector("input:not(.combo-requerido)") : el;
      marcarCampo(visible || el, el.validity?.valueMissing ? "Este campo es obligatorio" : (el.validationMessage || "Dato no válido"));
    }
    document.addEventListener("invalid", invalido, true);
    return () => document.removeEventListener("invalid", invalido, true);
  }, []);

  // Esc = cancelar y Enter = guardar en todas las ventanas (siempre activo).
  useEffect(() => {
    function onKey(e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (e.key !== "Escape" && e.key !== "Enter") return;
      if (document.querySelector(".combo-lista, .buscador-lista")) return; // la lista abierta maneja su propia tecla
      const modales = document.querySelectorAll(".modal-backdrop");
      const modal = modales[modales.length - 1];
      const el = e.target;
      const tag = (el?.tagName || "").toLowerCase();
      if (e.key === "Escape") {
        if (modal) {
          const cancelar = [...modal.querySelectorAll(".modal-actions button")]
            .find((b) => !b.disabled && !/btn-(primary|danger)/.test(b.className));
          e.preventDefault();
          if (cancelar) cancelar.click(); else modal.click();
        } else if (tag === "input" || tag === "textarea" || tag === "select") {
          el.blur();
        } else if (window.location.pathname.split("/").filter(Boolean).length >= 2) {
          navigate(-1);
        }
        return;
      }
      // Enter: guardar/aceptar
      if (!modal || tag === "textarea" || tag === "button" || tag === "a" || tag === "select") return;
      if (el.closest && el.closest("form")) return; // el formulario ya se envía solo
      const ok = modal.querySelector(".modal-actions .btn-primary:not([disabled])");
      if (ok) { e.preventDefault(); ok.click(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate]);

  useEffect(() => {
    if (!activo) return undefined;
    function onKey(e) {
      if (e.ctrlKey || e.metaKey) return;
      const tag = (e.target?.tagName || "").toLowerCase();
      const escribiendo = tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable;

      if (e.key === "Escape" && ayuda) { setAyuda(false); return; }

      if (!e.altKey) {
        if (e.key === "/" && !escribiendo) {
          const b = document.querySelector("input.search-input, input[type=search]");
          if (b) { e.preventDefault(); b.focus(); }
        }
        return;
      }
      let usado = true;
      if (RUTAS[e.code]) navigate(RUTAS[e.code]);
      else if (e.code === "KeyN") {
        const b = [...document.querySelectorAll(".btn-nuevo, .btn-agregar")].find(visible);
        if (b) b.click(); else usado = false;
      } else if (e.code === "KeyS") {
        const b = document.querySelector("input.search-input, input[type=search]");
        if (b) { b.focus(); b.select?.(); } else usado = false;
      } else if (e.code === "KeyM") setSidebarCompacta(!sidebarCompactaActiva());
      else if (e.code === "KeyL") setTemaOscuro(!temaOscuroActivo());
      else if (e.code === "Slash" || e.key === "?") setAyuda((v) => !v);
      else if (e.code === "KeyG") {
        const b = botonConTexto("Finalizar y generar nota");
        if (b) b.click(); else usado = false;
      } else if (e.code === "KeyD") {
        const b = botonConTexto("Descargar recibo");
        if (b) b.click(); else usado = false;
      } else usado = false;
      if (usado) e.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activo, ayuda, navigate]);

  if (!activo || !ayuda) return null;
  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setAyuda(false)}>
        <div className="modal" style={{ maxWidth: 720 }}>
          <h2 style={{ fontSize: 22, marginTop: 0 }}>Atajos de teclado</h2>
          <ListaAtajos />
          <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setAyuda(false)}>Cerrar (Esc)</button></div>
        </div>
      </div>
    </ModalPortal>
  );
}
