export const CasoEstado = {
  RECIBIDO: "recibido",
  EN_COLA: "en_cola",
  PREPROCESANDO: "preprocesando",
  EXTRAYENDO: "extrayendo",
  NORMALIZANDO: "normalizando",
  CLASIFICANDO: "clasificando",
  VALIDANDO: "validando",
  EN_REVISION: "en_revision",
  APROBADO: "aprobado",
  INFORME_GENERADO: "informe_generado",
  RECHAZADO: "rechazado",
  CANCELADO: "cancelado",
  ERROR: "error",
  PENDIENTE_CALIDAD: "pendiente_calidad",
} as const;

export type CasoEstado = (typeof CasoEstado)[keyof typeof CasoEstado];

export const UserRole = {
  ADMIN: "admin",
  ANALISTA: "analista",
  REFERENTE: "referente",
  SOLO_LECTURA: "solo_lectura",
  PRODUCT_OWNER: "product_owner",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const CanalRecepcion = {
  CORREO: "correo",
  PORTAL: "portal",
  MANUAL_ALTERNATIVA: "manual_alternativa",
} as const;

export type CanalRecepcion = (typeof CanalRecepcion)[keyof typeof CanalRecepcion];

export const PlanCuentasEstado = {
  BORRADOR: "borrador",
  PENDIENTE_APROBACION: "pendiente_aprobacion",
  APROBADO: "aprobado",
  OBSOLETO: "obsoleto",
} as const;

export type PlanCuentasEstado = (typeof PlanCuentasEstado)[keyof typeof PlanCuentasEstado];

export const EstadoFinanciero = {
  ACTIVO: "activo",
  PASIVO: "pasivo",
  PATRIMONIO: "patrimonio",
  RESULTADOS: "resultados",
} as const;

export type EstadoFinanciero = (typeof EstadoFinanciero)[keyof typeof EstadoFinanciero];

export const AprobacionConfigEstado = {
  PENDIENTE: "pendiente",
  APROBADO: "aprobado",
  RECHAZADO: "rechazado",
} as const;

export type AprobacionConfigEstado =
  (typeof AprobacionConfigEstado)[keyof typeof AprobacionConfigEstado];

export const LineaEstado = {
  CRUDA: "cruda",
  NORMALIZADA: "normalizada",
  CLASIFICADA: "clasificada",
  APROBADA: "aprobada",
  RECHAZADA: "rechazada",
} as const;

export type LineaEstado = (typeof LineaEstado)[keyof typeof LineaEstado];

export const ValidacionTipo = {
  CUADRATURA: "cuadratura",
  COHERENCIA_ESTADOS: "coherencia_estados",
  INTEGRIDAD_AGRUPACION: "integridad_agrupacion",
  DEBITO_CREDITO: "debito_credito",
  ESCALA_NO_DECLARADA: "escala_no_declarada",
  CLASIFICACION_ORIGEN: "clasificacion_origen",
  EJERCICIO_DESACTUALIZADO: "ejercicio_desactualizado",
  ACTIVO_SOBREVALORADO: "activo_sobrevalorado",
} as const;

export type ValidacionTipo = (typeof ValidacionTipo)[keyof typeof ValidacionTipo];

export const ValidacionSeveridad = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
} as const;

export type ValidacionSeveridad =
  (typeof ValidacionSeveridad)[keyof typeof ValidacionSeveridad];

export const CONFIG_SISTEMA_ID = "global" as const;
