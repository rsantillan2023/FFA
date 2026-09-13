import type { ExtractResult, ExtractTotal } from "../types.js";

/** C.4 — detecta encabezados y totales parciales/generales desde líneas extraídas. */
export function enrichExtractResult(result: ExtractResult): ExtractResult {
  const encabezados: string[] = [];
  if (result.metadata.razonSocial) encabezados.push(result.metadata.razonSocial);
  if (result.metadata.rut) encabezados.push(`RUT ${result.metadata.rut}`);
  if (result.metadata.periodo?.ejercicio) {
    encabezados.push(`Ejercicio ${result.metadata.periodo.ejercicio}`);
  }

  const totales: ExtractTotal[] = [];
  for (const linea of result.lineas) {
    const d = linea.denominacionOriginal.toLowerCase();
    if (!/total|subtotal|suma/.test(d)) continue;
    let tipo: ExtractTotal["tipo"] = "parcial";
    if (/total general|total activo|total pasivo|total patrimonio/.test(d)) {
      tipo = "general";
    } else if (/subtotal/.test(d)) {
      tipo = "subtotal";
    }
    totales.push({
      denominacion: linea.denominacionOriginal,
      monto: linea.montoOriginal,
      tipo,
      paginaNumero: linea.paginaNumero,
    });
  }

  return {
    ...result,
    encabezados: encabezados.length ? encabezados : undefined,
    totales: totales.length ? totales : undefined,
  };
}
