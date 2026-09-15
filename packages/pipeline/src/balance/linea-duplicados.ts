import type { LineaBalanceLike } from "./balance-filters.js";
import { dedupeFuzzyBalanceLineas, puntuacionConservarDedupeFuzzy } from "./dedupe-fuzzy-balance.js";
import { normalizarDenominacion } from "../utils/text.js";

export interface LineaDuplicadoLike extends LineaBalanceLike {
  id: string;
  denominacionNormalizada?: string;
  rubroInstitucionalId?: string;
  estado?: string;
  confianzaClasificacion?: number;
  confianzaExtraccion?: number;
  origenClasificacion?: string;
}

export function lineaDuplicadoKey(
  l: Pick<
    LineaDuplicadoLike,
    "denominacionNormalizada" | "denominacionOriginal" | "montoNormalizado" | "montoOriginal"
  >
): string {
  const raw = l.denominacionNormalizada ?? l.denominacionOriginal;
  const denom = normalizarDenominacion(raw);
  const monto = l.montoNormalizado ?? l.montoOriginal;
  return `${denom}|${monto}`;
}

export function puntuacionConservarLinea(l: LineaDuplicadoLike): number {
  let score = puntuacionConservarDedupeFuzzy(l);
  if (l.estado === "aprobada") score += 5_000;
  const origen = l.origenClasificacion ?? "";
  if (origen === "manual") score += 400;
  if (l.denominacionOriginal.includes("—")) score += 200;
  return score;
}

function elegirConservarGrupo<T extends LineaDuplicadoLike>(grupo: T[]): T {
  return [...grupo].sort((a, b) => {
    const diff = puntuacionConservarLinea(b) - puntuacionConservarLinea(a);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  })[0]!;
}

/** Vista colapsada: una fila por grupo duplicado (misma lógica que /revision). */
export function colapsarDuplicadosLineas<T extends LineaDuplicadoLike>(lineas: T[]): T[] {
  const preFuzzy = dedupeFuzzyBalanceLineas(lineas).lineas;
  const byKey = new Map<string, T[]>();
  for (const l of preFuzzy) {
    const k = lineaDuplicadoKey(l);
    const g = byKey.get(k) ?? [];
    g.push(l);
    byKey.set(k, g);
  }

  const keeperByKey = new Map<string, T>();
  for (const [key, group] of byKey) {
    keeperByKey.set(key, group.length <= 1 ? group[0]! : elegirConservarGrupo(group));
  }

  const seen = new Set<string>();
  const out: T[] = [];
  for (const l of preFuzzy) {
    const key = lineaDuplicadoKey(l);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(keeperByKey.get(key)!);
  }
  return out;
}
