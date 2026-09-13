import type { ExtractedLine, InconsistenciaExtract, SeccionPagina } from "../types.js";
import { normalizarDenominacion } from "../utils/text.js";
import { periodoDedupeKey } from "./infer-periodo.js";

function montoNorm(linea: ExtractedLine): number {
  return linea.montoNormalizado ?? linea.montoOriginal;
}

function amountsClose(a: number, b: number, tolerancePct = 0.005): boolean {
  if (a === b) return true;
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / max <= tolerancePct;
}

function fuenteRank(linea: ExtractedLine): number {
  const map = { canonico: 5, complementario: 3, resumen: 2, operativo: 1 } as const;
  return map[linea.fuentePrioridad ?? "complementario"] ?? 2;
}

const SECCIONES_SIGNO_FLEXIBLE: SeccionPagina[] = [
  "resumen_ejecutivo",
  "operativo",
  "notas",
  "segmentos",
];

function esConflictoSignoPermitido(a: ExtractedLine, b: ExtractedLine): boolean {
  if (amountsClose(montoNorm(a), montoNorm(b))) return true;
  if (!amountsClose(Math.abs(montoNorm(a)), Math.abs(montoNorm(b)))) return false;

  const seccionesDistintas = a.seccionPagina !== b.seccionPagina;
  const algunaFlexible =
    SECCIONES_SIGNO_FLEXIBLE.includes(a.seccionPagina ?? "otro") ||
    SECCIONES_SIGNO_FLEXIBLE.includes(b.seccionPagina ?? "otro");
  return seccionesDistintas && algunaFlexible;
}

function inconsistenciaGroupKey(linea: ExtractedLine): string {
  const denom = normalizarDenominacion(linea.denominacionOriginal);
  const periodo = periodoDedupeKey(linea.periodo, linea.columnaOrigen);
  const seccion = linea.seccionPagina ?? "otro";
  const moneda = linea.moneda ?? "";
  const escala = String(linea.escalaFactor ?? "");
  return `${denom}|${periodo}|${seccion}|${moneda}|${escala}`;
}

function hayConflictoReal(group: ExtractedLine[]): boolean {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i]!;
      const b = group[j]!;
      if (amountsClose(montoNorm(a), montoNorm(b))) continue;
      if (esConflictoSignoPermitido(a, b)) continue;
      return true;
    }
  }
  return false;
}

export interface InconsistenciaStats {
  lineas: ExtractedLine[];
  inconsistencias: InconsistenciaExtract[];
  descartadasPorPeriodo: number;
}

/** Detecta inconsistencias reales — mismo concepto + mismo período + distinto valor normalizado. */
export function detectarInconsistencias(lineas: ExtractedLine[]): InconsistenciaStats {
  const groups = new Map<string, ExtractedLine[]>();

  for (const linea of lineas) {
    const key = inconsistenciaGroupKey(linea);
    const list = groups.get(key) ?? [];
    list.push(linea);
    groups.set(key, list);
  }

  const inconsistencias: InconsistenciaExtract[] = [];
  const lineasOut = [...lineas];
  let descartadasPorPeriodo = 0;

  // Contar grupos que se separaron por período (mismo concepto, distinto periodo en dedupe previo)
  const porConcepto = new Map<string, ExtractedLine[]>();
  for (const linea of lineas) {
    const c = normalizarDenominacion(linea.denominacionOriginal);
    const list = porConcepto.get(c) ?? [];
    list.push(linea);
    porConcepto.set(c, list);
  }
  for (const group of porConcepto.values()) {
    if (group.length < 2) continue;
    const periodos = new Set(group.map((g) => periodoDedupeKey(g.periodo, g.columnaOrigen)));
    if (periodos.size > 1) descartadasPorPeriodo += group.length - periodos.size;
  }

  for (const [conceptoKey, group] of groups) {
    if (group.length < 2) continue;
    if (!hayConflictoReal(group)) continue;

    const concepto = conceptoKey.split("|")[0] ?? conceptoKey;

    inconsistencias.push({
      concepto,
      valores: group.map((g) => ({
        valor: montoNorm(g),
        paginaNumero: g.paginaNumero,
        seccionPagina: g.seccionPagina,
        fuentePrioridad: g.fuentePrioridad,
      })),
      motivo: "El mismo concepto y período fue detectado con valores diferentes tras normalización numérica.",
    });

    const winner = [...group].sort((a, b) => fuenteRank(b) - fuenteRank(a) || b.paginaNumero - a.paginaNumero)[0]!;

    for (let i = 0; i < lineasOut.length; i++) {
      const l = lineasOut[i]!;
      if (inconsistenciaGroupKey(l) !== conceptoKey) continue;

      const conflictoConWinner =
        l !== winner &&
        !amountsClose(montoNorm(l), montoNorm(winner)) &&
        !esConflictoSignoPermitido(l, winner);

      if (conflictoConWinner) {
        lineasOut[i] = {
          ...l,
          requiereRevision: true,
          motivoRevision: inconsistencias[inconsistencias.length - 1]!.motivo,
          confianzaExtraccion: Math.min(l.confianzaExtraccion ?? 0.8, 0.5),
        };
      }
    }
  }

  return { lineas: lineasOut, inconsistencias, descartadasPorPeriodo };
}
