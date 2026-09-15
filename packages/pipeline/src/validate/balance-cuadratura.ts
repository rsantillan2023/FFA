import { analizarBalance } from "../balance/reconcile-balance.js";
import { filtrarRubrosAsignables } from "../plan/rubros-asignables.js";
import type { ClassifiedLine, RubroRef } from "../types.js";
import { EstadoFinanciero, evaluarCuadraturaBalance } from "@ffa/shared";

export interface CuadraturaBalanceResult {
  activo: number;
  pasivo: number;
  patrimonio: number;
  cuadraturaOk: boolean;
  tolerancia: number;
  paginasBalanceObjetivo: number[];
  lineasUsadas: number;
  modo: "balance_objetivo" | "global_filtrado" | "global";
}

function sumByEstadoFiltrado(
  lineas: ClassifiedLine[],
  rubrosById: Map<string, RubroRef>,
  estado: EstadoFinanciero
): number {
  return lineas.reduce((acc, linea) => {
    if (linea.excluirDeCuadratura) return acc;
    if (!linea.rubroInstitucionalId) return acc;
    const rubro = rubrosById.get(linea.rubroInstitucionalId);
    if (!rubro || rubro.estadoFinanciero !== estado) return acc;
    const monto = linea.montoNormalizado ?? linea.montoOriginal;
    const signed = rubro.convencionSigno === "invertido" ? -Math.abs(monto) : monto;
    return acc + signed;
  }, 0);
}

/** Cuadratura alineada al balance objetivo (páginas testigo), no suma global del PDF. */
export function computeCuadraturaBalance(
  lineas: ClassifiedLine[],
  rubros: RubroRef[]
): CuadraturaBalanceResult {
  const rubrosById = new Map(rubros.map((r) => [r.id, r]));
  const asignables = filtrarRubrosAsignables(rubros);
  const idsAsignables = new Set(asignables.map((r) => r.id));
  const rubrosBalance = rubros.map((r) => ({
    id: r.id,
    codigo: r.codigo,
    estadoFinanciero: r.estadoFinanciero,
    asignable: idsAsignables.has(r.id),
  }));

  const inputs = lineas.map((l, i) => ({
    id: l.id ?? `line-${i}-${l.paginaNumero ?? 0}`,
    denominacionOriginal: l.denominacionOriginal,
    montoOriginal: l.montoOriginal,
    montoNormalizado: l.montoNormalizado,
    paginaNumero: l.paginaNumero,
    rubroInstitucionalId: l.rubroInstitucionalId,
    rubroCodigo: l.rubroCodigo,
    excluirDeCuadratura: l.excluirDeCuadratura ?? false,
    motivoExclusionCuadratura: l.motivoExclusionCuadratura,
  }));

  const analisis = analizarBalance(inputs, rubrosBalance);

  if (analisis.paginasBalanceObjetivo.length > 0 && analisis.testigoRecomendado) {
    const evalCuad = evaluarCuadraturaBalance(
      analisis.totales.activo,
      analisis.totales.pasivo,
      analisis.totales.patrimonio
    );
    return {
      activo: analisis.totales.activo,
      pasivo: analisis.totales.pasivo,
      patrimonio: analisis.totales.patrimonio,
      cuadraturaOk: evalCuad.cuadraturaOk,
      tolerancia: evalCuad.tolerancia,
      paginasBalanceObjetivo: analisis.paginasBalanceObjetivo,
      lineasUsadas: analisis.conteos.detalle,
      modo: "balance_objetivo",
    };
  }

  const filtradas = lineas.filter((l) => !l.excluirDeCuadratura);
  const activo = sumByEstadoFiltrado(filtradas, rubrosById, EstadoFinanciero.ACTIVO);
  const pasivo = sumByEstadoFiltrado(filtradas, rubrosById, EstadoFinanciero.PASIVO);
  const patrimonio = sumByEstadoFiltrado(filtradas, rubrosById, EstadoFinanciero.PATRIMONIO);
  const evalCuad = evaluarCuadraturaBalance(activo, pasivo, patrimonio);

  return {
    activo,
    pasivo,
    patrimonio,
    cuadraturaOk: evalCuad.cuadraturaOk,
    tolerancia: evalCuad.tolerancia,
    paginasBalanceObjetivo: [],
    lineasUsadas: filtradas.length,
    modo: filtradas.length < lineas.length ? "global_filtrado" : "global",
  };
}
