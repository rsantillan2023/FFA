/**
 * Totales de cuadratura alineados con /revision (todas las páginas, sin filtro testigo).
 */

import { calcularDiferenciaCuadraturaPct, evaluarCuadraturaBalance } from "@ffa/shared";
import {
  esLineaFilaTotalBalance,
  esLineaProbableEstadoResultados,
  esLineaComparativaEjercicio,
  esLineaProbableFlujoEfectivo,
  montoLineaBalance,
  type LineaBalanceLike,
  type RubroBalanceLike,
} from "./balance-filters.js";
import { colapsarDuplicadosLineas, type LineaDuplicadoLike } from "./linea-duplicados.js";
import { esLineaProbableRuidoExtraccion } from "../orchestrate/detect-ruido-extraccion.js";
import {
  esLineaProbableFlujoCaja,
  esLineaProbableTablaSegmentos,
} from "../orchestrate/detect-tablas-no-balance.js";

export interface RubroCuadraturaRevisionLike extends RubroBalanceLike {
  convencionSigno?: "normal" | "invertido";
}

export interface LineaCuadraturaRevisionLike extends LineaDuplicadoLike {
  rubroInstitucionalId?: string;
  rubroCodigo?: string;
  excluirDeCuadratura?: boolean;
  motivoExclusionCuadratura?: string;
}

type MotivoExclusion =
  | "sin_rubro"
  | "resultados"
  | "agrupador"
  | "total"
  | "ruido"
  | "flujo_efectivo"
  | "flujo_caja"
  | "tabla_segmentos"
  | "er_en_balance"
  | "comparativa"
  | "manual"
  | "otro_estado";

function esRubroAgrupadorRevision(rubro: RubroBalanceLike): boolean {
  if (rubro.asignable === false) return true;
  return false;
}

/** Misma lógica de exclusión que apps/web/src/utils/lineaCuadratura.ts */
function motivoExclusionCuadraturaRevision(
  linea: LineaBalanceLike,
  rubro: RubroBalanceLike | undefined
): MotivoExclusion | null {
  if (linea.excluirDeCuadratura) {
    const m = linea.motivoExclusionCuadratura;
    if (m === "otro_estado" || m === "total" || m === "manual") return m;
    return "manual";
  }
  if (!rubro) return "sin_rubro";
  if (rubro.estadoFinanciero === "resultados") return "resultados";
  if (esLineaFilaTotalBalance(linea)) return "total";
  if (esRubroAgrupadorRevision(rubro)) return "agrupador";
  if (esLineaProbableRuidoExtraccion(linea)) return "ruido";
  if (esLineaProbableFlujoEfectivo(linea)) return "flujo_efectivo";
  if (esLineaProbableFlujoCaja(linea)) return "flujo_caja";
  if (esLineaProbableTablaSegmentos(linea)) return "tabla_segmentos";
  if (esLineaProbableEstadoResultados(linea)) return "er_en_balance";
  if (esLineaComparativaEjercicio(linea)) return "comparativa";
  return null;
}

function lineaParticipaCuadraturaRevision(
  linea: LineaBalanceLike,
  rubro: RubroBalanceLike | undefined
): boolean {
  return motivoExclusionCuadraturaRevision(linea, rubro) === null;
}

function resolveRubro(
  l: LineaCuadraturaRevisionLike,
  byId: Map<string, RubroCuadraturaRevisionLike>,
  byCodigo: Map<string, RubroCuadraturaRevisionLike>
): RubroCuadraturaRevisionLike | undefined {
  if (l.rubroInstitucionalId) {
    const r = byId.get(l.rubroInstitucionalId);
    if (r) return r;
  }
  if (l.rubroCodigo) return byCodigo.get(l.rubroCodigo);
  return undefined;
}

function montoFirmado(l: LineaBalanceLike, rubro?: RubroCuadraturaRevisionLike): number {
  const monto = montoLineaBalance(l);
  if (rubro?.convencionSigno === "invertido") return -Math.abs(monto);
  return monto;
}

export interface TotalesCuadraturaRevision {
  activo: number;
  pasivo: number;
  patrimonio: number;
  cuadraturaOk: boolean;
  diferencia: number;
  diferenciaPct: number;
}

/** Cuadratura global como en pantalla de revisión (sin páginas testigo). */
export function calcularTotalesCuadraturaRevision(
  lineas: LineaCuadraturaRevisionLike[],
  rubros: RubroCuadraturaRevisionLike[]
): TotalesCuadraturaRevision {
  const lineasEfectivas = colapsarDuplicadosLineas(lineas);
  const byId = new Map(rubros.map((r) => [r.id, r]));
  const byCodigo = new Map(rubros.map((r) => [r.codigo, r]));

  const sumByEstado = (estado: string): number =>
    lineasEfectivas.reduce((acc, linea) => {
      const rubro = resolveRubro(linea, byId, byCodigo);
      if (!rubro || rubro.estadoFinanciero !== estado) return acc;
      if (!lineaParticipaCuadraturaRevision(linea, rubro)) return acc;
      return acc + montoFirmado(linea, rubro);
    }, 0);

  const activo = sumByEstado("activo");
  const pasivo = sumByEstado("pasivo");
  const patrimonio = sumByEstado("patrimonio");
  const evalCuad = evaluarCuadraturaBalance(activo, pasivo, patrimonio);
  const diferenciaPct = calcularDiferenciaCuadraturaPct(activo, pasivo, patrimonio);

  return {
    activo,
    pasivo,
    patrimonio,
    cuadraturaOk: evalCuad.cuadraturaOk,
    diferencia: evalCuad.diferencia,
    diferenciaPct,
  };
}
