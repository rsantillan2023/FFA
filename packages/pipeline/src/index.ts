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
  tryClassifyDeterministic,
  classifyLineSemantico,
  buildClassifyLineContext,
  type ClassifyInput,
  type ClassifyLineContext,
} from "./classify/classify-lines.js";
export {
  classifyLinesWithIa,
  type ClassifyWithIaInput,
  type ClassifyWithIaContextoCaso,
} from "./classify/classify-lines-async.js";
export {
  sugerirClasificacionIa,
  ClasificacionIaNoDisponibleError,
  type SugerirClasificacionIaInput,
  type SugerenciaClasificacionIaResult,
} from "./classify/sugerir-ia.js";
export { validateCase } from "./validate/cuadratura.js";
export { lineasAlcanceBalance } from "./validate/alcance-balance.js";
export { computeCuadraturaBalance } from "./validate/balance-cuadratura.js";
export {
  computeIndicators,
  buildFormulaScope,
  type IndicadorDefinicion,
  type IndicadorResultado,
  type FichaMontos,
} from "./indicators/compute-indicators.js";
export { normalizarDenominacion, contienePatron } from "./utils/text.js";
export { analyzeDocument, type PreprocessAnalysis } from "./preprocess/analyze-document.js";
export {
  buildPreprocessCacheSnapshot,
  preprocessCacheEsValida,
  type PreprocessCacheSnapshot,
} from "./preprocess/preprocess-cache.js";
export { validatePlanStructure } from "./plan/validate-structure.js";
export {
  esRubroAsignable,
  filtrarRubrosAsignables,
  idsRubrosConHijos,
} from "./plan/rubros-asignables.js";
export {
  renderPdfToPngPages,
  renderPdfPageNumbers,
  renderPdfForPreprocess,
  type PreprocessRenderResult,
  type PdfRenderMetodo,
} from "./extract/pdf-render.js";
export {
  measureImageInkRatio,
  assessPageRenderQuality,
  type PageRenderQualityResult,
} from "./extract/pdf-render-quality.js";
export { getPdfNumPages } from "./extract/pdf-text-scan.js";
export {
  planPdfPagesForExtraction,
  buildProvenanceExtraccion,
  attachProvenanceExtraccion,
  type PdfExtractPagePlan,
} from "./extract/pdf-extract-pages.js";
export { planPaginasConClaudeMap, type ClaudePageMapResult } from "./extract/pdf-claude-map.js";
export {
  diagnosticarCuadraturaIa,
  type DiagnosticoCuadraturaInput,
  type DiagnosticoCuadraturaIaResult,
} from "./balance/diagnostico-cuadratura-ia.js";
export { dedupeExtractLines, crossValidateAndDedupe } from "./extract/dedupe-extract.js";
export { postProcessExtractResult } from "./extract/post-process-extract.js";
export {
  fusionarExtractTextoNativoPrimario,
  esPdfTextoNativoCandidato,
} from "./extract/extract-native-text-primary.js";
export {
  buildLineasDesdeTextoEscaneado,
  inferEstadoFinancieroDesdePagina,
  type BuildLineasTextoCtx,
} from "./extract/extraer-lineas-tabla-texto.js";
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
export {
  analizarBalance,
  detectarTestigosBalance,
  planificarReconciliacion,
  planificarRecuperacionBalance,
  type BalanceAnalisis,
  type TestigoBalance,
  type AccionReconciliacion,
  sugerirRubroCodigoBalance,
} from "./balance/reconcile-balance.js";
export {
  buscarFilaPdfPorMonto,
  denominacionConSeccionBalance,
  extractPdfPageTextRows,
  filaPdfYaExiste,
  montosCoinciden,
  parseFilasBalancePdfPage,
  TOLERANCIA_MONTO_BALANCE_ABS,
  TOLERANCIA_MONTO_BALANCE_REL,
  type FilaBalancePdf,
  type SeccionBalancePdf,
} from "./balance/parse-balance-pdf-page.js";
export {
  colapsarDuplicadosEscala,
  lineaParticipaCuadratura,
  motivoExclusionCuadratura,
  esLineaFilaTotalBalance,
  type MotivoExclusionCuadratura,
} from "./balance/balance-filters.js";
export {
  clasificarLineaSubtotalBalance,
  esLineaSubtotalBalance,
  resolverRubroAgrupadorSubtotal,
  sugerirRubroAgrupadorSubtotal,
} from "./balance/subtotal-rubro.js";
export { colapsarDuplicadosLineas } from "./balance/linea-duplicados.js";
export {
  dedupeFuzzyBalanceLineas,
  denomBaseBalance,
  montosCasiIguales,
  puntuacionConservarDedupeFuzzy,
} from "./balance/dedupe-fuzzy-balance.js";
export {
  calcularTotalesCuadraturaRevision,
  type TotalesCuadraturaRevision,
} from "./balance/totales-cuadratura-revision.js";
export {
  esLineaProbableRuidoExtraccion,
  esLineaProbableRuidoOcrBalance,
  esLineaSinSentidoContable,
  normalizarDenominacionOcrBalance,
  type LineaRuidoLike,
} from "./orchestrate/detect-ruido-extraccion.js";
export {
  detectarPaginasNoBalance,
  esLineaNoBalanceDetalle,
  esLineaProbableFlujoCaja,
  esLineaProbableTablaSegmentos,
  esLineaTituloTablaNoBalance,
} from "./orchestrate/detect-tablas-no-balance.js";
