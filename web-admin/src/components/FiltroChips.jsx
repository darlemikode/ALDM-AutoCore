// Filtro por grupo (categoría, marca, puesto…) con un color suave y estable por nombre.
// El color parece al azar pero siempre es el mismo para el mismo nombre.
export function colorGrupo(nombre) {
  const t = nombre || "Sin asignar";
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i) * 7) % 360;
  return `hsl(${(h * 47) % 360} 48% 62%)`;
}

export function contarPor(lista, fn) {
  const conteo = {};
  lista.forEach((x) => { const k = fn(x) || "Sin asignar"; conteo[k] = (conteo[k] || 0) + 1; });
  return conteo;
}

/**
 * items: { nombre: cantidad }  ·  valor: grupo elegido ("" = todos)  ·  onChange(valor)
 */
export default function FiltroChips({ items, valor, onChange, total, etiquetaTodas = "Todas" }) {
  const nombres = Object.keys(items).sort((a, b) => a.localeCompare(b, "es"));
  if (nombres.length < 2) return null;
  const suma = total ?? Object.values(items).reduce((a, b) => a + b, 0);
  return (
    <div className="cat-chips">
      <button type="button" className={`cat-chip ${valor === "" ? "cat-chip-on" : ""}`} style={{ "--c": "var(--petrol-500)" }} onClick={() => onChange("")}>
        {etiquetaTodas} <b>{suma}</b>
      </button>
      {nombres.map((n) => (
        <button type="button" key={n} className={`cat-chip ${valor === n ? "cat-chip-on" : ""}`} style={{ "--c": colorGrupo(n) }} onClick={() => onChange(valor === n ? "" : n)}>
          <span className="cat-punto" />{n} <b>{items[n]}</b>
        </button>
      ))}
    </div>
  );
}
