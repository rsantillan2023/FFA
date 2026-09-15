/** Filtros compartidos para cuadratura del balance (API + pipeline). */

import {
  esLineaNoBalanceDetalle,
  esLineaProbableFlujoCaja,
  esLineaProbableTablaSegmentos,
} from "../orchestrate/detect-tablas-no-balance.js";

export type MotivoExclusionCuadratura =
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
  | "otro_estado"
  | "manual";

export interface LineaBalanceLike {
  denominacionOriginal: string;
  montoNormalizado?: number;
  montoOriginal: number;
  paginaNumero?: number;
  excluirDeCuadratura?: boolean;
  motivoExclusionCuadratura?: string;
}

export interface RubroBalanceLike {
  id: string;
  codigo: string;
  estadoFinanciero: string;
  asignable?: boolean;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function montoLineaBalance(l: LineaBalanceLike): number {
  return l.montoNormalizado ?? l.montoOriginal;
}

export function esLineaFilaTotalBalance(linea: LineaBalanceLike): boolean {
  const d = norm(linea.denominacionOriginal);
  if (!d) return false;
  if (/\btotal(es)?\b/.test(d)) return true;
  if (/\bsubtotal(es)?\b/.test(d)) return true;
  if (/^suma\s/.test(d)) return true;
  if (/^atribuible a la participaci[oó]n/i.test(d)) return true;
  if (/\bpatrimonio atribuible\b/.test(d)) return true;
  if (/\bpatrimonio neto atribuible\b/.test(d)) return true;
  if (/\btotal activos negocios\b/.test(d)) return true;
  if (/\btotal pasivos negocios\b/.test(d)) return true;
  if (/\btotal patrimonio y pasivos\b/.test(d)) return true;
  if (/^activos (corrientes|no corrientes) totales$/i.test(d)) return true;
  if (/^pasivos (corrientes|no corrientes) totales$/i.test(d)) return true;
  if (/^total activos\b/i.test(d)) return true;
  if (/^total pasivos\b/i.test(d)) return true;
  if (/^patrimonio total$/i.test(d)) return true;
  return false;
}

export function esLineaProbableFlujoEfectivo(linea: LineaBalanceLike): boolean {
  const d = norm(linea.denominacionOriginal);
  if (!d) return false;
  if (/\bflujos?\s+de\s+efectivo\b/.test(d)) return true;
  if (/\bflujo\s+neto\s+de\s+efectivo\b/.test(d)) return true;
  if (/\befectivo\s+y\s+equivalentes\s+al\s+(inicio|cierre)\b/.test(d)) return true;
  if (/\bresultado\s+por\s+acci[oó]n\b/.test(d)) return true;
  if (/\b(disminuci[oó]n|aumento)\s+nety?\s+de\b/.test(d)) return true;
  if (/\bajustes?\s+para\s+arribar\s+al\s+flujo\b/.test(d)) return true;
  if (/\bpago\s+de\s+(dividendos|impuesto|honorarios)\b/.test(d)) return true;
  if (/\bcobro\s+de\s+dividendos\b/.test(d)) return true;
  if (/\bdiferencia\s+de\s+cambio\s+neta\b/.test(d)) return true;
  return false;
}

export function esLineaProbableEstadoResultados(linea: LineaBalanceLike): boolean {
  const d = norm(linea.denominacionOriginal);
  if (!d) return false;
  if (/^ingresos por\b/.test(d)) return true;
  if (/^costo de\b/.test(d)) return true;
  if (/^costos de\b/.test(d)) return true;
  if (/^gastos de\b/.test(d)) return true;
  if (/\bganancia bruta\b/.test(d)) return true;
  if (/\bganancia procedente de operaciones\b/.test(d)) return true;
  if (/^ganancia atribuible a (propietarios|participaciones)/.test(d)) return true;
  if (/\bganancias\s*\([^)]*\)\s*de actividades\b/.test(d)) return true;
  if (/\bganancias\s*\([^)]*\)\s*de cambio\b/.test(d)) return true;
  if (/\bparticipaci[oó]n en ganancias\s*\([^)]*\)\s*de asociadas\b/.test(d)) return true;
  if (/\bresultado neto del ejercicio\b/.test(d)) return true;
  if (/\bimpuesto a las ganancias\b/.test(d)) return true;
  if (/\bresultado (operativo|bruto|antes de)\b/.test(d)) return true;
  if (/\bresultados financieros\b/.test(d)) return true;
  if (/\botros (ingresos|egresos|gastos)\b/.test(d)) return true;
  if (/\bingresos financieros\b/.test(d)) return true;
  return false;
}

export function esLineaComparativaEjercicio(linea: LineaBalanceLike): boolean {
  const d = norm(linea.denominacionOriginal);
  if (!d) return false;
  if (/\b(activo|pasivo|patrimonio neto|resultados)\s+31\/12\/20\d{2}\b/.test(d)) return true;
  if (/\bal\s+31\/12\/20\d{2}\b/.test(d) && /\btotal\b/.test(d)) return true;
  return false;
}

export function esRubroAgrupador(rubro: RubroBalanceLike): boolean {
  if (rubro.asignable === false) return true;
  return /^[123]$/.test(String(rubro.codigo).trim());
}

export function motivoExclusionCuadratura(
  linea: LineaBalanceLike,
  rubro: RubroBalanceLike | undefined
): MotivoExclusionCuadratura | null {
  if (linea.excluirDeCuadratura) return "manual";
  if (!rubro) return "sin_rubro";
  if (rubro.estadoFinanciero === "resultados") return "resultados";
  if (esLineaFilaTotalBalance(linea)) return "total";
  if (esRubroAgrupador(rubro)) return "agrupador";
  if (esLineaProbableFlujoEfectivo(linea)) return "flujo_efectivo";
  if (esLineaProbableFlujoCaja(linea)) return "flujo_caja";
  if (esLineaProbableTablaSegmentos(linea)) return "tabla_segmentos";
  if (esLineaNoBalanceDetalle(linea)) return "otro_estado";
  if (esLineaProbableEstadoResultados(linea)) return "er_en_balance";
  if (esLineaComparativaEjercicio(linea)) return "comparativa";
  return null;
}

export function lineaParticipaCuadratura(
  linea: LineaBalanceLike,
  rubro: RubroBalanceLike | undefined
): boolean {
  return motivoExclusionCuadratura(linea, rubro) === null;
}

export function denomBaseParaEscala(linea: LineaBalanceLike): string {
  let d = norm(linea.denominacionOriginal);
  d = d.replace(/\s+\d{1,3}$/, "");
  return d;
}

/** Misma partida con monto ×1000: conserva el de mayor magnitud. */
export function colapsarDuplicadosEscala<T extends LineaBalanceLike & { id: string }>(
  lineas: T[]
): T[] {
  const byDenom = new Map<string, T[]>();
  for (const l of lineas) {
    const k = denomBaseParaEscala(l);
    const g = byDenom.get(k) ?? [];
    g.push(l);
    byDenom.set(k, g);
  }

  const out: T[] = [];
  for (const grupo of byDenom.values()) {
    if (grupo.length <= 1) {
      out.push(grupo[0]!);
      continue;
    }
    const ordenadas = [...grupo].sort(
      (a, b) => Math.abs(montoLineaBalance(b)) - Math.abs(montoLineaBalance(a))
    );
    const descartadas = new Set<string>();
    for (let i = 0; i < ordenadas.length; i++) {
      const mayor = ordenadas[i]!;
      if (descartadas.has(mayor.id)) continue;
      const mMayor = Math.abs(montoLineaBalance(mayor));
      for (let j = i + 1; j < ordenadas.length; j++) {
        const menor = ordenadas[j]!;
        if (descartadas.has(menor.id)) continue;
        const mMenor = Math.abs(montoLineaBalance(menor));
        if (mMenor === 0) continue;
        const ratio = mMayor / mMenor;
        if (ratio >= 900 && ratio <= 1100) descartadas.add(menor.id);
      }
      if (!descartadas.has(mayor.id)) {
        out.push(mayor);
        descartadas.add(mayor.id);
      }
    }
  }
  return out;
}
