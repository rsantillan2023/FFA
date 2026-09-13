export * from "./types.js";
export { extractMock } from "./extract/mock-provider.js";
export {
  extractDocument,
  validateExtractResult,
  ExtractValidationError,
  type ExtractDocumentInput,
  type ExtractionProviderName,
} from "./extract/extract-provider.js";
export { normalizeExtractResult } from "./normalize/normalize-lines.js";
export { normalizarPeriodo } from "./normalize/normalize-metadata.js";
export {
  classifyLines,
  calcularConfianzaGlobal,
  resolveAsistida,
  scoreRubroCandidates,
  type ClassifyInput,
} from "./classify/classify-lines.js";
export {
  sugerirClasificacionIa,
  ClasificacionIaNoDisponibleError,
  type SugerirClasificacionIaInput,
  type SugerenciaClasificacionIaResult,
} from "./classify/sugerir-ia.js";
export { validateCase } from "./validate/cuadratura.js";
export {
  computeIndicators,
  buildFormulaScope,
  type IndicadorDefinicion,
  type IndicadorResultado,
  type FichaMontos,
} from "./indicators/compute-indicators.js";
export { normalizarDenominacion, contienePatron } from "./utils/text.js";
export { analyzeDocument, type PreprocessAnalysis } from "./preprocess/analyze-document.js";
export { validatePlanStructure } from "./plan/validate-structure.js";
export { renderPdfToPngPages, renderPdfPageNumbers } from "./extract/pdf-render.js";
export { planPdfPagesForExtraction } from "./extract/pdf-extract-pages.js";
export { dedupeExtractLines, crossValidateAndDedupe } from "./extract/dedupe-extract.js";
export { postProcessExtractResult } from "./extract/post-process-extract.js";
export { normalizarConfianzaExtraccion } from "./extract/normalize-confianza.js";
export { enrichExtractResult } from "./extract/enrich-extract.js";
export {
  resolveExtractionProvider,
  openAiDisponible,
  anthropicDisponible,
} from "./extract/resolve-provider.js";
export { extractMetadataOpenAI } from "./extract/openai-provider.js";
export { extractMetadataAnthropic } from "./extract/anthropic-provider.js";
export { extractMetadataWithFallback } from "./extract/metadata-fallback.js";
export { parseMontoChileno } from "./utils/monto-chileno.js";
export {
  parseEjercicioPeriodo,
  parseFechaPeriodoString,
  fechaPeriodoToDate,
} from "./utils/fecha-periodo.js";
export { runWithIaContext, getIaContext, type IaContext } from "./ia/ia-context.js";
export { setIaLlamadaHandler, emitIaLlamada } from "./ia/registrar-llamada.js";
