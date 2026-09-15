import { EstadoFinanciero } from "@ffa/shared";
import type {
  CandidatoAsistido,
  ClassifiedLine,
  CriterioContribuyenteRef,
  NormalizedLine,
  ReglaClasificacionRef,
  RubroRef,
} from "../types.js";
import { sugerirRubroCodigoBalance } from "../balance/reconcile-balance.js";
import { clasificarLineaSubtotalBalance, esLineaSubtotalBalance } from "../balance/subtotal-rubro.js";
import { filtrarRubrosAsignables } from "../plan/rubros-asignables.js";
import { similitudTexto } from "../utils/similarity.js";
import { contienePatron, normalizarDenominacion } from "../utils/text.js";
export interface ClassifyInput {
  lineas: NormalizedLine[];
  rubros: RubroRef[];
  reglas: ReglaClasificacionRef[];
  criterios?: CriterioContribuyenteRef[];
  umbralConfianza: number;
}

function matchCriterioContribuyente(
  linea: NormalizedLine,
  criterios: CriterioContribuyenteRef[],
  rubrosById: Map<string, RubroRef>,
  umbralConfianza: number
): ClassifiedLine | null {
  const denom = normalizarDenominacion(linea.denominacionOriginal);
  const crit = criterios.find((c) => c.denominacionOrigen === denom);
  if (!crit) return null;

  const rubro = rubrosById.get(crit.rubroInstitucionalId);
  if (!rubro) return null;

  const confianza = 98;
  return {
    ...linea,
    rubroInstitucionalId: rubro.id,
    rubroCodigo: rubro.codigo,
    confianzaClasificacion: confianza,
    requiereRevision: confianza < umbralConfianza,
    origenClasificacion: "criterio_contribuyente",
  };
}

function matchRegla(
  linea: NormalizedLine,
  reglas: ReglaClasificacionRef[],
  rubrosById: Map<string, RubroRef>,
  umbralConfianza: number
): ClassifiedLine | null {
  const sorted = [...reglas].filter((r) => r.activa).sort((a, b) => a.prioridad - b.prioridad);

  for (const regla of sorted) {
    let match = false;
    if (regla.tipo === "patron_denominacion") {
      match = contienePatron(linea.denominacionOriginal, regla.patron);
    } else if (regla.tipo === "codigo_origen" && linea.codigoOrigen) {
      match = linea.codigoOrigen.startsWith(regla.patron);
    } else if (regla.tipo === "regex") {
      try {
        match = new RegExp(regla.patron, "i").test(linea.denominacionOriginal);
      } catch {
        match = false;
      }
    }

    if (match) {
      const rubro = rubrosById.get(regla.rubroInstitucionalId);
      if (!rubro) continue;
      const confianza = 95;
      return {
        ...linea,
        rubroInstitucionalId: rubro.id,
        rubroCodigo: rubro.codigo,
        confianzaClasificacion: confianza,
        requiereRevision: confianza < umbralConfianza,
        origenClasificacion: "regla",
      };
    }
  }
  return null;
}

function detectRetiroEnActivo(linea: ClassifiedLine, rubrosById: Map<string, RubroRef>): ClassifiedLine {
  if (!linea.rubroInstitucionalId) return linea;
  const rubro = rubrosById.get(linea.rubroInstitucionalId);
  const denom = normalizarDenominacion(linea.denominacionOriginal);
  if (
    denom.includes("retiro") &&
    rubro?.estadoFinanciero === EstadoFinanciero.ACTIVO
  ) {
    return {
      ...linea,
      confianzaClasificacion: Math.min(linea.confianzaClasificacion, 40),
      requiereRevision: true,
    };
  }
  return linea;
}

export function scoreRubroCandidates(linea: NormalizedLine, rubros: RubroRef[]): CandidatoAsistido[] {
  const denom = normalizarDenominacion(linea.denominacionOriginal);
  const candidatos: CandidatoAsistido[] = [];

  for (const rubro of rubros) {
    const nombre = normalizarDenominacion(rubro.nombre);
    let score = 0;
    if (denom === nombre) score = 88;
    else if (denom.includes(nombre) || nombre.includes(denom)) score = 74;
    else {
      for (const alias of rubro.aliases ?? []) {
        const a = normalizarDenominacion(alias);
        if (denom === a || denom.includes(a) || a.includes(denom)) {
          score = Math.max(score, 80);
        }
      }
      const sim = similitudTexto(denom, nombre);
      if (sim >= 0.65) score = Math.max(score, Math.round(55 + sim * 25));
    }
    if (score > 0) {
      candidatos.push({
        rubroInstitucionalId: rubro.id,
        codigo: rubro.codigo,
        nombre: rubro.nombre,
        score,
      });
    }
  }

  return candidatos.sort((a, b) => b.score - a.score).slice(0, 3);
}

function matchSemantico(
  linea: NormalizedLine,
  rubros: RubroRef[],
  umbralConfianza: number
): ClassifiedLine {
  const candidatos = scoreRubroCandidates(linea, rubros);

  if (candidatos.length >= 2 && candidatos[0]!.score - candidatos[1]!.score < 8) {
    return {
      ...linea,
      rubroInstitucionalId: candidatos[0]!.rubroInstitucionalId,
      rubroCodigo: candidatos[0]!.codigo,
      confianzaClasificacion: Math.min(candidatos[0]!.score, 68),
      requiereRevision: true,
      origenClasificacion: "semantica",
      candidatosAsistidos: candidatos,
    };
  }

  const best = candidatos[0];
  if (best && best.score >= 70) {
    return {
      ...linea,
      rubroInstitucionalId: best.rubroInstitucionalId,
      rubroCodigo: best.codigo,
      confianzaClasificacion: best.score,
      requiereRevision: best.score < umbralConfianza,
      origenClasificacion: "semantica",
      candidatosAsistidos: candidatos,
    };
  }

  return resolveAsistida(linea, rubros, umbralConfianza);
}

/** F.5 — resolución asistida con top candidatos del plan vigente (F.6). */
export function resolveAsistida(
  linea: NormalizedLine,
  rubros: RubroRef[],
  umbralConfianza: number
): ClassifiedLine {
  const candidatos = scoreRubroCandidates(linea, rubros);
  const best = candidatos[0];

  if (best && best.score >= 55) {
    return {
      ...linea,
      rubroInstitucionalId: best.rubroInstitucionalId,
      rubroCodigo: best.codigo,
      confianzaClasificacion: Math.min(best.score, umbralConfianza - 1),
      requiereRevision: true,
      origenClasificacion: "asistida",
      candidatosAsistidos: candidatos,
    };
  }

  return {
    ...linea,
    confianzaClasificacion: best?.score ?? 35,
    requiereRevision: true,
    origenClasificacion: "asistida",
    candidatosAsistidos: candidatos,
  };
}

export interface ClassifyLineContext {
  rubrosById: Map<string, RubroRef>;
  rubrosImputacion: RubroRef[];
  criterios: CriterioContribuyenteRef[];
  reglas: ReglaClasificacionRef[];
  umbralConfianza: number;
}

export function buildClassifyLineContext(input: ClassifyInput): ClassifyLineContext {
  const rubrosById = new Map(input.rubros.map((r) => [r.id, r]));
  const rubrosAsignables = filtrarRubrosAsignables(input.rubros);
  const rubrosImputacion = rubrosAsignables.length ? rubrosAsignables : input.rubros;
  return {
    rubrosById,
    rubrosImputacion,
    criterios: input.criterios ?? [],
    reglas: input.reglas,
    umbralConfianza: input.umbralConfianza,
  };
}

function matchBalanceRubroDeterministic(
  linea: NormalizedLine,
  ctx: ClassifyLineContext
): ClassifiedLine | null {
  const codigo = sugerirRubroCodigoBalance(linea.denominacionOriginal);
  if (!codigo) return null;
  const rubro = ctx.rubrosImputacion.find((r) => r.codigo === codigo);
  if (!rubro) return null;
  return detectRetiroEnActivo(
    {
      ...linea,
      rubroInstitucionalId: rubro.id,
      rubroCodigo: rubro.codigo,
      confianzaClasificacion: 88,
      requiereRevision: false,
      origenClasificacion: "regla",
    },
    ctx.rubrosById
  );
}

/** Criterio aprobado del contribuyente o regla activa — sin semántica ni IA. */
export function tryClassifyDeterministic(
  linea: NormalizedLine,
  ctx: ClassifyLineContext
): ClassifiedLine | null {
  const byCriterio = matchCriterioContribuyente(
    linea,
    ctx.criterios,
    ctx.rubrosById,
    ctx.umbralConfianza
  );
  if (byCriterio) return byCriterio;

  const byRegla = matchRegla(linea, ctx.reglas, ctx.rubrosById, ctx.umbralConfianza);
  if (byRegla) {
    byRegla.requiereRevision = byRegla.confianzaClasificacion < ctx.umbralConfianza;
    return detectRetiroEnActivo(byRegla, ctx.rubrosById);
  }

  const byBalance = matchBalanceRubroDeterministic(linea, ctx);
  if (byBalance) return byBalance;

  return null;
}

/** Fallback heurístico (similitud de texto) cuando la IA no está disponible o falla. */
export function classifyLineSemantico(
  linea: NormalizedLine,
  ctx: ClassifyLineContext
): ClassifiedLine {
  return detectRetiroEnActivo(
    matchSemantico(linea, ctx.rubrosImputacion, ctx.umbralConfianza),
    ctx.rubrosById
  );
}

export function classifyLines(input: ClassifyInput): ClassifiedLine[] {
  const ctx = buildClassifyLineContext(input);
  return input.lineas.map((linea) => {
    if (esLineaSubtotalBalance(linea)) {
      return clasificarLineaSubtotalBalance(linea, input.rubros);
    }
    const det = tryClassifyDeterministic(linea, ctx);
    if (det) return det;
    return classifyLineSemantico(linea, ctx);
  });
}

export function calcularConfianzaGlobal(lineas: ClassifiedLine[]): number {
  if (lineas.length === 0) return 0;
  const sum = lineas.reduce((acc, l) => acc + l.confianzaClasificacion, 0);
  return Math.round(sum / lineas.length);
}
