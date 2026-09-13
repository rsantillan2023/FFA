import type { RubroRef } from "../types.js";



export interface PlanStructureValidation {

  ok: boolean;

  errores: string[];

}



/** E.18 — patrimonio y pasivo deben ser ramas raíz separadas. */

export function validatePlanStructure(rubros: RubroRef[]): PlanStructureValidation {

  const errores: string[] = [];

  const roots = rubros.filter((r) => !r.padreId);

  const estadosRaiz = new Set(roots.map((r) => r.estadoFinanciero));



  if (!estadosRaiz.has("pasivo")) {

    errores.push("Falta rama raíz de pasivo (E.18)");

  }

  if (!estadosRaiz.has("patrimonio")) {

    errores.push("Falta rama raíz de patrimonio explícita (E.6/E.18)");

  }



  const pasivoNc = rubros.filter(

    (r) => r.estadoFinanciero === "pasivo" && r.corriente === false

  );

  if (pasivoNc.length === 0) {

    errores.push("Sin rubros de pasivo no corriente (E.7)");

  }



  const patrimonio = rubros.filter((r) => r.estadoFinanciero === "patrimonio");

  if (patrimonio.length < 2) {

    errores.push("Patrimonio debe incluir al menos dos rubros explícitos (E.6)");

  }



  const byId = new Map(rubros.map((r) => [r.id, r]));

  for (const r of rubros) {

    if (r.estadoFinanciero !== "patrimonio" || !r.padreId) continue;

    const padre = byId.get(r.padreId);

    if (padre?.estadoFinanciero === "pasivo") {

      errores.push(`Rubro ${r.codigo} patrimonio bajo pasivo — deben estar separados (E.18)`);

    }

  }



  return { ok: errores.length === 0, errores };

}


