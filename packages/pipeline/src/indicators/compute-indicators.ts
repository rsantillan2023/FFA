import { create, all } from "mathjs";
import type { RubroRef } from "../types.js";

const math = create(all);

export interface IndicadorDefinicion {
  codigo: string;
  nombre: string;
  categoria: string;
  formula: string;
  rubrosRequeridos: string[];
  obligatorio: boolean;
}

export interface IndicadorResultado {
  codigo: string;
  nombre: string;
  valor: number | null;
  calculable: boolean;
  error?: string;
  lineasParticipantes: string[];
}

export interface FichaMontos {
  detalleBalance: { codigo: string; monto: number; lineasIds: string[] }[];
  detalleResultados: { codigo: string; monto: number; lineasIds: string[] }[];
  rubros: RubroRef[];
}

function signedMonto(monto: number, convencion: "normal" | "invertido"): number {
  return convencion === "invertido" ? -Math.abs(monto) : monto;
}

/** Construye variables AC_CORRIENTE, R_1_1_01, etc. desde ficha + rubros. */
export function buildFormulaScope(ficha: FichaMontos): Record<string, number> {
  const rubroByCodigo = new Map(ficha.rubros.map((r) => [r.codigo, r]));
  const scope: Record<string, number> = {
    AC_CORRIENTE: 0,
    AC_NO_CORRIENTE: 0,
    PC_CORRIENTE: 0,
    PC_NO_CORRIENTE: 0,
    PATRIMONIO: 0,
    ACTIVO: 0,
    PASIVO: 0,
  };

  for (const d of ficha.detalleBalance) {
    const rubro = rubroByCodigo.get(d.codigo);
    if (!rubro) continue;
    const m = signedMonto(d.monto, rubro.convencionSigno);
    const key = `R_${d.codigo.replace(/\./g, "_")}`;
    scope[key] = m;

    if (rubro.estadoFinanciero === "activo") {
      scope.ACTIVO += m;
      if (rubro.corriente) scope.AC_CORRIENTE += m;
      else scope.AC_NO_CORRIENTE += m;
    } else if (rubro.estadoFinanciero === "pasivo") {
      scope.PASIVO += m;
      if (rubro.corriente) scope.PC_CORRIENTE += m;
      else scope.PC_NO_CORRIENTE += m;
    } else if (rubro.estadoFinanciero === "patrimonio") {
      scope.PATRIMONIO += m;
    }
  }

  for (const d of ficha.detalleResultados) {
    const rubro = rubroByCodigo.get(d.codigo);
    if (!rubro) continue;
    scope[`R_${d.codigo.replace(/\./g, "_")}`] = signedMonto(d.monto, rubro.convencionSigno);
  }

  return scope;
}

export function computeIndicators(
  ficha: FichaMontos,
  definiciones: IndicadorDefinicion[]
): IndicadorResultado[] {
  const scope = buildFormulaScope(ficha);

  return definiciones.map((def) => {
    const lineasParticipantes: string[] = [];
    for (const cod of def.rubrosRequeridos) {
      const entries = [...ficha.detalleBalance, ...ficha.detalleResultados].filter(
        (d) => d.codigo === cod || d.codigo.startsWith(`${cod}.`)
      );
      for (const e of entries) lineasParticipantes.push(...e.lineasIds);
    }

    const missing = def.rubrosRequeridos.filter((cod) => {
      const has = [...ficha.detalleBalance, ...ficha.detalleResultados].some(
        (d) => d.codigo === cod || d.codigo.startsWith(`${cod}.`)
      );
      return !has;
    });

    if (missing.length > 0) {
      return {
        codigo: def.codigo,
        nombre: def.nombre,
        valor: null,
        calculable: false,
        error: `Faltan rubros: ${missing.join(", ")}`,
        lineasParticipantes,
      };
    }

    try {
      const valor = math.evaluate(def.formula, scope) as number;
      if (typeof valor !== "number" || !Number.isFinite(valor)) {
        throw new Error("Resultado no numérico");
      }
      return {
        codigo: def.codigo,
        nombre: def.nombre,
        valor: Math.round(valor * 1000) / 1000,
        calculable: true,
        lineasParticipantes,
      };
    } catch (err) {
      return {
        codigo: def.codigo,
        nombre: def.nombre,
        valor: null,
        calculable: false,
        error: err instanceof Error ? err.message : "Error de fórmula",
        lineasParticipantes,
      };
    }
  });
}
