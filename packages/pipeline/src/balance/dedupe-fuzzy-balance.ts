import { normalizarDenominacion } from "../utils/text.js";

export function montosCasiIguales(a: number, b: number, toleranciaRel = 0.005): boolean {
  if (a === b) return true;
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / max <= toleranciaRel;
}

/** Denominación base para dedupe: sin notas al pie ni encabezados de sección OCR. */
export function denomBaseBalance(texto: string): string {
  let d = normalizarDenominacion(texto);
  d = d.replace(/\s+\d{1,3}$/, "");
  d = d.replace(/^activos corrientes\s+/i, "");
  d = d.replace(/^activos no corrientes\s+/i, "");
  d = d.replace(/^pasivos corrientes\s+/i, "");
  d = d.replace(/^pasivos no corrientes\s+/i, "");
  d = d.replace(/^patrimonio y pasivos\s+/i, "");
  return d.trim();
}

export interface LineaDedupeFuzzyLike {
  id?: string;
  denominacionOriginal: string;
  montoNormalizado?: number;
  montoOriginal: number;
  paginaNumero?: number;
  metodoExtraccion?: string;
  confianzaExtraccion?: number;
  fuentePrioridad?: string;
  origenClasificacion?: string;
  confianzaClasificacion?: number;
  rubroInstitucionalId?: string;
}

function montoAbs(l: LineaDedupeFuzzyLike): number {
  return Math.abs(l.montoNormalizado ?? l.montoOriginal);
}

/** Puntuación para conservar la mejor fila de un grupo duplicado. */
export function puntuacionConservarDedupeFuzzy(l: LineaDedupeFuzzyLike): number {
  let score = 0;
  if (l.rubroInstitucionalId) score += 10_000;
  if (l.metodoExtraccion === "heuristica") score += 800;
  if (l.fuentePrioridad === "canonico") score += 500;
  score += (l.confianzaClasificacion ?? 0) * 10;
  score += (l.confianzaExtraccion ?? 0) * 100;
  const origen = l.origenClasificacion ?? "";
  if (origen === "regla") score += 400;
  else if (origen === "semantica") score += 200;
  if (!/\s\d{1,3}$/.test(l.denominacionOriginal.trim())) score += 80;
  if (!/^(activos|pasivos)\s+(corrientes|no corrientes)\s/i.test(l.denominacionOriginal)) score += 40;
  return score;
}

function elegirConservarGrupo<T extends LineaDedupeFuzzyLike>(grupo: T[]): T {
  return [...grupo].sort((a, b) => {
    const diff = puntuacionConservarDedupeFuzzy(b) - puntuacionConservarDedupeFuzzy(a);
    if (diff !== 0) return diff;
    return (a.denominacionOriginal.length ?? 0) - (b.denominacionOriginal.length ?? 0);
  })[0]!;
}

/**
 * Colapsa duplicados por página + denominación base (FINYX: nativo + Vision, notas al pie).
 * Si hay montos distintos en el mismo grupo, conserva la fila de mayor puntuación (heurística > Vision).
 */
export function dedupeFuzzyBalanceLineas<T extends LineaDedupeFuzzyLike>(
  lineas: T[]
): { lineas: T[]; descartadas: number } {
  const grupos = new Map<string, T[]>();
  for (const l of lineas) {
    const p = l.paginaNumero ?? 0;
    const base = denomBaseBalance(l.denominacionOriginal);
    if (!base) continue;
    const k = `${p}|${base}`;
    const g = grupos.get(k) ?? [];
    g.push(l);
    grupos.set(k, g);
  }

  const descartar = new Set<T>();
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    const montos = grupo.map((l) => montoAbs(l));
    const todosCercanos = montos.every((m) => montosCasiIguales(m, montos[0]!));
    if (todosCercanos || grupo.length >= 2) {
      const keeper = elegirConservarGrupo(grupo);
      for (const l of grupo) {
        if (l !== keeper) descartar.add(l);
      }
    }
  }

  if (descartar.size === 0) return { lineas, descartadas: 0 };
  return {
    lineas: lineas.filter((l) => !descartar.has(l)),
    descartadas: descartar.size,
  };
}
