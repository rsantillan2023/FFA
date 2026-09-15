import type { ClassifiedLine, NormalizedLine, RubroRef } from "../types.js";
import { runWithIaContext } from "../ia/ia-context.js";
import { anthropicDisponible, openAiDisponible } from "../extract/resolve-provider.js";
import {
  clasificarLineaSubtotalBalance,
  esLineaSubtotalBalance,
} from "../balance/subtotal-rubro.js";
import {
  buildClassifyLineContext,
  classifyLineSemantico,
  scoreRubroCandidates,
  tryClassifyDeterministic,
  type ClassifyInput,
  type ClassifyLineContext,
} from "./classify-lines.js";
import { sugerirClasificacionIa } from "./sugerir-ia.js";

function umbralOkIa(ctx: ClassifyLineContext): number {
  const n = Number(process.env.UMBRAL_OK_IA ?? 70);
  return Number.isFinite(n) && n > 0 ? Math.min(n, ctx.umbralConfianza) : 70;
}

export interface ClassifyWithIaContextoCaso {
  moneda?: string;
  escala?: string;
  razonSocial?: string;
}

export interface ClassifyWithIaInput extends ClassifyInput {
  contextoCaso?: ClassifyWithIaContextoCaso;
  /** false fuerza fallback semántico aunque haya API key */
  iaHabilitada?: boolean;
}

function iaClasificacionHabilitada(input: ClassifyWithIaInput): boolean {
  if (input.iaHabilitada === false) return false;
  const flag = process.env.CLASIFICACION_IA_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return anthropicDisponible() || openAiDisponible();
}

function iaConcurrency(): number {
  const n = Number(process.env.CLASIFICACION_IA_CONCURRENCY ?? 5);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 5;
}

function lineasPorPagina(lineas: NormalizedLine[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const l of lineas) {
    const p = l.paginaNumero ?? 1;
    const arr = map.get(p) ?? [];
    arr.push(l.denominacionOriginal);
    map.set(p, arr);
  }
  return map;
}

async function classifyLineWithIa(
  linea: NormalizedLine,
  ctx: ClassifyLineContext,
  rubros: RubroRef[],
  contextoCaso: ClassifyWithIaContextoCaso | undefined,
  lineasPagina: string[]
): Promise<ClassifiedLine> {
  if (esLineaSubtotalBalance(linea)) return clasificarLineaSubtotalBalance(linea, rubros);

  const candidatos = scoreRubroCandidates(linea, ctx.rubrosImputacion);
  try {
    const sug = await runWithIaContext({ actorTipo: "sistema" }, () =>
      sugerirClasificacionIa({
        denominacionOriginal: linea.denominacionOriginal,
        montoNormalizado: linea.montoNormalizado,
        paginaNumero: linea.paginaNumero,
        codigoOrigen: linea.codigoOrigen,
        columnaOrigen: linea.columnaOrigen,
        candidatosHeuristicos: candidatos.map((c) => ({
          codigo: c.codigo,
          nombre: c.nombre,
          score: c.score,
        })),
        rubros,
        contextoCaso: {
          ...contextoCaso,
          lineasMismaPagina: lineasPagina,
        },
        funcionAuditoria: "clasificacion_ia_primaria",
      })
    );

    const confianza = sug.confianza;
    const umbralIa = umbralOkIa(ctx);
    return {
      ...linea,
      rubroInstitucionalId: sug.rubroInstitucionalId,
      rubroCodigo: sug.rubroCodigo,
      confianzaClasificacion: confianza,
      requiereRevision: confianza < umbralIa,
      origenClasificacion: "ia_clasificacion",
      candidatosAsistidos: candidatos,
      clasificacionIaRazonamiento: sug.razonamiento,
    };
  } catch {
    return classifyLineSemantico(linea, ctx);
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/**
 * Clasificación Claude-first: criterio/regla → IA → semántica (fallback).
 */
export async function classifyLinesWithIa(input: ClassifyWithIaInput): Promise<ClassifiedLine[]> {
  const ctx = buildClassifyLineContext(input);
  const porPagina = lineasPorPagina(input.lineas);
  const useIa = iaClasificacionHabilitada(input);

  const deterministic = input.lineas.map((linea) => {
    if (esLineaSubtotalBalance(linea)) return clasificarLineaSubtotalBalance(linea, input.rubros);
    return tryClassifyDeterministic(linea, ctx);
  });

  if (!useIa) {
    return input.lineas.map((linea, i) => {
      if (deterministic[i]) return deterministic[i]!;
      return classifyLineSemantico(linea, ctx);
    });
  }

  const pendingIndices: number[] = [];
  for (let i = 0; i < input.lineas.length; i++) {
    if (deterministic[i]) continue;
    pendingIndices.push(i);
  }

  const iaResults = await mapConcurrent(pendingIndices, iaConcurrency(), async (lineIndex) => {
    const linea = input.lineas[lineIndex]!;
    const pagina = linea.paginaNumero ?? 1;
    return classifyLineWithIa(
      linea,
      ctx,
      input.rubros,
      input.contextoCaso,
      porPagina.get(pagina) ?? []
    );
  });

  const iaByIndex = new Map<number, ClassifiedLine>();
  pendingIndices.forEach((lineIndex, j) => {
    iaByIndex.set(lineIndex, iaResults[j]!);
  });

  return input.lineas.map((linea, i) => deterministic[i] ?? iaByIndex.get(i) ?? classifyLineSemantico(linea, ctx));
}
