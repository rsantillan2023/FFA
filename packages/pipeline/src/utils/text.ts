/** Normaliza denominación para matching (minúsculas, sin acentos, espacios colapsados). */
export function normalizarDenominacion(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function contienePatron(denominacion: string, patron: string): boolean {
  const d = normalizarDenominacion(denominacion);
  const p = normalizarDenominacion(patron);
  return d.includes(p) || p.includes(d);
}
