import type { LineaContableDto, RubroOptionDto } from "@ffa/shared";
import { EstadoFinanciero } from "@ffa/shared";

/** Firmas, matrículas y texto legal del PDF mal interpretado como línea contable. */
export function esLineaProbableRuidoExtraccion(linea: LineaContableDto): boolean {
  const d = linea.denominacionOriginal.trim().toLowerCase();
  if (!d || d.length > 220) return false;
  if (/\bmatr[ií]cula\b/.test(d)) return true;
  if (/\bcontador\s+p[uú]blico\b/.test(d)) return true;
  if (/\bc\.?\s*p\.?\s*n/.test(d)) return true;
  if (/\bcr\.?\s+[a-záéíóú]/i.test(linea.denominacionOriginal)) return true;
  if (/\bfirmad[oa]\s+por\b/.test(d)) return true;
  if (/\binforme\s+de\s+auditor/i.test(d) && !/\b\d{1,3}(\.\d{3})+\b/.test(d.slice(-30))) return true;
  if (/\bmillones,\s*en\s+comparaci[oó]n\b/.test(d)) return true;
  if (/\ben\s+comparaci[oó]n\s+con\s+ps\.?\b/.test(d)) return true;
  if (/^millones\b/.test(d) && !/\b\d{1,3}(\.\d{3})+\b/.test(d)) return true;
  if (/\bexpresados?\s+en\s+(pesos|miles|millones)\b/.test(d) && !(linea.montoNormalizado ?? linea.montoOriginal)) {
    return true;
  }
  if (/^por acci[oó]n\b/.test(d)) return true;
  if (/\btotalidad de la participaci[oó]n\b/.test(d)) return true;
  if (/\bmercado argentino de valores\b/.test(d)) return true;
  if (/\by la totalidad de la participaci[oó]n\b/.test(d)) return true;
  return false;
}

/** Narrativa, fragmentos OCR y líneas de ER/flujo fuera del balance. */
export function esLineaProbableRuidoOcrBalance(linea: LineaContableDto): boolean {
  const raw = linea.denominacionOriginal.trim();
  const d = raw.toLowerCase();
  if (!d) return false;

  if (/\b(\d{1,4})\s+\1\b/.test(raw)) return true;
  if (/\baumentaron\s+\d/i.test(d)) return true;
  if (/\b4t\d{2}\b/i.test(d)) return true;
  if (/efectivo y equivalentes.*(inicio|cierre|ejercicio|per[ií]odo)/i.test(d)) return true;
  if (/^al cierre del per/i.test(d)) return true;
  if (/^promedio$/i.test(d)) return true;
  if (/^a\)\s/i.test(d)) return true;
  if (/^diferido$/i.test(d)) return true;
  if (/^corriente$/i.test(d)) return true;
  if (/^ganancia (bruta|atribuible)/i.test(d)) return true;
  if (/^propietarios de la controladora$/i.test(d)) return true;
  if (/^ganancia\s*\(\s*p[eé]rdida\s*\)\s*neta/i.test(d)) return true;
  if (/resultado por exposici[oó]n al cambio del poder/i.test(d)) return true;
  if (/^pago de dividendos\s*-\s*-/i.test(d)) return true;
  return false;
}

/** Ruido unificado para revisión (legal + OCR + narrativa). */
export function esLineaProbableRuidoRevision(linea: LineaContableDto): boolean {
  return esLineaProbableRuidoExtraccion(linea) || esLineaProbableRuidoOcrBalance(linea);
}

/** Filas de subtotal/total del PDF — no son líneas de detalle para cuadratura. */
export function esLineaFilaTotalBalance(linea: LineaContableDto): boolean {
  const d = linea.denominacionOriginal.trim().toLowerCase();
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

/** Partidas típicas del estado de flujo de efectivo (no son balance). */
export function esLineaProbableFlujoEfectivo(linea: LineaContableDto): boolean {
  const d = linea.denominacionOriginal.trim().toLowerCase();
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

/** Movimientos de flujo de caja / financiación (pág. flujo de efectivo). */
export function esLineaProbableFlujoCaja(linea: LineaContableDto): boolean {
  const raw = linea.denominacionOriginal.trim();
  const d = raw.toLowerCase();
  if (!d) return false;
  if (/\bflujo neto de efectivo\b/.test(d)) return true;
  if (/\bflujo de efectivo por actividades\b/.test(d)) return true;
  if (/^nuevos pr[eé]stamos$/.test(d)) return true;
  if (/^pagos de pr[eé]stamos$/.test(d)) return true;
  if (/^intereses pagados$/.test(d)) return true;
  if (/^intereses perdidos$/.test(d)) return true;
  if (/^pago de dividendos$/.test(d)) return true;
  if (/^deudas por arrendamiento$/.test(d)) return true;
  if (/^emisi[oó]n de obligaciones/.test(d)) return true;
  if (/^compra de acciones propias/.test(d)) return true;
  if (/^variaci[oó]n neta del efectivo/.test(d)) return true;
  if (/^efectivo y equivalentes al (inicio|cierre)/.test(d)) return true;
  if (/^ingresos por vencimientos de inversiones$/.test(d)) return true;
  if (/^adquisici[oó]n de (intangibles|inversiones|propiedades)/.test(d)) return true;
  if (/^ingresos por venta de propiedades/.test(d)) return true;
  if (/^aportes al f\.?f\.?f/.test(d)) return true;
  if (/^impuesto a las ganancias pagado$/.test(d)) return true;
  if (/^cambios en activos y pasivos operacionales$/.test(d)) return true;
  return false;
}

/** Filas típicas de tabla de segmentos (Cemento, Hormigón, % OCR). */
export function esLineaProbableTablaSegmentos(linea: LineaContableDto): boolean {
  const raw = linea.denominacionOriginal.trim();
  const d = raw.toLowerCase();
  if (!d) return false;
  if (/^ingresos por ventas netos/.test(d)) return true;
  if (/^costo de ventas\s/.test(d) && /\d+[,.]?\d*\s*%\s*\d/.test(raw)) return true;
  if (/^gastos de comercializaci[oó]n/.test(d) && /100[,.]?0?\s*%/.test(raw)) return true;
  if (/^depreciaciones y amortizaciones\s/.test(d) && /100[,.]?0?\s*%/.test(raw)) return true;
  if (/^ebitda ajustado/.test(d)) return true;
  if (/^partidas reconciliatorias/.test(d)) return true;
  if (/^cemento,\s*alba[nñ]iler[ií]a\s+y\s+cal/.test(d)) return true;
  if (/^hormig[oó]n\b/.test(d) && (/\d+[,.]?\d*\s*%/.test(raw) || d === "hormigon")) return true;
  if (/^ferroviario\b/.test(d) && (/\d+[,.]?\d*\s*%/.test(raw) || d === "ferroviario")) return true;
  if (/^agregados\b/.test(d) && (/\d+[,.]?\d*\s*%/.test(raw) || d === "agregados")) return true;
  if (/^eliminaciones$/.test(d)) return true;
  if (/^otros$/.test(d) && /\d+[,.]?\d*\s*%/.test(raw)) return true;
  if (/\d+[,.]?\d*\s*%\s+\d+[,.]?\d*\s*%/.test(raw)) return true;
  if (/\d+\s+\d+[,.]?\d*\s*%\s+\d+/.test(raw)) return true;
  return false;
}

/** Partidas de estado de resultados extraídas en el balance por error. */
export function esLineaProbableEstadoResultados(linea: LineaContableDto): boolean {
  const d = linea.denominacionOriginal.trim().toLowerCase();
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

/** Columnas comparativas por ejercicio (no sumar 2023 y 2024 a la vez). */
export function esLineaComparativaEjercicio(linea: LineaContableDto): boolean {
  const d = linea.denominacionOriginal.trim().toLowerCase();
  if (!d) return false;
  if (/\b(activo|pasivo|patrimonio neto|resultados)\s+31\/12\/20\d{2}\b/.test(d)) return true;
  if (/\bal\s+31\/12\/20\d{2}\b/.test(d) && /\btotal\b/.test(d)) return true;
  return false;
}

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
  | "manual"
  | "otro_estado";

export function motivoExclusionCuadratura(
  linea: LineaContableDto,
  rubro: RubroOptionDto | undefined
): MotivoExclusionCuadratura | null {
  if (linea.excluirDeCuadratura) {
    const m = linea.motivoExclusionCuadratura;
    if (m === "otro_estado" || m === "total" || m === "manual") return m;
    return "manual";
  }
  if (!rubro) return "sin_rubro";
  if (rubro.estadoFinanciero === EstadoFinanciero.RESULTADOS) return "resultados";
  if (esLineaFilaTotalBalance(linea)) return "total";
  if (rubro.asignable === false) return "agrupador";
  if (esLineaProbableRuidoExtraccion(linea)) return "ruido";
  if (esLineaProbableFlujoEfectivo(linea)) return "flujo_efectivo";
  if (esLineaProbableFlujoCaja(linea)) return "flujo_caja";
  if (esLineaProbableTablaSegmentos(linea)) return "tabla_segmentos";
  if (esLineaProbableEstadoResultados(linea)) return "er_en_balance";
  if (esLineaComparativaEjercicio(linea)) return "comparativa";
  return null;
}

/** Líneas de detalle del balance que deben sumar en Activo = Pasivo + Patrimonio. */
export function lineaParticipaCuadratura(
  linea: LineaContableDto,
  rubro: RubroOptionDto | undefined
): boolean {
  return motivoExclusionCuadratura(linea, rubro) === null;
}
