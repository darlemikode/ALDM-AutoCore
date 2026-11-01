import { useEffect, useRef, useState } from "react";
import { conCola, leerCache, guardarCache, norm } from "./ImagenModelo";

// Logo de una marca de refacciones (Bosch, Brembo, NGK…): el que subió el taller (/uploads) o, si no hay,
// el logo sugerido de Wikipedia/Wikimedia, solo si la página es de una empresa/fabricante relacionada.
const ES_EMPRESA = /\b(company|manufacturer|manufacturing|corporation|brand|supplier|maker|producer|engineering|technology|automotive|auto parts|lubricant|lubricants|tire|tyre|tires|battery|batteries|filter|filters|brake|brakes|spark plug|motor oil|oil|industrial|conglomerate|group)\b/i;
const NO_ES_EMPRESA = /(film|album|band|song|novel|footballer|politician|singer|actor|village|town|city of|district|municipality|river|mountain|church|castle|stadium|hotel|building|headquarters|album|television|series|video game)/i;
const ES_LOGO = /(logo|wordmark|logotype|logotipo|brand|emblem|symbol|\.svg)/i;  // el archivo debe llamarse como un logo
const NO_ES_LOGO = /(building|headquarters|hq|factory|plant|campus|office|tower|store|shop|museum|map|flag|coat_of_arms|diagram|plan|photo|plant|warehouse|exterior|facade)/i;

function esEmpresaDeMarca(pagina, marca) {
  const desc = pagina?.pageprops?.["wikibase-shortdesc"] || "";
  const src = pagina?.thumbnail?.source || "";
  const archivo = decodeURIComponent(src).split("/").filter(Boolean).slice(-2).join("/");
  if (!src || !ES_LOGO.test(archivo) || NO_ES_LOGO.test(archivo)) return false;
  if (!ES_EMPRESA.test(desc) || NO_ES_EMPRESA.test(desc)) return false;
  const m = norm(marca);
  const t = norm(pagina.title);
  return !!m && (t.startsWith(m) || m.startsWith(t));  // el título es la marca misma (Bosch, Robert Bosch GmbH…)
}

async function buscarLogo(marca) {
  const q = encodeURIComponent(`${marca} company`);
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=5&gsrsearch=${q}&prop=pageimages|pageprops&ppprop=wikibase-shortdesc&piprop=thumbnail&pithumbsize=300`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const paginas = Object.values(j?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return paginas.find((p) => esEmpresaDeMarca(p, marca))?.thumbnail?.source || null;
}

export default function ImagenMarca({ marca, imagen, size, onAbrir }) {
  const caja = useRef(null);
  const clave = `marca-ref|${marca}`.toLowerCase();
  const [url, setUrl] = useState(() => (imagen ? `/uploads/${imagen}` : leerCache(clave) || null));
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    setFallo(false);
    if (imagen) { setUrl(`/uploads/${imagen}`); return undefined; }
    const guardada = leerCache(clave);
    if (guardada !== undefined) { setUrl(guardada); return undefined; }
    setUrl(null);
    let vivo = true;
    const el = caja.current;
    const buscar = () => conCola(() => buscarLogo(marca)).then((u) => { guardarCache(clave, u); if (vivo) setUrl(u); }).catch(() => {});
    if (!el || typeof IntersectionObserver === "undefined") { buscar(); return () => { vivo = false; }; }
    const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting) { obs.disconnect(); buscar(); } }, { rootMargin: "120px" });
    obs.observe(el);
    return () => { vivo = false; obs.disconnect(); };
  }, [clave, imagen, marca]);

  const hay = url && !fallo;
  return (
    <span ref={caja} className={"img-modelo img-marca" + (hay && onAbrir ? " clicable" : "")} style={size ? { width: size, height: size } : undefined}
      title={hay && onAbrir ? "Clic para ver la imagen" : undefined}
      onClick={hay && onAbrir ? (e) => { e.stopPropagation(); onAbrir({ url: url.replace(/\/\d+px-/, "/600px-"), respaldo: url, titulo: marca }); } : undefined}>
      {hay
        ? <img src={url} alt={marca} loading="lazy" onError={() => setFallo(true)} />
        : <span className="cat-marca-inicial" style={size ? { fontSize: size * 0.45 } : undefined}>{String(marca || "?").trim().charAt(0).toUpperCase()}</span>}
    </span>
  );
}
