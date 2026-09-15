import type { ClassifiedLine } from "../types.js";

/** Líneas dentro del balance objetivo (páginas testigo, no excluidas de cuadratura). */
export function lineasAlcanceBalance(
  lineas: ClassifiedLine[],
  paginasBalanceObjetivo?: number[]
): ClassifiedLine[] {
  if (!paginasBalanceObjetivo?.length) return lineas;
  const paginas = new Set(paginasBalanceObjetivo);
  return lineas.filter(
    (l) =>
      l.paginaNumero != null &&
      paginas.has(l.paginaNumero) &&
      !l.excluirDeCuadratura
  );
}

export function agruparLineasPorPagina(
  lineas: ClassifiedLine[]
): Map<number, ClassifiedLine[]> {
  const map = new Map<number, ClassifiedLine[]>();
  for (const l of lineas) {
    const p = l.paginaNumero ?? 0;
    if (p <= 0) continue;
    const g = map.get(p) ?? [];
    g.push(l);
    map.set(p, g);
  }
  return map;
}
