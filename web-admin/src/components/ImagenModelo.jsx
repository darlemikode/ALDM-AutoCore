import { useEffect, useRef, useState } from "react";
import LogoMarca from "./LogoMarca";

// Foto del modelo: primero la que subió el taller (/uploads); si no hay, una imagen sugerida de
// Wikipedia/Wikimedia (licencia libre) que se busca solo al verse y se guarda en caché; si tampoco,
// el logo de la marca.
const CACHE = new Map();
const PREFIJO = "img-modelo3:"; // v2: descarta las sugerencias anteriores (algunas no eran autos)
function leerCache(k) {
  if (CACHE.has(k)) return CACHE.get(k);
  try { const v = localStorage.getItem(PREFIJO + k); if (v !== null) { CACHE.set(k, v || null); return v || null; } } catch { /* sin almacenamiento */ }
  return undefined;
}
function guardarCache(k, v) {
  CACHE.set(k, v);
  try { localStorage.setItem(PREFIJO + k, v || ""); } catch { /* sin almacenamiento */ }
}

// ---- Validador: solo se aceptan páginas que Wikipedia describe como vehículo ----
const ES_VEHICULO = /\b(car|cars|automobile|automobiles|motor vehicle|vehicle|suv|crossover|sedan|saloon|hatchback|coupe|coupé|convertible|roadster|pickup|pick-up|pickup truck|truck|van|minivan|minibus|station wagon|supercar|sports car|hypercar|limousine|mpv|microcar|kei car|city car|subcompact car|compact car)\b/i;
const NO_ES_VEHICULO = /(building|house|mansion|palace|hall|real estate|estate in|skyscraper|tower|residential|office|complex|hospital|museum|theatre|theater|cathedral|church|castle|monument|bridge|village|town|city of|district|municipality|river|mountain|station|stadium|hotel|company|manufacturer|corporation|brand|marque|band|album|film|song|novel|footballer|politician|singer|actor|airport|school|university|highway|road|street|racing team|motorcycle|bicycle)/i;
const IMAGEN_NO_VALIDA = /(\.svg|logo|map|flag|coat_of_arms|diagram|plan|interior|engine|badge|emblem|building|hall|house|church|tower|headquarters|factory|plant|museum|dealership|showroom)/i;
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const ALIAS = { vw: "volkswagen", chevy: "chevrolet", mercedes: "mercedesbenz" };

function esPaginaDeAuto(pagina, marca) {
  const desc = pagina?.pageprops?.["wikibase-shortdesc"] || "";
  const src = pagina?.thumbnail?.source || "";
  if (!src || IMAGEN_NO_VALIDA.test(decodeURIComponent(src).split("/").pop() || "")) return false;
  if (!ES_VEHICULO.test(desc) || NO_ES_VEHICULO.test(desc)) return false;
  const m = ALIAS[norm(marca)] || norm(marca);
  return !m || norm(pagina.title).includes(m);  // el título debe llevar la marca (Nissan Versa, BMW 3 Series…)
}

// Cola con tope de peticiones simultáneas: no saturar al abrir un catálogo largo
let activas = 0;
const espera = [];
function conCola(tarea) {
  return new Promise((resolver, rechazar) => {
    const correr = () => { activas += 1; tarea().then(resolver, rechazar).finally(() => { activas -= 1; if (espera.length) espera.shift()(); }); };
    if (activas < 3) correr(); else espera.push(correr);
  });
}

async function buscarWikipedia(marca, modelo) {
  const q = encodeURIComponent(`${marca} ${modelo} car`);
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=5&gsrsearch=${q}&prop=pageimages|pageprops&ppprop=wikibase-shortdesc&piprop=thumbnail&pithumbsize=360`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const paginas = Object.values(j?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const buena = paginas.find((p) => esPaginaDeAuto(p, marca));
  return buena?.thumbnail?.source || null;
}

export default function ImagenModelo({ marca, modelo, imagen, size, onAbrir }) {
  const caja = useRef(null);
  const clave = `${marca}|${modelo}`.toLowerCase();
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
    const buscar = () => conCola(() => buscarWikipedia(marca, modelo)).then((u) => { guardarCache(clave, u); if (vivo) setUrl(u); }).catch(() => {});
    if (!el || typeof IntersectionObserver === "undefined") { buscar(); return () => { vivo = false; }; }
    const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting) { obs.disconnect(); buscar(); } }, { rootMargin: "120px" });
    obs.observe(el);
    return () => { vivo = false; obs.disconnect(); };
  }, [clave, imagen, marca, modelo]);

  return (
    <span ref={caja} className={"img-modelo" + (url && !fallo && onAbrir ? " clicable" : "")} style={size ? { width: size, height: size } : undefined}
      title={url && !fallo && onAbrir ? "Clic para ver la imagen" : undefined}
      onClick={url && !fallo && onAbrir ? (e) => { e.stopPropagation(); onAbrir({ url: url.replace(/\/\d+px-/, "/900px-"), respaldo: url, titulo: `${marca} ${modelo}` }); } : undefined}>
      {url && !fallo
        ? <img src={url} alt={`${marca} ${modelo}`} loading="lazy" onError={() => setFallo(true)} />
        : <LogoMarca nombre={marca} size={size ? Math.round(size * 0.7) : 56} />}
    </span>
  );
}

export { conCola, leerCache, guardarCache, norm };
