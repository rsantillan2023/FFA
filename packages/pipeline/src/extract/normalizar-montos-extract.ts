import type { ExtractedLine, ExtractedMetadata, ExtractResult } from "../types.js";
import { inferPeriodoFromColumna } from "./infer-periodo.js";
import { detectarLocaleNumerico, parseMontoLocale, type LocaleNumero } from "./parse-monto-locale.js";

function collectMuestrasMontos(lineas: ExtractedLine[]): string[] {
  const out: string[] = [];
  for (const l of lineas) {
    if (l.montoOriginalTexto) out.push(l.montoOriginalTexto);
    else if (typeof l.montoOriginal === "number") out.push(String(l.montoOriginal));
  }
  return out;
}

export function normalizarMontosLinea(
  linea: ExtractedLine,
  locale: LocaleNumero,
  ctx: { moneda?: string; escalaFactor?: number; escala?: string }
): ExtractedLine {
  const raw = linea.montoOriginalTexto ?? linea.montoOriginal;
  const parsed = parseMontoLocale(raw, {
    localePreferido: locale,
    moneda: ctx.moneda ?? linea.moneda,
    escalaFactor: ctx.escalaFactor ?? linea.escalaFactor,
    escala: ctx.escala,
    muestrasTexto: [String(raw)],
  });

  const periodo = linea.periodo ?? inferPeriodoFromColumna(linea.columnaOrigen);

  return {
    ...linea,
    montoOriginal: parsed.montoNormalizado,
    montoNormalizado: parsed.montoNormalizado,
    montoOriginalTexto: parsed.montoOriginalTexto,
    localeDetectado: parsed.localeDetectado,
    separadorMiles: parsed.separadorMiles,
    separadorDecimal: parsed.separadorDecimal,
    periodo,
  };
}

export function normalizarMontosExtractResult(result: ExtractResult): ExtractResult {
  const metadata = result.metadata;
  const locale = detectarLocaleNumerico({
    moneda: metadata.moneda,
    escalaFactor: metadata.escalaFactor,
    escala: metadata.escala,
    muestrasTexto: collectMuestrasMontos(result.lineas),
  });

  const ctx = {
    moneda: metadata.moneda,
    escalaFactor: metadata.escalaFactor,
    escala: metadata.escala,
  };

  const lineas = result.lineas.map((l) => normalizarMontosLinea(l, locale, ctx));

  return {
    ...result,
    lineas,
    metadata: {
      ...metadata,
      localeNumerico: locale,
    } as ExtractedMetadata & { localeNumerico?: string },
  };
}
