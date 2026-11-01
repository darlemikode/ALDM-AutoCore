import { useState } from "react";

// Logo de la marca de un vehículo (dataset público de logos). Si no existe o no carga, muestra la inicial.
const ALIAS = { vw: "volkswagen", mercedes: "mercedes-benz", "mercedes benz": "mercedes-benz", chevy: "chevrolet", "alfa romeo": "alfa-romeo", "land rover": "land-rover", "rolls royce": "rolls-royce", "aston martin": "aston-martin" };
export function slugMarca(nombre) {
  const n = String(nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return (ALIAS[n] || n).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function LogoMarca({ nombre, size }) {
  const [error, setError] = useState(false);
  const slug = slugMarca(nombre);
  const caja = size ? { width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" } : undefined;
  if (error || !slug) return <span className="cat-marca-inicial" style={size ? { ...caja, fontSize: size * 0.55 } : undefined}>{String(nombre || "?").trim().charAt(0).toUpperCase()}</span>;
  return <img src={`https://cdn.jsdelivr.net/gh/filippofilip95/car-logos-dataset@master/logos/optimized/${slug}.png`} alt={nombre} title={nombre} loading="lazy"
    style={size ? { ...caja, objectFit: "contain" } : undefined} onError={() => setError(true)} />;
}
