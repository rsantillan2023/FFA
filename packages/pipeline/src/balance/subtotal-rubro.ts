import type { ClassifiedLine, NormalizedLine, RubroRef } from "../types.js";
import { esLineaFilaTotalBalance } from "./balance-filters.js";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Mapeo de filas total/subtotal del PDF → rubro agrupador del plan (1, 1.1, 1.2, 2, …). */
const SUBTOTAL_AGRUPADOR_PATTERNS: Array<{ re: RegExp; codigo: string }> = [
  { re: /^activos no corrientes totales$/i, codigo: "1.1" },
  { re: /total activos no corrientes/i, codigo: "1.1" },
  { re: /^activos corrientes totales$/i, codigo: "1.2" },
  { re: /total activos corrientes/i, codigo: "1.2" },
  { re: /^total activos negocios\b/i, codigo: "1" },
  { re: /^total activos\b/i, codigo: "1" },
  { re: /total del activo/i, codigo: "1" },
  { re: /^pasivos no corrientes totales$/i, codigo: "2.1" },
  { re: /total pasivos no corrientes/i, codigo: "2.1" },
  { re: /^pasivos corrientes totales$/i, codigo: "2.2" },
  { re: /total pasivos corrientes/i, codigo: "2.2" },
  { re: /^total pasivos negocios\b/i, codigo: "2" },
  { re: /^total pasivos\b/i, codigo: "2" },
  { re: /^patrimonio total$/i, codigo: "3" },
  { re: /^total del patrimonio$/i, codigo: "3" },
  { re: /\bpatrimonio neto atribuible\b/i, codigo: "3.3" },
  { re: /\bpatrimonio atribuible\b/i, codigo: "3.3" },
  { re: /^atribuible a la participaci[oó]n/i, codigo: "3.3" },
];

const CODIGO_RAIZ_POR_ESTADO: Record<string, string> = {
  activo: "1",
  pasivo: "2",
  patrimonio: "3",
};

/** Sugiere código de rubro agrupador para una fila total/subtotal del balance. */
export function sugerirRubroAgrupadorSubtotal(
  denominacion: string,
  estadoFinanciero?: string
): string | null {
  const d = norm(denominacion);
  if (!d) return null;

  for (const { re, codigo } of SUBTOTAL_AGRUPADOR_PATTERNS) {
    if (re.test(d)) return codigo;
  }

  if (/\btotal(es)?\b/.test(d) || /\bsubtotal(es)?\b/.test(d)) {
    if (/activo/.test(d) && !/pasivo/.test(d)) {
      if (/no corriente/.test(d)) return "1.1";
      if (/corriente/.test(d)) return "1.2";
      return "1";
    }
    if (/pasivo/.test(d) && !/patrimonio/.test(d)) {
      if (/no corriente/.test(d)) return "2.1";
      if (/corriente/.test(d)) return "2.2";
      return "2";
    }
    if (/patrimonio/.test(d)) return "3";
  }

  if (estadoFinanciero && CODIGO_RAIZ_POR_ESTADO[estadoFinanciero]) {
    return CODIGO_RAIZ_POR_ESTADO[estadoFinanciero]!;
  }

  return null;
}

export function resolverRubroAgrupadorSubtotal(
  denominacion: string,
  rubros: RubroRef[],
  estadoFinanciero?: string
): RubroRef | undefined {
  const codigo = sugerirRubroAgrupadorSubtotal(denominacion, estadoFinanciero);
  if (!codigo) return undefined;
  return rubros.find((r) => r.codigo === codigo);
}

/** Clasifica subtotales con rubro agrupador del plan (visible en revisión, excluido de cuadratura). */
export function clasificarLineaSubtotalBalance(
  linea: NormalizedLine,
  rubros: RubroRef[],
  estadoFinanciero?: string
): ClassifiedLine {
  const rubro = resolverRubroAgrupadorSubtotal(linea.denominacionOriginal, rubros, estadoFinanciero);
  return {
    ...linea,
    rubroInstitucionalId: rubro?.id,
    rubroCodigo: rubro?.codigo,
    confianzaClasificacion: 92,
    requiereRevision: false,
    excluirDeCuadratura: true,
    motivoExclusionCuadratura: "total",
    origenClasificacion: "regla",
  };
}

export function esLineaSubtotalBalance(linea: {
  denominacionOriginal: string;
  montoOriginal: number;
  montoNormalizado?: number;
}): boolean {
  return esLineaFilaTotalBalance(linea);
}
