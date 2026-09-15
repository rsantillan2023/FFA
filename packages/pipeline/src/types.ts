import type { EstadoFinanciero } from "@ffa/shared";

/** Rol de la página o sección dentro del documento financiero. */
export type SeccionPagina =
  | "balance"
  | "resultados"
  | "flujo_efectivo"
  | "notas"
  | "segmentos"
  | "resumen_ejecutivo"
  | "operativo"
  | "otro";

/** Prioridad de la fuente respecto al estado contable canónico. */
export type FuentePrioridad = "canonico" | "complementario" | "operativo" | "resumen";

export interface ExtractedLine {
  denominacionOriginal: string;
  codigoOrigen?: string;
  columnaOrigen?: string;
  montoOriginal: number;
  montoOriginalTexto?: string;
  montoNormalizado?: number;
  montoAbsoluto?: number;
  /** Naturaleza contable inferida — define convención de signo FINYX. */
  naturaleza?:
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
  signoContable?: "positivo" | "negativo" | "cero";
  localeDetectado?: string;
  separadorMiles?: "." | "," | " " | "";
  separadorDecimal?: "." | ",";
  paginaNumero: number;
  id?: string;
  esDuplicado?: boolean;
  fuenteCanonicaId?: string;
  /** Evidencias de apariciones duplicadas confirmadas (mismo valor normalizado). */
  evidenciasDuplicado?: { paginaNumero: number; montoNormalizado: number; id?: string }[];
  /** Confianza normalizada 0.00–1.00. */
  confianzaExtraccion?: number;
  bbox?: { x: number; y: number; w: number; h: number };
  seccionPagina?: SeccionPagina;
  fuentePrioridad?: FuentePrioridad;
  estadoFinancieroLinea?: EstadoFinanciero | "flujo";
  periodo?: PeriodoExtracted;
  moneda?: string;
  escalaFactor?: number;
  requiereRevision?: boolean;
  motivoRevision?: string;
  metodoExtraccion?: "vision_llm" | "heuristica" | "salvage_json";
}

/** Indicador financiero (EBITDA, deuda neta, márgenes) — no es cuenta contable. */
export interface IndicadorFinancieroExtracted {
  /** Alias legible — igual que denominacion si no se especifica nombre. */
  nombre?: string;
  denominacion: string;
  valor: number;
  unidad: "moneda" | "porcentaje" | "ratio" | "otro";
  origen?: "extraido" | "calculado";
  moneda?: string;
  escalaFactor?: number;
  periodo?: PeriodoExtracted;
  paginaNumero: number;
  seccionPagina?: SeccionPagina;
  fuentePrioridad?: FuentePrioridad;
  confianzaExtraccion?: number;
  requiereRevision?: boolean;
  motivoRevision?: string;
}

/** Indicador operativo (volúmenes, toneladas) — no es cuenta contable. */
export interface IndicadorOperativoExtracted {
  nombre?: string;
  denominacion: string;
  valor: number;
  unidad: "volumen" | "porcentaje" | "otro";
  origen?: "extraido" | "calculado";
  paginaNumero: number;
  seccionPagina?: SeccionPagina;
  confianzaExtraccion?: number;
}

export interface SeccionDetectada {
  tipo: SeccionPagina | "cambios_patrimonio" | "narrativa";
  paginaInicio: number;
  paginaFin?: number;
  titulo?: string;
  moneda?: string;
  escalaFactor?: number;
  confianza?: number;
}

export interface InconsistenciaExtract {
  concepto: string;
  valores: { valor: number; paginaNumero: number; seccionPagina?: SeccionPagina; fuentePrioridad?: FuentePrioridad }[];
  motivo: string;
}

export interface ControlAritmeticoExtract {
  id: string;
  descripcion: string;
  passed: boolean;
  esperado?: number;
  obtenido?: number;
  diferencia?: number;
  tolerancia?: number;
  paginaNumero?: number;
  /** Sección afectada — evita marcar balance por fallos de resultados. */
  seccionFinanciera?: SeccionPagina | "resultados" | "balance" | "flujo_efectivo";
  lineasInvolucradas?: string[];
}

export interface CoberturaTablaPagina {
  pagina: number;
  tipo: SeccionPagina;
  filasDetectadas: number;
  filasExtraidas: number;
  filasOmitidas: number;
  cobertura: number;
  filasDetectadasLista?: string[];
  filasExtraidasLista?: string[];
  filasOmitidasLista?: string[];
}

export interface CoberturaDesglose {
  coberturaEstados: number;
  coberturaPaginasRelevantes: number;
  coberturaLineas: number;
  calidadNumerica: number;
  coberturaGlobal: number;
  coberturaTablas?: CoberturaTablaPagina[];
}

/** Trazabilidad extracción IA vs heurística (F4). */
export interface ProvenanceExtraccion {
  proveedorExtraccion: "anthropic" | "openai" | "mock";
  seleccionPaginas: "claude_map" | "pdf_corto_completo" | "heuristica" | "todas";
  complementoHeuristicoPostExtract: boolean;
  paginasPdfTotal: number;
  paginasEnviadasVision: number;
  paginasOmitidasVision: number;
  usedClaudePageMap: boolean;
  /** Suma de filas detectadas en PDF pero no extraídas (cobertura tablas). */
  lineasOmitidasEstimadas?: number;
  /** PDF corto nativo: filas tomadas del texto escaneado antes que Vision. */
  textoNativoPrimario?: boolean;
  lineasDesdeTextoNativo?: number;
  lineasAnadidasDesdeTexto?: number;
  lineasMontosCorregidos?: number;
}

export interface InformeExtraccion {
  paginasTotales: number;
  paginasProcesadas: number;
  paginasOmitidas: number;
  seccionesDetectadas: SeccionDetectada[];
  cuentasExtraidas: number;
  indicadoresFinancierosExtraidos: number;
  indicadoresOperativosExtraidos: number;
  duplicadosResueltos: number;
  reclasificadosOperativos: number;
  reclasificadosFinancieros: number;
  inconsistencias: InconsistenciaExtract[];
  controlesAritmeticos: ControlAritmeticoExtract[];
  controlesAprobados: number;
  controlesFallidos: number;
  confianzaGlobal: number;
  coberturaEstimadaPct?: number;
  coberturaDesglose?: CoberturaDesglose;
  inconsistenciasDescartadasPorPeriodo?: number;
  duplicadosConfirmados?: number;
  coberturaTablas?: CoberturaTablaPagina[];
}

/** Período estructurado — trimestre, anual, comparativo. */
export type PeriodoTipo = "TRIMESTRAL" | "ANUAL" | "SEMESTRAL" | "OTRO";

export interface PeriodoExtracted {
  tipo?: PeriodoTipo;
  ejercicio?: number;
  desde?: string;
  hasta?: string;
  comparativo?: boolean;
  etiqueta?: string;
}

export interface MonedaEscalaExtracted {
  moneda: string;
  escalaFactor: number;
  descripcionEscala?: string;
  unidad?: "moneda" | "porcentaje" | "ratio" | "volumen" | "otro";
}

export interface ExtractedMetadata {
  razonSocial?: string;
  /** Chile — mantener por compatibilidad. */
  rut?: string;
  /** Identificador fiscal genérico (CUIT, RUT, NIT, etc.). */
  identificadorFiscal?: string;
  /** ISO país del identificador fiscal (AR, CL, …). */
  paisFiscal?: string;
  moneda?: string;
  escala?: "unidades" | "miles" | "millones" | "indeterminada";
  /** Factor numérico de escala (1, 1000, 1_000_000). */
  escalaFactor?: number;
  descripcionEscala?: string;
  periodo?: {
    ejercicio?: number;
    desde?: string;
    hasta?: string;
    tipo?: PeriodoTipo;
    comparativo?: boolean;
  };
}

export interface ExtractedNota {
  rubroRef?: string;
  texto: string;
}

export interface ExtractTotal {
  denominacion: string;
  monto: number;
  tipo: "parcial" | "general" | "subtotal";
  paginaNumero?: number;
}

export interface ExtractTranscripcionPagina {
  pagina: number;
  texto: string;
}

export interface PaginaClasificada {
  pagina: number;
  seccion: SeccionPagina;
  score: number;
  incluida: boolean;
  /** Texto nativo del PDF (pdf.js) para heurísticas post-LLM. */
  textoEscaneado?: string;
}

export interface ExtractResult {
  tipoDocumento: string;
  seccionPagina?: SeccionPagina;
  metadata: ExtractedMetadata;
  /** Cuentas contables canónicas (balance, resultados, flujo). */
  lineas: ExtractedLine[];
  indicadoresFinancieros?: IndicadorFinancieroExtracted[];
  indicadoresOperativos?: IndicadorOperativoExtracted[];
  seccionesDetectadas?: SeccionDetectada[];
  inconsistencias?: InconsistenciaExtract[];
  informeExtraccion?: InformeExtraccion;
  notas?: ExtractedNota[];
  totales?: ExtractTotal[];
  encabezados?: string[];
  textoPagina?: string;
  transcripcionPaginas?: ExtractTranscripcionPagina[];
  paginasClasificadas?: PaginaClasificada[];
  tiposPorPagina?: { pagina: number; tipoDocumento: string; seccionPagina?: SeccionPagina }[];
  provenanceExtraccion?: ProvenanceExtraccion;
}

export interface NormalizeLogEntry {
  at: Date;
  etapa: string;
  mensaje: string;
}

export interface ValidateContext {
  escala?: string;
  periodoEjercicio?: number;
  tipoDocumento?: string;
  añoVigente?: number;
  /** Páginas del balance testigo — acota H.17 y warnings de clasificación. */
  paginasBalanceObjetivo?: number[];
}

export interface NormalizedLine extends ExtractedLine {
  denominacionNormalizada: string;
  montoNormalizado: number;
  signoAplicado: "positivo" | "negativo";
}

export interface NormalizeResult {
  metadata: ExtractedMetadata;
  lineas: NormalizedLine[];
}

export interface RubroRef {
  id: string;
  codigo: string;
  nombre: string;
  estadoFinanciero: EstadoFinanciero;
  convencionSigno: "normal" | "invertido";
  corriente?: boolean;
  padreId?: string;
  aliases?: string[];
}

export interface ReglaClasificacionRef {
  id: string;
  prioridad: number;
  tipo: "patron_denominacion" | "codigo_origen" | "regex" | "contribuyente";
  patron: string;
  rubroInstitucionalId: string;
  activa: boolean;
}

export interface CriterioContribuyenteRef {
  id: string;
  denominacionOrigen: string;
  rubroInstitucionalId: string;
}

export interface CandidatoAsistido {
  rubroInstitucionalId: string;
  codigo: string;
  nombre: string;
  score: number;
}

export interface ClassifiedLine extends NormalizedLine {
  id?: string;
  excluirDeCuadratura?: boolean;
  motivoExclusionCuadratura?: string;
  rubroInstitucionalId?: string;
  rubroCodigo?: string;
  confianzaClasificacion: number;
  requiereRevision: boolean;
  origenClasificacion?:
    | "regla"
    | "semantica"
    | "asistida"
    | "criterio_contribuyente"
    | "manual"
    | "ia_clasificacion"
    | "ia_revision"
    | "ia_pre_revision";
  candidatosAsistidos?: CandidatoAsistido[];
  clasificacionIaRazonamiento?: string;
}

export interface ValidationItem {
  tipo: string;
  severidad: "info" | "warning" | "critical";
  passed: boolean;
  mensaje: string;
  metadata?: Record<string, unknown>;
}

export interface ValidateResult {
  validaciones: ValidationItem[];
  semaforo: "verde" | "amarillo" | "rojo";
  cuadraturaOk: boolean;
}
