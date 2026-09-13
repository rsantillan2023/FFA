import type { ExtractResult } from "../types.js";
import { normalizarPeriodo } from "../normalize/normalize-metadata.js";
import { parseMontoLocale } from "./parse-monto-locale.js";
import { normalizarConfianzaExtraccion } from "./normalize-confianza.js";

export class ExtractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractValidationError";
  }
}

const TIPOS_DOCUMENTO_VALIDOS = new Set([
  "balance_8col",
  "balance_clasificado",
  "estado_resultados",
  "ifrs",
  "mixto",
  "desconocido",
]);

function normalizeTipoDocumento(tipo: string): string {
  if (TIPOS_DOCUMENTO_VALIDOS.has(tipo)) return tipo;
  if (tipo === "flujo_efectivo") return "mixto";
  return "desconocido";
}

/** Normaliza montos/páginas que vienen como string desde modelos de visión. */
export function sanitizeExtractResult(result: ExtractResult): ExtractResult {
  return {
    ...result,
    tipoDocumento: normalizeTipoDocumento(result.tipoDocumento),
    metadata: {
      ...result.metadata,
      periodo: normalizarPeriodo(result.metadata?.periodo),
    },
    lineas: result.lineas
      .map((linea) => {
        const raw = linea.montoOriginalTexto ?? linea.montoOriginal;
        const parsed = parseMontoLocale(raw, { moneda: result.metadata.moneda, escala: result.metadata.escala, escalaFactor: result.metadata.escalaFactor });
        return {
          ...linea,
          denominacionOriginal: linea.denominacionOriginal?.trim() ?? "",
          montoOriginal: parsed.montoNormalizado,
          montoOriginalTexto: parsed.montoOriginalTexto,
          montoNormalizado: parsed.montoNormalizado,
          localeDetectado: parsed.localeDetectado,
          separadorMiles: parsed.separadorMiles,
          separadorDecimal: parsed.separadorDecimal,
          paginaNumero: Math.max(1, Number(linea.paginaNumero) || 1),
          confianzaExtraccion: normalizarConfianzaExtraccion(linea.confianzaExtraccion),
          seccionPagina: linea.seccionPagina,
          fuentePrioridad: linea.fuentePrioridad,
          estadoFinancieroLinea: linea.estadoFinancieroLinea,
        };
      })
      .filter((linea) => linea.denominacionOriginal.length > 0),
  };
}

/** Valida esquema mínimo C.6 — lanza si la extracción no es utilizable. */
export function validateExtractResult(result: ExtractResult): void {
  if (!result.tipoDocumento) {
    throw new ExtractValidationError("tipoDocumento requerido");
  }
  if (!Array.isArray(result.lineas) || result.lineas.length === 0) {
    throw new ExtractValidationError("Se requiere al menos una línea extraída");
  }
  for (const [i, linea] of result.lineas.entries()) {
    if (!linea.denominacionOriginal?.trim()) {
      throw new ExtractValidationError(`Línea ${i + 1}: denominación vacía`);
    }
    if (typeof linea.montoOriginal !== "number" || Number.isNaN(linea.montoOriginal)) {
      throw new ExtractValidationError(`Línea ${i + 1}: monto inválido`);
    }
    if (!linea.paginaNumero || linea.paginaNumero < 1) {
      throw new ExtractValidationError(`Línea ${i + 1}: página inválida`);
    }
  }
}
