import type {
  AprobacionConfigEstado,
  CasoEstado,
  EstadoFinanciero,
  LineaEstado,
  PlanCuentasEstado,
  UserRole,
  ValidacionSeveridad,
  ValidacionTipo,
} from "./enums.js";

export interface AuthUser {
  id: string;
  email: string;
  nombre: string;
  rol: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  services: {
    mongodb: boolean;
  };
}

export interface CasoEstadoHistorialEntry {
  estado: CasoEstado;
  at: string;
  by?: string;
  nota?: string;
}

export interface ConfiguracionSistemaDto {
  umbralConfianza: number;
  formatosPermitidos: string[];
  extractionProvider: "openai" | "anthropic" | "mock";
  planCuentasVigenteId?: string;
  reglasVigenteId?: string;
  reintentosMaxPorEtapa?: Record<string, number>;
  acuseCorreoTemplate?: string;
  notificacionFalloTemplate?: string;
  notificacionRevisionTemplate?: string;
  notificacionAnalistas?: string[];
  notificacionAdmin?: string[];
  retencionDias?: number;
  politicaIlegible?: {
    accion: "pendiente_calidad_remitente" | "escalar_analista";
    maxIntentosCalidad?: number;
  };
}

export interface NotificacionLogDto {
  id: string;
  tipo: string;
  destinatario: string;
  casoId?: string;
  estado: string;
  asunto?: string;
  error?: string;
  enviadoAt: string;
}

export interface UserDto {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  activo: boolean;
  ultimoAcceso?: string;
  createdAt: string;
}

export interface ReglaClasificacionDto {
  id: string;
  prioridad: number;
  tipo: string;
  patron: string;
  rubroInstitucionalId: string;
  rubroCodigo?: string;
  activa: boolean;
}

export interface ReglasVersionDto {
  id: string;
  version: string;
  estado: string;
  reglasCount: number;
  createdAt: string;
}

export interface QueueStatusDto {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface AccesoFallidoDto {
  id: string;
  email: string;
  ip?: string;
  motivo: string;
  at: string;
}

export interface PlanCuentasVersionDto {
  id: string;
  version: string;
  estado: PlanCuentasEstado;
  /** true solo para la versión referenciada en configuración global (plan vigente). */
  esVigente?: boolean;
  notas?: string;
  rubrosCount?: number;
  aprobacion?: {
    by: string;
    at: string;
    comentario?: string;
  };
  responsableId?: string;
  responsableNombre?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RubroInstitucionalDto {
  id: string;
  planCuentasVersionId: string;
  codigo: string;
  nombre: string;
  estadoFinanciero: EstadoFinanciero;
  corriente?: boolean;
  convencionSigno: "normal" | "invertido";
  padreId?: string;
  padreCodigo?: string;
  orden: number;
  activo: boolean;
  aliases?: string[];
  notaMargen?: string;
  hijos?: RubroInstitucionalDto[];
}

export interface PlanCuentasHistorialDto {
  id: string;
  planCuentasVersionId: string;
  accion: string;
  actorId?: string;
  motivo?: string;
  payload?: Record<string, unknown>;
  at: string;
}

export interface ContribuyenteDto {
  id: string;
  rut?: string;
  razonSocial: string;
  denominacionesAlternativas: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AprobacionConfigDto {
  id: string;
  tipo: "plan_cuentas" | "plantilla_informe" | "indicadores" | "reglas";
  versionId: string;
  estado: AprobacionConfigEstado;
  comentarios?: string;
  at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface CasoTiemposDto {
  minutosEnCola: number | null;
  minutosProcesamientoTotal: number | null;
  minutosEnRevision: number | null;
}

export interface FichaHistorialDto {
  id: string;
  casoId: string;
  version: number;
  estado: string;
  semaforo?: string;
  confianzaGlobal?: number;
  aprobadaAt?: string;
  observaciones?: string;
}

import type { IdentidadResuelta } from "./identidad-caso.js";

export type { IdentidadResuelta, IdentidadResueltaFuente } from "./identidad-caso.js";

export interface CasoContribuyenteResumenDto {
  id: string;
  razonSocial: string;
  rut?: string;
}

export interface CasoDto {
  id: string;
  numero: string;
  referencia?: string;
  canal: string;
  estado: string;
  contribuyenteId?: string;
  contribuyente?: CasoContribuyenteResumenDto;
  identidadResuelta?: IdentidadResuelta;
  asignadoA?: string;
  asignadoNombre?: string;
  documentosCount?: number;
  semaforo?: "verde" | "amarillo" | "rojo";
  confianzaGlobal?: number;
  elegibleAutoAprobacion?: boolean;
  moneda?: string;
  escala?: string;
  lineasCount?: number;
  hasInforme?: boolean;
  version?: number;
  observaciones?: string;
  tiempos?: CasoTiemposDto;
  procesamientoPausado?: boolean;
  prioridad?: number;
  periodoEjercicio?: number;
  /** True si el analista confirmó metadatos (PATCH) tras la última re-extracción IA. */
  metadatosVerificados?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineEtapaDto {
  id: string;
  nombre: string;
  completada: boolean;
  detalle?: string;
  /** ISO — cuándo empezó este paso (según historial del caso). */
  iniciadaEn?: string;
  /** ISO — cuándo terminó (transición al siguiente paso). */
  completadaEn?: string;
  /** Progreso parcial del paso en curso (p. ej. 35% en extracción IA). */
  progresoPct?: number;
  /** Duración en segundos (cerrado) o tiempo transcurrido si sigue en curso. */
  duracionSegundos?: number;
  /** Paso activo según estado actual del caso (fuente de verdad para la UI). */
  enCurso?: boolean;
}

export interface PipelineEtapaDetalleItemDto {
  label: string;
  value: string;
}

export interface PipelineEtapaDetalleLogDto {
  at?: string;
  etapa?: string;
  mensaje: string;
}

export interface PipelineEtapaDetalleTablaDto {
  titulo: string;
  columnas: string[];
  filas: string[][];
}

export interface PipelineEtapaDetalleEnlaceDto {
  label: string;
  /** Ruta interna (Vue Router) o URL absoluta/API para abrir documento. */
  to: string;
  external?: boolean;
}

export interface PipelineEtapaDetalleDto {
  etapaId: string;
  titulo: string;
  estado: "listo" | "en_curso" | "pendiente";
  resumen: string;
  items: PipelineEtapaDetalleItemDto[];
  logs?: PipelineEtapaDetalleLogDto[];
  tablas?: PipelineEtapaDetalleTablaDto[];
  enlaces?: PipelineEtapaDetalleEnlaceDto[];
}

export interface BuscarResultDto {
  casos: Array<{
    id: string;
    numero: string;
    estado: string;
    semaforo?: string;
    contribuyenteId?: string;
    createdAt?: string;
  }>;
  contribuyentes: Array<{
    id: string;
    rut?: string;
    razonSocial: string;
  }>;
}

export interface ExtraccionIaTextoDto {
  documentoId: string;
  documentoNombre: string;
  origen: "payload" | "reconstruido";
  lineasCount: number;
  texto: string;
}

export interface DocumentoFuenteDto {
  id: string;
  casoId: string;
  nombreOriginal: string;
  mimeType: string;
  canal: string;
  calidadOrigen: string;
  paginaCount: number;
  tamanoBytes?: number;
  extractMetadata?: {
    razonSocial?: string;
    rut?: string;
    moneda?: string;
    escala?: string;
    periodo?: { ejercicio?: number };
  };
  procesamiento?: {
    etapaActual?: string;
    progresoPct?: number;
    ultimoError?: string;
    ultimoErrorCodigo?: string;
  };
  createdAt: string;
}

export interface CandidatoAsistidoDto {
  rubroInstitucionalId: string;
  codigo: string;
  nombre: string;
  score: number;
}

/** Sugerencia de clasificación generada bajo demanda con IA en revisión. */
export interface SugerenciaClasificacionIaDto {
  rubroInstitucionalId: string;
  rubroCodigo: string;
  rubroNombre: string;
  confianza: number;
  razonamiento: string;
  proveedor: "anthropic" | "openai";
  modelo?: string;
}

export interface ClasificacionIaMasivaDetalleDto {
  lineaId: string;
  denominacionOriginal: string;
  ok: boolean;
  rubroCodigo?: string;
  rubroNombre?: string;
  confianza?: number;
  razonamiento?: string;
  error?: string;
}

export interface ClasificacionIaMasivaResultDto {
  procesadas: number;
  actualizadas: number;
  errores: number;
  detalle: ClasificacionIaMasivaDetalleDto[];
}

export interface ResolverPendientesRevisionDto {
  lineasAprobadas: number;
  lineasSinRubro: number;
  validacionesConfirmadas: number;
}

export interface LineaContableDto {
  id: string;
  casoId: string;
  documentoId: string;
  paginaNumero: number;
  denominacionOriginal: string;
  denominacionNormalizada?: string;
  montoOriginal: number;
  montoNormalizado?: number;
  rubroCodigo?: string;
  rubroNombre?: string;
  rubroInstitucionalId?: string;
  confianzaExtraccion?: number;
  confianzaClasificacion?: number;
  requiereRevision: boolean;
  origenClasificacion?: string;
  candidatosAsistidos?: CandidatoAsistidoDto[];
  estado: LineaEstado;
  bbox?: { x: number; y: number; w: number; h: number };
}

export interface UmbralHistorialDto {
  umbralConfianza: number;
  at: string;
  actorId?: string;
}

export interface ClasificacionPruebaResultDto {
  lineas: Array<{
    denominacionOriginal: string;
    rubroCodigo?: string;
    rubroNombre?: string;
    confianzaClasificacion: number;
    origenClasificacion?: string;
    requiereRevision: boolean;
    candidatosAsistidos?: CandidatoAsistidoDto[];
  }>;
  confianzaGlobal: number;
}

export interface RubroOptionDto {
  id: string;
  codigo: string;
  nombre: string;
  estadoFinanciero: string;
  convencionSigno?: "normal" | "invertido";
}

export interface FichaCanonicaDto {
  id: string;
  casoId: string;
  estado: string;
  version: number;
  validacionesResumen?: { cuadraturaOk?: boolean; semaforo?: string };
  aprobadaAt?: string;
  balance?: {
    activoCorriente?: number;
    activoNoCorriente?: number;
    pasivoCorriente?: number;
    pasivoNoCorriente?: number;
    patrimonio?: number;
    detalle?: { codigo: string; nombre?: string; monto: number; lineasIds?: string[] }[];
  };
  estadoResultados?: {
    utilidad?: number;
    detalle?: { codigo: string; nombre?: string; monto: number; lineasIds?: string[] }[];
  };
  observaciones?: string;
}

export interface IndicadorCalculadoDto {
  id: string;
  fichaId: string;
  codigo: string;
  valor: number | null;
  calculable: boolean;
  error?: string;
  calculadoAt: string;
}

export interface InformeComiteDto {
  id: string;
  fichaId: string;
  casoId: string;
  estado: string;
  fichaVersion: number;
  generadoAt: string;
  finalizadoAt?: string;
  apartadosManuales: Record<string, string>;
  /** Indica si ya existe un .docx generado (p. ej. seed o export previo). */
  tieneDocx?: boolean;
}

export interface RepositorioItemDto {
  casoId: string;
  numero: string;
  contribuyenteId?: string;
  contribuyenteNombre?: string;
  contribuyenteRut?: string;
  ejercicio?: number;
  estado: string;
  semaforo?: string;
  confianzaGlobal?: number;
  fichaId?: string;
  fichaVersion?: number;
  aprobadaAt?: string;
  canal?: string;
  documentoId?: string;
  documentoNombre?: string;
}

export interface HistorialFichaDto {
  casoId: string;
  fichaId: string;
  numero: string;
  ejercicio?: number;
  estado: string;
  semaforo?: string;
  aprobadaAt?: string;
  fichaVersion?: number;
}

export interface MetricaComparadaDto {
  concepto: string;
  codigo?: string;
  actual: number | null;
  anterior: number | null;
  variacionAbs: number | null;
  variacionPct: number | null;
}

export interface DeterioroDetectadoDto {
  tipo: string;
  severidad: "leve" | "moderado" | "grave";
  mensaje: string;
  metrica?: string;
}

export interface ComparacionEjerciciosDto {
  contribuyenteId: string;
  contribuyenteNombre?: string;
  fichaActualId: string;
  fichaAnteriorId?: string;
  ejercicioActual?: number;
  ejercicioAnterior?: number;
  balance: MetricaComparadaDto[];
  indicadores: MetricaComparadaDto[];
  deterioros: DeterioroDetectadoDto[];
}

export interface ComparacionCarteraItemDto {
  fichaId: string;
  casoId: string;
  contribuyenteId?: string;
  contribuyenteNombre?: string;
  ejercicio?: number;
  activoCorriente?: number;
  pasivoCorriente?: number;
  patrimonio?: number;
  utilidad?: number;
  indicadores: Record<string, number | null>;
}

export interface ComparacionCarteraDto {
  planCuentasVersionId: string;
  items: ComparacionCarteraItemDto[];
}

export interface CriterioHistoricoDto {
  id: string;
  denominacionOrigen: string;
  rubroInstitucionalId: string;
  rubroCodigo?: string;
  aprobadoAt: string;
  casoOrigenId?: string;
  activo: boolean;
  version?: number;
}

export interface CriterioAplicadoDto {
  lineaId: string;
  denominacionOriginal: string;
  rubroCodigo?: string;
  criterioId?: string;
}

export interface MetricasAprendizajeDto {
  contribuyenteId: string;
  casosAnalizados: number;
  primeraPresentacion: { casoId: string; lineasRevision: number } | null;
  segundaPresentacion: { casoId: string; lineasRevision: number } | null;
  reduccionLineasRevisionPct: number | null;
  criteriosActivos: number;
}

export interface ConsolidacionGrupoDto {
  id?: string;
  nombre: string;
  planCuentasVersionId: string;
  periodosCount: number;
  empresasCount: number;
  fichaIds?: string[];
  creadoAt?: string;
  totales: {
    activoCorriente: number;
    pasivoCorriente: number;
    patrimonio: number;
    utilidad: number;
  };
  indicadoresAgregados: Record<string, number | null>;
  items: ComparacionCarteraItemDto[];
}

export interface ConsolidacionGrupoListItemDto {
  id: string;
  nombre: string;
  empresasCount: number;
  periodosCount: number;
  patrimonioTotal: number;
  creadoAt: string;
}

export type ProcesamientoMotorEstado =
  | "activo"
  | "en_cola"
  | "inline"
  | "inactivo"
  | "pausado"
  | "desconocido";

export interface CasoProgresoDto {
  casoId: string;
  estado: string;
  etapaActual?: string;
  progresoPct: number;
  documentos: {
    id: string;
    nombre: string;
    etapaActual?: string;
    progresoPct?: number;
    ultimoError?: string;
  }[];
  /** ISO — última modificación del caso. */
  actualizadoEn?: string;
  /** Segundos en el estado actual del pipeline. */
  segundosEnEtapa?: number;
  pausado?: boolean;
  ultimoError?: string;
  ultimoErrorCodigo?: string;
  notaEtapa?: string;
  motor?: {
    backend: string;
    estado: ProcesamientoMotorEstado;
    detalle?: string;
    jobCola?: string;
    jobId?: string;
  };
  jobs?: Array<{ cola: string; estado: string; jobId: string }>;
  eventosRecientes?: Array<{ at: string; accion: string; mensaje: string }>;
}

export interface KpisDto {
  resumen: {
    totalCasos: number;
    enRevision: number;
    aprobados: number;
    informesGenerados: number;
    errores: number;
    fichasAprobadas: number;
    informesFinales: number;
    pendienteCalidad?: number;
  };
  operacion: {
    lineasProcesadas: number;
    lineasPendientesRevision: number;
    tasaResolucionAutomaticaPct: number;
    coberturaProcesamientoPct?: number;
  };
  tiempos?: {
    promedioMinutosAprobacion: number | null;
    metaMinutos: number;
    reduccionVsBaselineHorasPct: number | null;
    baselineReferenciaHoras: number;
  };
  calidad?: {
    pctCuadraturaVerificada: number;
    /** Fichas cerradas con cuadratura contable verificada (numerador del %). */
    casosConCuadraturaOk?: number;
    /** Fichas cerradas evaluadas (denominador del %). */
    casosCuadraturaTotal?: number;
    pctTrazabilidadCompleta: number;
    pctCasosSinIntervencionHumana: number;
    inconsistenciasConfirmadas: number;
    validacionesFallidas: number;
  };
  aprendizaje?: {
    contribuyentesConHistorial: number;
    reduccionLineasRevisionPromedioPct: number | null;
    criteriosAprobadosTotal?: number;
    tendenciaResolucionAutomaticaPct?: number | null;
  };
  resolucionAutomaticaMensual?: Array<{
    periodo: string;
    casosAprobados: number;
    pctSinIntervencion: number;
  }>;
  casosPorEstado: Record<string, number>;
  casosPorCanal?: Record<string, number>;
  erroresPorEtapa?: Record<string, number>;
  pipelineErrores?: number;
  periodo?: { desde: string | null; hasta: string | null };
  generadoAt: string;
}

export interface ValidacionResultadoDto {
  id: string;
  casoId: string;
  tipo: ValidacionTipo;
  severidad: ValidacionSeveridad;
  passed: boolean;
  mensaje: string;
  at: string;
  confirmadaPorAnalista?: boolean;
}

export interface AuditoriaEventoDto {
  id: string;
  at: string;
  actorTipo: "sistema" | "usuario";
  casoId?: string;
  entidad: string;
  accion: string;
  payload: Record<string, unknown>;
}

export type IaProveedor = "openai" | "anthropic";

export type IaFuncion = "extract_vision" | "extract_metadata" | "informe_narrativa";

export interface IaLlamadaDto {
  id: string;
  at: string;
  actorTipo: "sistema" | "usuario";
  actorId?: string;
  actorNombre?: string;
  actorEmail?: string;
  casoId?: string;
  documentoId?: string;
  proveedor: IaProveedor;
  modelo: string;
  funcion: IaFuncion | string;
  tokensEntrada: number;
  tokensSalida: number;
  costeUsdEstimado: number;
  duracionMs?: number;
  exito: boolean;
  error?: string;
  detalle?: Record<string, unknown>;
}

export interface IaLlamadaResumenDto {
  totalLlamadas: number;
  tokensEntrada: number;
  tokensSalida: number;
  costeUsdEstimado: number;
  exitosas: number;
  fallidas: number;
  porFuncion: Array<{
    funcion: string;
    llamadas: number;
    costeUsdEstimado: number;
    tokensEntrada: number;
    tokensSalida: number;
  }>;
  porProveedor: Array<{
    proveedor: string;
    llamadas: number;
    costeUsdEstimado: number;
  }>;
  porDia: Array<{
    dia: string;
    llamadas: number;
    costeUsdEstimado: number;
  }>;
}

/** Desglose iconográfico del semáforo de confianza (clasificación + calidad del caso). */
export interface ConfianzaResumenDto {
  casoId: string;
  /** Promedio de confianzaClasificacion (0–100) — mismo valor que confianzaGlobal del caso. */
  confianzaClasificacion: number | null;
  /** Promedio de confianzaExtraccion (0–100). */
  confianzaExtraccion: number | null;
  /** Confianza del informe de extracción post-proceso (0–100), si existe. */
  confianzaInformeExtraccion?: number | null;
  semaforoClasificacion: "verde" | "amarillo" | "rojo" | null;
  semaforoValidacion?: string | null;
  totalLineas: number;
  lineasConRubro: number;
  lineasSinRubro: number;
  lineasRequierenRevision: number;
  lineasAltaConfianza: number;
  validacionesOk: number;
  validacionesFallidas: number;
  validacionesTotal: number;
  mensajePrincipal: string;
  mensajeSecundario?: string;
}
