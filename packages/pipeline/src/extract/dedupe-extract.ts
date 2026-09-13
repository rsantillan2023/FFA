import type { ExtractedLine, PaginaClasificada } from "../types.js";
import { normalizarDenominacion } from "../utils/text.js";
import { enrichLineProvenance } from "./dedupe-extract-helpers.js";
import { periodoDedupeKey } from "./infer-periodo.js";

let paginasClasificadasRef: PaginaClasificada[] | undefined;
let defaultEjercicioRef: number | undefined;
let lineIdCounter = 0;

export function setDedupePaginasClasificadas(paginas?: PaginaClasificada[]): void {
  paginasClasificadasRef = paginas;
}

export function setDedupeDefaultEjercicio(ejercicio?: number): void {
  defaultEjercicioRef = ejercicio;
}

function pageScore(paginaNumero: number): number {
  return paginasClasificadasRef?.find((p) => p.pagina === paginaNumero)?.score ?? 0;
}

export { enrichLineProvenance } from "./dedupe-extract-helpers.js";

export interface DedupeExtractStats {
  entrada: number;
  salida: number;
  descartadasDuplicadas: number;
  duplicadosConfirmados: number;
}

function fuenteScore(linea: ExtractedLine): number {
  const explicit = linea.fuentePrioridad;
  if (explicit === "canonico") return 100;
  if (explicit === "complementario") return 40;
  if (explicit === "resumen") return 15;
  if (explicit === "operativo") return 5;

  const seccion = linea.seccionPagina ?? "otro";
  const bySeccion: Record<string, number> = {
    balance: 100,
    resultados: 100,
    flujo_efectivo: 100,
    notas: 45,
    segmentos: 40,
    otro: 25,
    resumen_ejecutivo: 15,
    operativo: 5,
  };
  return bySeccion[seccion] ?? 25;
}

function montoNorm(linea: ExtractedLine): number {
  return linea.montoNormalizado ?? linea.montoOriginal;
}

function amountsClose(a: number, b: number): boolean {
  if (a === b) return true;
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / max < 0.005;
}

function enrichPeriodoLinea(linea: ExtractedLine): ExtractedLine {
  const key = periodoDedupeKey(linea.periodo, linea.columnaOrigen);
  if (key !== "sin-periodo") return linea;
  if (!defaultEjercicioRef) return linea;
  return {
    ...linea,
    periodo: linea.periodo ?? { tipo: "ANUAL", ejercicio: defaultEjercicioRef, etiqueta: String(defaultEjercicioRef) },
    columnaOrigen: linea.columnaOrigen ?? String(defaultEjercicioRef),
  };
}

function dedupeKey(linea: ExtractedLine): string {
  const enriched = enrichPeriodoLinea(linea);
  const denom = normalizarDenominacion(enriched.denominacionOriginal);
  const periodo = periodoDedupeKey(enriched.periodo, enriched.columnaOrigen);
  const moneda = enriched.moneda ?? "";
  const escala = String(enriched.escalaFactor ?? "");
  // Incluye página para no colapsar filas idénticas en estados distintos (p4 resumen vs p12 canónico).
  return `${denom}|${periodo}|${moneda}|${escala}|p${linea.paginaNumero}`;
}

function assignLineId(linea: ExtractedLine): ExtractedLine {
  if (linea.id) return linea;
  lineIdCounter += 1;
  return { ...linea, id: `L${lineIdCounter}` };
}

/** Resuelve duplicados priorizando fuente canónica; confirma duplicados con mismo valor normalizado. */
export function crossValidateAndDedupe(lineas: ExtractedLine[]): {
  lineas: ExtractedLine[];
  stats: DedupeExtractStats;
} {
  lineIdCounter = 0;
  const stats: DedupeExtractStats = {
    entrada: lineas.length,
    salida: 0,
    descartadasDuplicadas: 0,
    duplicadosConfirmados: 0,
  };

  const enriched = lineas.map((l) => assignLineId(enrichLineProvenance(l)));
  const groups = new Map<string, ExtractedLine[]>();

  for (const linea of enriched) {
    const key = dedupeKey(linea);
    const list = groups.get(key) ?? [];
    list.push(linea);
    groups.set(key, list);
  }

  const kept: ExtractedLine[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push(group[0]!);
      continue;
    }

    group.sort((a, b) => {
      const scoreDiff = fuenteScore(b) - fuenteScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      const pageScoreDiff = pageScore(b.paginaNumero) - pageScore(a.paginaNumero);
      if (pageScoreDiff !== 0) return pageScoreDiff;
      const confDiff = (b.confianzaExtraccion ?? 0.8) - (a.confianzaExtraccion ?? 0.8);
      if (confDiff !== 0) return confDiff;
      return b.paginaNumero - a.paginaNumero;
    });

    let winner = group[0]!;
    const evidencias: ExtractedLine["evidenciasDuplicado"] = [];

    for (const dup of group.slice(1)) {
      stats.descartadasDuplicadas += 1;
      if (amountsClose(montoNorm(winner), montoNorm(dup))) {
        stats.duplicadosConfirmados += 1;
        evidencias.push({
          paginaNumero: dup.paginaNumero,
          montoNormalizado: montoNorm(dup),
          id: dup.id,
        });
      }
    }

    if (evidencias.length) {
      winner = {
        ...winner,
        evidenciasDuplicado: [...(winner.evidenciasDuplicado ?? []), ...evidencias],
      };
    }

    kept.push(winner);
  }

  kept.sort((a, b) => a.paginaNumero - b.paginaNumero || a.denominacionOriginal.localeCompare(b.denominacionOriginal));
  stats.salida = kept.length;
  return { lineas: kept, stats };
}

/** @deprecated */
export function dedupeExtractLines(lineas: ExtractedLine[]): {
  lineas: ExtractedLine[];
  stats: DedupeExtractStats & { descartadasOperativas: number };
} {
  const { lineas: out, stats } = crossValidateAndDedupe(lineas);
  return { lineas: out, stats: { ...stats, descartadasOperativas: 0 } };
}
