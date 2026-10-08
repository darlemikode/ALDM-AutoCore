// Texto para comparar al buscar: sin acentos, sin mayúsculas y sin espacios sobrantes
export const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// ¿el texto contiene lo buscado, ignorando acentos y mayúsculas?
export const contiene = (texto, buscado) => norm(texto).includes(norm(buscado));
