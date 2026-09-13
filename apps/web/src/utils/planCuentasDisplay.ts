import type { RubroInstitucionalDto } from "@ffa/shared";
import { EstadoFinanciero } from "@ffa/shared";

export type PlanVistaModo = "arbol" | "tabla" | "secciones";

export interface RubroPlano extends RubroInstitucionalDto {
  depth: number;
}

export const ESTADO_FINANCIERO_META: Record<
  string,
  { label: string; icon: string; color: string; bg: string }
> = {
  [EstadoFinanciero.ACTIVO]: {
    label: "Activo",
    icon: "fas fa-arrow-trend-up",
    color: "#047857",
    bg: "#ecfdf5",
  },
  [EstadoFinanciero.PASIVO]: {
    label: "Pasivo",
    icon: "fas fa-arrow-trend-down",
    color: "#b45309",
    bg: "#fffbeb",
  },
  [EstadoFinanciero.PATRIMONIO]: {
    label: "Patrimonio",
    icon: "fas fa-landmark",
    color: "#6d28d9",
    bg: "#f5f3ff",
  },
  [EstadoFinanciero.RESULTADOS]: {
    label: "Resultados",
    icon: "fas fa-chart-line",
    color: "#0369a1",
    bg: "#e0f2fe",
  },
};

export const PLAN_ESTADO_LABELS: Record<string, string> = {
  borrador: "Borrador",
  pendiente_aprobacion: "Pendiente aprobación",
  aprobado: "Aprobado",
  obsoleto: "Obsoleto",
};

export function flattenRubros(rubros: RubroInstitucionalDto[], depth = 0): RubroPlano[] {
  const out: RubroPlano[] = [];
  for (const r of rubros) {
    out.push({ ...r, depth });
    if (r.hijos?.length) out.push(...flattenRubros(r.hijos, depth + 1));
  }
  return out;
}

export function rubroMatches(
  rubro: RubroInstitucionalDto,
  term: string,
  estado?: string,
  corriente?: "" | "si" | "no"
): boolean {
  const q = term.trim().toLowerCase();
  if (estado && rubro.estadoFinanciero !== estado) return false;
  if (corriente === "si" && rubro.corriente !== true) return false;
  if (corriente === "no" && rubro.corriente !== false) return false;
  if (!q) return true;
  const haystack = [
    rubro.codigo,
    rubro.nombre,
    rubro.padreCodigo ?? "",
    ...(rubro.aliases ?? []),
    rubro.notaMargen ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function filterRubroTree(
  rubros: RubroInstitucionalDto[],
  term: string,
  estado?: string,
  corriente?: "" | "si" | "no"
): RubroInstitucionalDto[] {
  const out: RubroInstitucionalDto[] = [];
  for (const r of rubros) {
    const hijos = r.hijos?.length ? filterRubroTree(r.hijos, term, estado, corriente) : [];
    const selfMatch = rubroMatches(r, term, estado, corriente);
    if (selfMatch || hijos.length) {
      out.push({ ...r, hijos: hijos.length ? hijos : selfMatch ? r.hijos : [] });
    }
  }
  return out;
}

export function planStats(rubros: RubroInstitucionalDto[]): {
  total: number;
  porEstado: Record<string, number>;
  maxDepth: number;
} {
  const flat = flattenRubros(rubros);
  const porEstado: Record<string, number> = {};
  let maxDepth = 0;
  for (const r of flat) {
    porEstado[r.estadoFinanciero] = (porEstado[r.estadoFinanciero] ?? 0) + 1;
    maxDepth = Math.max(maxDepth, r.depth);
  }
  return { total: flat.length, porEstado, maxDepth };
}

export function rubrosPorSeccion(
  rubros: RubroInstitucionalDto[],
  term: string,
  estadoFiltro?: string,
  corriente?: "" | "si" | "no"
): Record<string, RubroInstitucionalDto[]> {
  const filtered = filterRubroTree(rubros, term, estadoFiltro, corriente);
  const sections: Record<string, RubroInstitucionalDto[]> = {
    [EstadoFinanciero.ACTIVO]: [],
    [EstadoFinanciero.PASIVO]: [],
    [EstadoFinanciero.PATRIMONIO]: [],
    [EstadoFinanciero.RESULTADOS]: [],
  };
  for (const r of filtered) {
    const key = r.estadoFinanciero;
    if (sections[key]) sections[key].push(r);
  }
  return sections;
}
