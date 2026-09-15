import { CasoEstado } from "@ffa/shared";

/** Etiquetas legibles para estados de ficha (evitar jerga interna como «pendiente calidad»). */
export const CASO_ESTADO_LABELS: Record<string, string> = {
  [CasoEstado.RECIBIDO]: "Recibido",
  [CasoEstado.EN_COLA]: "En cola",
  [CasoEstado.PREPROCESANDO]: "Preprocesando",
  [CasoEstado.EXTRAYENDO]: "Extrayendo",
  [CasoEstado.NORMALIZANDO]: "Normalizando",
  [CasoEstado.CLASIFICANDO]: "Clasificando",
  [CasoEstado.VALIDANDO]: "Validando",
  [CasoEstado.EN_REVISION]: "En revisión",
  [CasoEstado.APROBADO]: "Aprobado",
  [CasoEstado.INFORME_GENERADO]: "Informe generado",
  [CasoEstado.RECHAZADO]: "Rechazado",
  [CasoEstado.ERROR]: "Error",
  [CasoEstado.PENDIENTE_CALIDAD]: "Extracción fallida",
  [CasoEstado.CANCELADO]: "Cancelado",
  [CasoEstado.ARCHIVADO]: "Archivado",
};

export const CASO_ESTADO_HINTS: Partial<Record<string, string>> = {
  [CasoEstado.PENDIENTE_CALIDAD]:
    "La lectura automática del PDF no pudo completarse. Revisá el detalle del fallo o cargá las líneas manualmente.",
};

export function casoEstadoLabel(estado: string): string {
  return CASO_ESTADO_LABELS[estado] ?? estado;
}

/** Etiquetas cortas para badges en la grilla. */
const CASO_ESTADO_LABELS_COMPACT: Record<string, string> = {
  [CasoEstado.PREPROCESANDO]: "Preproc.",
  [CasoEstado.EXTRAYENDO]: "Extrayendo",
  [CasoEstado.NORMALIZANDO]: "Normaliza",
  [CasoEstado.CLASIFICANDO]: "Clasifica",
  [CasoEstado.VALIDANDO]: "Valida",
  [CasoEstado.EN_REVISION]: "Revisión",
  [CasoEstado.INFORME_GENERADO]: "Informe",
  [CasoEstado.PENDIENTE_CALIDAD]: "Extr. fallida",
};

export function casoEstadoLabelCompacto(estado: string): string {
  return CASO_ESTADO_LABELS_COMPACT[estado] ?? CASO_ESTADO_LABELS[estado] ?? estado;
}

export function casoEstadoHint(estado: string): string | undefined {
  return CASO_ESTADO_HINTS[estado];
}
