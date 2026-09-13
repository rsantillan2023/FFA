export type LocaleNumero = "es-AR" | "es-CL" | "en-US" | "mixto" | "indeterminado";

export interface ParseMontoResult {
  valor: number;
  montoOriginalTexto: string;
  montoNormalizado: number;
  localeDetectado: LocaleNumero;
  separadorMiles?: "." | "," | " " | "";
  separadorDecimal?: "." | ",";
}

export interface LocaleDetectContext {
  moneda?: string;
  escalaFactor?: number;
  escala?: string;
  muestrasTexto?: string[];
}

function stripNumero(raw: string): { s: string; neg: boolean } {
  let s = raw.trim().replace(/^\$?\s*[A-Z]{2,3}?\s*/i, "").replace(/\s/g, "");
  const neg = (s.startsWith("(") && s.endsWith(")")) || s.startsWith("-");
  if (s.startsWith("(") && s.endsWith(")")) s = s.slice(1, -1);
  s = s.replace(/^\+/, "").replace(/^-/, "");
  return { s, neg };
}

/** Detecta convención numérica predominante del documento. */
export function detectarLocaleNumerico(ctx: LocaleDetectContext): LocaleNumero {
  const samples = ctx.muestrasTexto ?? [];
  let esAr = 0;
  let esCl = 0;
  let enUs = 0;

  for (const raw of samples) {
    const { s } = stripNumero(raw);
    if (!s) continue;
    if (/\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) esAr += 2;
    else if (/\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) enUs += 2;
    else if (/\d{1,3}(\.\d{3})+$/.test(s)) esAr += 1;
    else if (/,/.test(s) && !/\./.test(s)) esCl += 1;
  }

  if (ctx.moneda === "ARS") esAr += 3;
  if (ctx.moneda === "CLP") esCl += 3;
  if (ctx.moneda === "USD") enUs += 2;

  const max = Math.max(esAr, esCl, enUs);
  if (max === 0) return "indeterminado";
  if (esAr === max) return "es-AR";
  if (enUs === max) return "en-US";
  if (esCl === max) return "es-CL";
  return "mixto";
}

function parseWithSeparadores(
  s: string,
  sepMiles: "." | "," | " " | "",
  sepDecimal: "." | ","
): number {
  let t = s;
  if (sepMiles) t = t.split(sepMiles).join("");
  if (sepDecimal === ",") t = t.replace(",", ".");
  return Number.parseFloat(t);
}

/** Parsea un monto respetando locale detectado o inferido del texto. */
export function parseMontoLocale(
  raw: string | number,
  ctx: LocaleDetectContext & { localePreferido?: LocaleNumero } = {}
): ParseMontoResult {
  if (typeof raw === "number") {
    const texto = String(raw);
    const corregido = corregirNumeroSinTexto(raw, ctx);
    return {
      valor: corregido,
      montoOriginalTexto: texto,
      montoNormalizado: corregido,
      localeDetectado: ctx.localePreferido ?? detectarLocaleNumerico(ctx),
    };
  }

  const original = raw.trim();
  const { s, neg } = stripNumero(original);
  if (!s) {
    return {
      valor: 0,
      montoOriginalTexto: original,
      montoNormalizado: 0,
      localeDetectado: ctx.localePreferido ?? "indeterminado",
    };
  }

  const locale = ctx.localePreferido ?? detectarLocaleNumerico({ ...ctx, muestrasTexto: [original] });
  let valor = 0;
  let sepMiles: "." | "," | " " | "" = "";
  let sepDecimal: "." | "," = ".";

  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      sepMiles = ".";
      sepDecimal = ",";
    } else {
      sepMiles = ",";
      sepDecimal = ".";
    }
    valor = parseWithSeparadores(s, sepMiles, sepDecimal);
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    sepMiles = ".";
    valor = parseWithSeparadores(s, ".", ".");
  } else if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    sepMiles = ",";
    valor = parseWithSeparadores(s, ",", ".");
  } else if (s.includes(".") && /^\d+\.\d{1,2}$/.test(s)) {
    sepDecimal = ".";
    valor = Number.parseFloat(s);
  } else if (s.includes(",") && /^\d+,\d+$/.test(s)) {
    sepDecimal = ",";
    valor = parseWithSeparadores(s, "", ",");
  } else if (locale === "es-AR" && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    sepMiles = ".";
    valor = parseWithSeparadores(s, ".", ".");
  } else {
    valor = Number.parseFloat(s.replace(",", "."));
  }

  if (Number.isNaN(valor)) valor = 0;
  if (neg) valor = -valor;

  return {
    valor,
    montoOriginalTexto: original,
    montoNormalizado: valor,
    localeDetectado: locale,
    separadorMiles: sepMiles || undefined,
    separadorDecimal: sepDecimal,
  };
}

/** Corrige JSON numérico cuando el LLM interpretó miles con punto decimal (31.416 → 31416). */
function corregirNumeroSinTexto(n: number, ctx: LocaleDetectContext): number {
  if (!Number.isFinite(n) || n === 0) return n;
  const abs = Math.abs(n);
  const str = String(n);

  const escalaMillones = ctx.escalaFactor === 1_000_000 || ctx.escala === "millones";

  // Patrón XX.XXX — miles mal leídos como decimal en escala millones
  if (/^\d{1,3}\.\d{3}$/.test(str) && abs < 1000) {
    return Math.sign(n) * Math.round(abs * 1000);
  }

  // Valores muy chicos en millones probablemente están sin escala aplicada
  if (escalaMillones && abs > 0 && abs < 500 && /^\d+\.\d+$/.test(str)) {
    const parts = str.split(".");
    if (parts[1]?.length === 3) {
      return Math.sign(n) * Number.parseInt(parts.join(""), 10);
    }
  }

  return n;
}
