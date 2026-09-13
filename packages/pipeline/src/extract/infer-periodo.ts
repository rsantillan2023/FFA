import type { PeriodoExtracted } from "../types.js";

/** Infiere período desde columnaOrigen / etiqueta de columna del documento. */
export function inferPeriodoFromColumna(columnaOrigen?: string): PeriodoExtracted | undefined {
  if (!columnaOrigen?.trim()) return undefined;
  const col = columnaOrigen.trim();

  const ejercicio = Number(/(?:^|\D)(20\d{2})(?:\D|$)/.exec(col)?.[1]);
  const ejercicioValido = Number.isFinite(ejercicio) ? ejercicio : undefined;

  let tipo: PeriodoExtracted["tipo"] = undefined;
  if (/trimestre|3 meses|tres meses|q[1-4]\s|1[tT]\s|2[tT]\s|3[tT]\s|4[tT]\s/i.test(col)) {
    tipo = "TRIMESTRAL";
  } else if (/semestre|6 meses/i.test(col)) {
    tipo = "SEMESTRAL";
  } else if (/ejercicio|anual|12 meses|doce meses/i.test(col) || ejercicioValido) {
    tipo = "ANUAL";
  }

  return {
    ejercicio: ejercicioValido,
    tipo,
    etiqueta: col,
    comparativo: /comparativo|vs\.|versus/i.test(col) || undefined,
  };
}

export function periodoDedupeKey(periodo?: PeriodoExtracted, columnaOrigen?: string): string {
  if (periodo?.ejercicio) {
    return `${periodo.tipo ?? "ANUAL"}|${periodo.ejercicio}|${periodo.etiqueta ?? ""}`;
  }
  const inferred = inferPeriodoFromColumna(columnaOrigen);
  if (inferred?.ejercicio) {
    return `${inferred.tipo ?? "ANUAL"}|${inferred.ejercicio}|${inferred.etiqueta ?? ""}`;
  }
  return normalizarColumnaPeriodo(columnaOrigen);
}

function normalizarColumnaPeriodo(columna?: string): string {
  if (!columna?.trim()) return "sin-periodo";
  return columna.trim().toLowerCase().replace(/\s+/g, " ");
}
