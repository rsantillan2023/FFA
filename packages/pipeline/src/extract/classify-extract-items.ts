import type {
  ExtractedLine,
  IndicadorFinancieroExtracted,
  IndicadorOperativoExtracted,
} from "../types.js";
import { normalizarConfianzaExtraccion } from "./normalize-confianza.js";

const FINANCIERO_PATTERNS = [
  /\bebitda\b/i,
  /deuda neta/i,
  /margen ebitda/i,
  /margen bruto/i,
  /margen operativo/i,
  /margen neto/i,
  /ganancia por acci[oó]n/i,
  /utilidad por acci[oó]n/i,
  /\broe\b/i,
  /\broa\b/i,
  /deuda neta\s*\/\s*ebitda/i,
  /ratio/i,
];

const OPERATIVO_PATTERNS = [
  /\bcemento\b/i,
  /\bhormig[oó]n\b/i,
  /\bferroviario\b/i,
  /\bagregados\b/i,
  /\btoneladas?\b/i,
  /\bm[e³3]\b/i,
  /\bvolumen\b/i,
  /\bunidades vendidas\b/i,
  /\bproducci[oó]n\b/i,
  /variaci[oó]n\s*%/i,
  /millones de toneladas/i,
];

function isPorcentajeValor(valor: number, denom: string): boolean {
  return /%/.test(denom) || (Math.abs(valor) <= 100 && /margen|variaci[oó]n|%/.test(denom));
}

function isRatio(denom: string): boolean {
  return /\/|ratio|veces|x ebitda/i.test(denom);
}

function esCuentaContableCanonica(linea: ExtractedLine): boolean {
  if (linea.fuentePrioridad !== "canonico") return false;
  return ["balance", "resultados", "flujo_efectivo"].includes(linea.seccionPagina ?? "");
}

function esIndicadorFinanciero(linea: ExtractedLine): boolean {
  const denom = linea.denominacionOriginal;
  if (denom.length > 80) return false;
  if (!FINANCIERO_PATTERNS.some((p) => p.test(denom))) return false;
  if (esCuentaContableCanonica(linea) && !/ebitda|deuda neta|margen|ratio/i.test(denom)) return false;
  return (
    linea.seccionPagina === "resumen_ejecutivo" ||
    linea.fuentePrioridad === "resumen" ||
    linea.fuentePrioridad === "operativo" ||
    /ajustado|margen|deuda|ratio|por acci[oó]n/i.test(denom)
  );
}

function esIndicadorOperativo(linea: ExtractedLine): boolean {
  const denom = linea.denominacionOriginal;
  if (denom.length > 80) return false;
  if (linea.seccionPagina === "operativo" || linea.fuentePrioridad === "operativo") {
    return OPERATIVO_PATTERNS.some((p) => p.test(denom));
  }
  return false;
}

export interface ClasificacionExtractItems {
  lineasContables: ExtractedLine[];
  indicadoresFinancieros: IndicadorFinancieroExtracted[];
  indicadoresOperativos: IndicadorOperativoExtracted[];
  reclasificadosFinancieros: number;
  reclasificadosOperativos: number;
}

/** Separa cuentas contables de indicadores financieros y operativos. */
export function clasificarItemsExtract(rawLineas: ExtractedLine[]): ClasificacionExtractItems {
  const lineasContables: ExtractedLine[] = [];
  const indicadoresFinancieros: IndicadorFinancieroExtracted[] = [];
  const indicadoresOperativos: IndicadorOperativoExtracted[] = [];
  let reclasificadosFinancieros = 0;
  let reclasificadosOperativos = 0;

  for (const linea of rawLineas) {
    const denom = linea.denominacionOriginal;
    const conf = normalizarConfianzaExtraccion(linea.confianzaExtraccion);
    const valor = linea.montoNormalizado ?? linea.montoOriginal;

    if (esIndicadorOperativo(linea)) {
      indicadoresOperativos.push({
        denominacion: denom,
        valor,
        unidad: /%/.test(denom) ? "porcentaje" : /tonelada|m3|m³|volumen/i.test(denom) ? "volumen" : "otro",
        paginaNumero: linea.paginaNumero,
        seccionPagina: linea.seccionPagina,
        confianzaExtraccion: conf,
      });
      reclasificadosOperativos += 1;
      continue;
    }

    if (esIndicadorFinanciero(linea)) {
      indicadoresFinancieros.push({
        denominacion: denom,
        valor,
        unidad: isRatio(denom) ? "ratio" : isPorcentajeValor(valor, denom) ? "porcentaje" : "moneda",
        moneda: linea.moneda,
        escalaFactor: linea.escalaFactor,
        periodo: linea.periodo,
        paginaNumero: linea.paginaNumero,
        seccionPagina: linea.seccionPagina,
        fuentePrioridad: linea.fuentePrioridad,
        confianzaExtraccion: conf,
      });
      reclasificadosFinancieros += 1;
      continue;
    }

    lineasContables.push({
      ...linea,
      confianzaExtraccion: conf,
      metodoExtraccion: linea.metodoExtraccion ?? "vision_llm",
    });
  }

  return {
    lineasContables,
    indicadoresFinancieros,
    indicadoresOperativos,
    reclasificadosFinancieros,
    reclasificadosOperativos,
  };
}
