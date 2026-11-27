// Esqueleto de carga: placeholders grises animados con la forma del contenido (se ve más rápido que «Cargando…»)
export function Skeleton({ filas = 6, bloques = false }) {
  return (
    <div className="skeleton-zona" role="status" aria-busy="true" aria-label="Cargando">
      {bloques && (
        <div className="skeleton-bloques">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton skeleton-bloque" />)}
        </div>
      )}
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="skeleton-fila">
          <div className="skeleton skeleton-avatar" />
          <div className="skeleton-textos">
            <div className="skeleton skeleton-linea" style={{ width: `${62 - (i % 3) * 10}%` }} />
            <div className="skeleton skeleton-linea skeleton-linea-corta" style={{ width: `${38 + (i % 2) * 14}%` }} />
          </div>
          <div className="skeleton skeleton-pill" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
