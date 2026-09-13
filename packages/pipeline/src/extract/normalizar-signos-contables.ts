import type { ExtractedLine, ExtractResult } from "../types.js";
import { normalizarDenominacion } from "../utils/text.js";
import { parseMontoLocale } from "./parse-monto-locale.js";

/** Naturaleza contable inferida — convención FINYX (signo en montoNormalizado). */
export type NaturalezaContable =
  | "ingreso"
  | "costo"
  | "gasto"
  | "impuesto"
  | "financiero_ingreso"
  | "financiero_egreso"
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "activo"
  | "pasivo"
  | "patrimonio"
  | "resultado"
  | "flujo_entrada"
  | "flujo_salida"
  | "neutro";

const NATURALEZA_NEGATIVA: NaturalezaContable[] = [
  "costo",
  "gasto",
  "impuesto",
  "financiero_egreso",
  "ajuste_negativo",
  "flujo_salida",
];

function inferNaturaleza(linea: ExtractedLine): NaturalezaContable {
  const d = normalizarDenominacion(linea.denominacionOriginal);
  const seccion = linea.seccionPagina;
  const estado = linea.estadoFinancieroLinea;

  if (estado === "activo" || seccion === "balance" && /activo|inventario|caja|inversi|cr[eé]dito|deudor/.test(d)) {
    return "activo";
  }
  if (estado === "pasivo" || /pasivo|pr[eé]stamo|cuenta por pagar|deuda|provision|impuesto por pagar/.test(d)) {
    return "pasivo";
  }
  if (estado === "patrimonio" || /patrimonio|capital|reserva|ganancia acumulada/.test(d)) {
    return "patrimonio";
  }

  if (/costo de ventas|costo de los ingresos|costo directo/.test(d)) return "costo";
  if (/gasto|comercializaci|administraci|depreciaci|amortizaci|sueldo/.test(d)) return "gasto";
  if (/impuesto a las ganancias|impuesto corriente|impuesto diferido|impuesto a los d[eé]bitos/.test(d)) {
    return "impuesto";
  }
  if (/egreso financiero|intereses pagados|pago de|costos financieros/.test(d)) return "financiero_egreso";
  if (/ingreso financiero|intereses ganados|ingresos financieros/.test(d)) return "financiero_ingreso";
  if (/ingreso por ventas|ventas netas|ingresos ordinarios|otros ingresos/.test(d)) return "ingreso";
  if (/diferencia de cambio/.test(d) && /\(\s*\d/.test(linea.montoOriginalTexto ?? "")) return "ajuste_negativo";
  if (/diferencia de cambio|recpam|exposici[oó]n al cambio/.test(d)) return "ajuste_positivo";
  if (/adquisici|pago de|aporte|cancelaci|egreso|salida/.test(d) && seccion === "flujo_efectivo") return "flujo_salida";
  if (/ingreso por|emisión|nuevo pr[eé]stamo|entrada/.test(d) && seccion === "flujo_efectivo") return "flujo_entrada";
  if (/ganancia|p[eé]rdida|utilidad|resultado/.test(d)) return "resultado";

  return "neutro";
}

function textoIndicaNegativo(texto?: string): boolean {
  if (!texto?.trim()) return false;
  const t = texto.trim();
  return (t.startsWith("(") && t.endsWith(")")) || t.startsWith("-");
}

function textoIndicaPositivoExplicito(texto?: string): boolean {
  if (!texto?.trim()) return false;
  return texto.trim().startsWith("+");
}

/** Aplica convención de signo contable sobre montoNormalizado. */
export function normalizarSignoLinea(
  linea: ExtractedLine,
  ctx: { moneda?: string; escala?: string; escalaFactor?: number; locale?: string }
): ExtractedLine {
  const naturaleza = linea.naturaleza ?? inferNaturaleza(linea);
  const rawTexto = linea.montoOriginalTexto?.trim();

  let parsed = parseMontoLocale(rawTexto ?? linea.montoOriginal, {
    moneda: ctx.moneda ?? linea.moneda,
    escala: ctx.escala,
    escalaFactor: ctx.escalaFactor ?? linea.escalaFactor,
    localePreferido: (ctx.locale as "es-AR") ?? (linea.localeDetectado as "es-AR") ?? undefined,
  });

  let signed = parsed.montoNormalizado;

  if (textoIndicaNegativo(rawTexto)) {
    signed = -Math.abs(signed);
  } else if (
    NATURALEZA_NEGATIVA.includes(naturaleza) &&
    signed > 0 &&
    !textoIndicaPositivoExplicito(rawTexto)
  ) {
    // Convención FINYX: costos/gastos/egresos como negativos cuando el PDF usa paréntesis o convención implícita
    signed = -Math.abs(signed);
  }

  const montoAbsoluto = Math.abs(signed);

  return {
    ...linea,
    naturaleza,
    montoOriginalTexto: rawTexto ?? parsed.montoOriginalTexto,
    montoOriginal: signed,
    montoNormalizado: signed,
    montoAbsoluto,
    signoContable: signed < 0 ? "negativo" : signed > 0 ? "positivo" : "cero",
  };
}

export function normalizarSignosExtractResult(result: ExtractResult): ExtractResult {
  const ctx = {
    moneda: result.metadata.moneda,
    escala: result.metadata.escala,
    escalaFactor: result.metadata.escalaFactor,
    locale: (result.metadata as { localeNumerico?: string }).localeNumerico,
  };

  return {
    ...result,
    lineas: result.lineas.map((l) => normalizarSignoLinea(l, ctx)),
  };
}
