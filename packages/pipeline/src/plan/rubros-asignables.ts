import type { RubroRef } from "../types.js";

/** Rubros que tienen al menos un hijo en el plan (agrupadores / raíces). */
export function idsRubrosConHijos(rubros: RubroRef[]): Set<string> {
  const ids = new Set<string>();
  for (const r of rubros) {
    if (r.padreId) ids.add(r.padreId);
  }
  return ids;
}

/** Rubro hoja — apto para imputar líneas (no es total ni agrupador). */
export function esRubroAsignable(rubro: RubroRef, rubros: RubroRef[]): boolean {
  const padres = idsRubrosConHijos(rubros);
  if (padres.has(rubro.id)) return false;
  // Códigos raíz típicos del plan institucional (1 / 2 / 3 sin detalle).
  if (/^[123]$/.test(rubro.codigo.trim())) return false;
  return true;
}

export function filtrarRubrosAsignables(rubros: RubroRef[]): RubroRef[] {
  if (!rubros.length) return rubros;
  return rubros.filter((r) => esRubroAsignable(r, rubros));
}
