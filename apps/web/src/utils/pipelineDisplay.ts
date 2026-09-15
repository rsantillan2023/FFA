import { CasoEstado, type PipelineEtapaDto, type PipelineSubPasoDto } from "@ffa/shared";

export type PipelinePasoEstado = "listo" | "en_curso" | "pendiente";

interface PipelineFriendlyMeta {
  titulo: string;
  ayuda: string;
}

/** Orden fijo de pasos del pipeline (AA.1–AA.8). */
export const PIPELINE_ETAPA_IDS = [
  "AA.1",
  "AA.2",
  "AA.3",
  "AA.4",
  "AA.5",
  "AA.6",
  "AA.7",
  "AA.8",
] as const;

const FRIENDLY: Record<string, PipelineFriendlyMeta> = {
  "AA.1": {
    titulo: "Documento recibido",
    ayuda: "El archivo quedó registrado y encolado para procesar.",
  },
  "AA.2": {
    titulo: "Lectura del documento",
    ayuda: "El sistema leyó montos y filas del PDF o la imagen.",
  },
  "AA.3": {
    titulo: "Ajuste de moneda y período",
    ayuda: "Se identificaron moneda, escala y ejercicio de la ficha.",
  },
  "AA.4": {
    titulo: "Clasificación contable",
    ayuda: "Cada línea se asignó a un rubro del plan institucional.",
  },
  "AA.5": {
    titulo: "Controles automáticos",
    ayuda: "El sistema verificó cuadraturas y calculó el semáforo de confianza.",
  },
  "AA.6": {
    titulo: "Revisión del analista",
    ayuda: "Un analista valida y corrige los datos antes de cerrar la ficha.",
  },
  "AA.7": {
    titulo: "Indicadores financieros",
    ayuda: "Se calcularon ratios e indicadores a partir de la ficha aprobada.",
  },
  "AA.8": {
    titulo: "Informe para comité",
    ayuda: "Documento formal listo o en elaboración para presentación.",
  },
};

const ESTADO_LABEL: Record<PipelinePasoEstado, string> = {
  listo: "Listo",
  en_curso: "En curso",
  pendiente: "Pendiente",
};

const ESTADO_CORTO: Record<PipelinePasoEstado, string> = {
  listo: "OK",
  en_curso: "En curso",
  pendiente: "Pendiente",
};

export function pipelineEtapasPlaceholder(): PipelineEtapaDto[] {
  return PIPELINE_ETAPA_IDS.map((id) => ({
    id,
    nombre: FRIENDLY[id]?.titulo ?? id,
    completada: false,
  }));
}

/** Índice de la primera etapa incompleta (secuencial: ignora completadas “saltadas”). */
export function pipelineFirstPendingIndex(etapas: PipelineEtapaDto[]): number {
  return etapas.findIndex((e) => !e.completada);
}

export type PipelineBulbColor = "verde" | "azul" | "rojo" | "gris";

export function pipelineBulbEstado(
  etapa: PipelineEtapaDto,
  index: number,
  etapas: PipelineEtapaDto[],
  procesando = false,
): PipelineBulbColor {
  if (etapa.enCurso) return procesando ? "azul" : "rojo";
  if (etapa.completada) return "verde";
  const firstPending = pipelineFirstPendingIndex(etapas);
  if (firstPending < 0) return "verde";
  if (index < firstPending) return "verde";
  if (index === firstPending) return procesando ? "azul" : "rojo";
  return "gris";
}

export function pipelineFriendlyMeta(etapa: PipelineEtapaDto): PipelineFriendlyMeta {
  return (
    FRIENDLY[etapa.id] ?? {
      titulo: etapa.nombre,
      ayuda: "Paso del procesamiento automático de la ficha.",
    }
  );
}

export function pipelinePasoEstado(
  _etapa: PipelineEtapaDto,
  index: number,
  etapas: PipelineEtapaDto[],
): PipelinePasoEstado {
  const firstPending = pipelineFirstPendingIndex(etapas);
  if (firstPending < 0) return "listo";
  if (index < firstPending) return "listo";
  if (index === firstPending) return "en_curso";
  return "pendiente";
}

export function pipelinePasoEstadoLabel(estado: PipelinePasoEstado): string {
  return ESTADO_LABEL[estado];
}

export function pipelinePasoEstadoCorto(estado: PipelinePasoEstado): string {
  return ESTADO_CORTO[estado];
}

export function pipelineDetalleAmigable(etapa: PipelineEtapaDto): string {
  const d = etapa.detalle?.trim();
  if (!d) return pipelineFriendlyMeta(etapa).ayuda;

  const map: Record<string, string> = {
    "Sin documentos": "Todavía no hay archivos en este expediente.",
    "Pendiente extracción": "El sistema aún no terminó de leer el documento.",
    "Extracción IA en curso": "Leyendo filas y montos del PDF con IA.",
    "Preprocesando PDF": "Preparando páginas del documento antes de la lectura.",
    "Preprocesando documento": "Preparando el archivo para extracción.",
    "Metadatos pendientes": "Falta confirmar moneda, escala o ejercicio del expediente.",
    "Sin clasificar": "Las líneas todavía no tienen rubro asignado.",
    "Sin validaciones": "Los controles automáticos no se ejecutaron aún.",
    "Sin ficha": "La ficha todavía no está lista para revisar.",
    "Sin indicadores": "Los indicadores se calculan cuando la ficha se aprueba.",
    "Sin informe": "El informe de comité aún no fue generado.",
  };

  if (map[d]) return map[d];
  if (/^Extracción IA en curso/.test(d)) {
    return "Leyendo filas y montos del PDF con IA (puede tardar varios minutos).";
  }
  if (d.startsWith("Semáforo ")) return `Confianza del sistema: ${d.replace("Semáforo ", "")}.`;
  if (d.startsWith("Ficha ")) {
    const estado = d.replace("Ficha ", "");
    if (estado === "borrador") return "Ficha en preparación — pendiente de revisión.";
    if (estado === "aprobada") return "Ficha revisada y aprobada por el analista.";
    return `Estado de la ficha: ${estado}.`;
  }
  if (d.startsWith("Informe ")) {
    const estado = d.replace("Informe ", "");
    if (estado === "borrador") return "Informe preliminar generado — falta completar.";
    if (estado === "final") return "Informe finalizado y listo para exportar.";
    return `Estado del informe: ${estado}.`;
  }
  if (/^\d+ documento/.test(d)) return d.replace("documento(s)", "archivo(s) cargado(s)");
  if (/^\d+ línea/.test(d)) return d.replace("línea(s)", "fila(s) leídas del documento");
  if (/^\d+ indicador/.test(d)) return d.replace("indicador(es)", "indicador(es) calculado(s)");

  return d;
}

export function formatHoraCorta(iso: string): string {
  return formatTimestampCorta(iso);
}

/** Hora si es hoy; fecha+hora si es otro día (evita confusión con corridas viejas). */
export function formatTimestampCorta(iso: string, refNow = Date.now()): string {
  const d = new Date(iso);
  const now = new Date(refNow);
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuracionSegundos(seg: number): string {
  if (seg < 60) return `${seg} s`;
  const m = Math.floor(seg / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h} h ${rm} min` : `${h} h`;
}

export function pipelineSubPasoEstadoCorto(estado: PipelineSubPasoDto["estado"]): string {
  switch (estado) {
    case "listo":
      return "OK";
    case "en_curso":
      return "Trabajando";
    case "espera":
      return "En cola";
    default:
      return "Pendiente";
  }
}

/** Línea compacta para una sub-fase AA.2 (cola / preproceso / extracción). */
export function pipelineSubPasoMetaLine(sub: PipelineSubPasoDto): string {
  const parts: string[] = [];
  if (sub.estado === "espera" && sub.esperaSegundos != null && sub.esperaSegundos > 0) {
    parts.push(`espera ${formatDuracionSegundos(sub.esperaSegundos)}`);
  }
  if (sub.estado === "en_curso" && sub.trabajoSegundos != null && sub.trabajoSegundos > 0) {
    parts.push(`trabajo ${formatDuracionSegundos(sub.trabajoSegundos)}`);
  }
  if (sub.resultado && sub.estado === "listo") {
    parts.push(sub.resultado);
  } else if (sub.detalle && (sub.estado === "espera" || sub.estado === "en_curso")) {
    parts.push(sub.detalle);
  }
  return parts.join(" · ");
}

/** Sub-fase activa dentro de AA.2, si existe. */
export function pipelineSubPasoActivo(
  etapa: PipelineEtapaDto
): PipelineSubPasoDto | undefined {
  return etapa.subPasos?.find((s) => s.estado === "en_curso" || s.estado === "espera");
}

/** Línea secundaria del popover: hora, duración, % y detalle amigable. */
export function pipelineEtapaMetaLine(
  etapa: PipelineEtapaDto,
  bulbColor: PipelineBulbColor
): string {
  const parts: string[] = [];

  if (bulbColor === "gris") {
    return pipelineFriendlyMeta(etapa).ayuda;
  }

  if (etapa.iniciadaEn) {
    const hora = formatTimestampCorta(etapa.iniciadaEn);
    if (bulbColor === "verde" && etapa.completadaEn) {
      parts.push(`${hora} → ${formatTimestampCorta(etapa.completadaEn)}`);
    } else if (bulbColor === "azul") {
      parts.push(`Inicio ${hora}`);
    } else if (bulbColor === "verde") {
      parts.push(`Completado ${hora}`);
    } else if (bulbColor === "rojo" && etapa.enCurso) {
      parts.push(`Desde ${hora}`);
    }
  }

  const subActivo = pipelineSubPasoActivo(etapa);
  if (subActivo && bulbColor === "azul") {
    if (subActivo.estado === "espera") {
      if (subActivo.esperaSegundos != null && subActivo.esperaSegundos > 0) {
        parts.push(`en cola ${formatDuracionSegundos(subActivo.esperaSegundos)}`);
      } else {
        parts.push("en cola — sin trabajo activo");
      }
    } else if (subActivo.trabajoSegundos != null && subActivo.trabajoSegundos > 0) {
      parts.push(`${subActivo.label} · ${formatDuracionSegundos(subActivo.trabajoSegundos)}`);
    } else {
      parts.push(subActivo.label);
    }
    if (
      etapa.esperaSegundos != null &&
      etapa.esperaSegundos > 0 &&
      subActivo.estado === "en_curso"
    ) {
      parts.push(`cola previa ${formatDuracionSegundos(etapa.esperaSegundos)}`);
    }
  } else if (
    etapa.duracionSegundos != null &&
    etapa.duracionSegundos > 0 &&
    (bulbColor === "azul" || bulbColor === "verde" || (bulbColor === "rojo" && etapa.enCurso))
  ) {
    parts.push(
      bulbColor === "azul" || (bulbColor === "rojo" && etapa.enCurso)
        ? `lleva ${formatDuracionSegundos(etapa.duracionSegundos)}`
        : formatDuracionSegundos(etapa.duracionSegundos)
    );
  }

  if (etapa.progresoPct != null && bulbColor === "azul") {
    parts.push(`${etapa.progresoPct}% del pipeline`);
  }

  const det = pipelineDetalleAmigable(etapa);
  if (det && !parts.some((p) => p.includes(det.slice(0, 20)))) {
    parts.push(det);
  }

  return parts.join(" · ");
}

/** Avance global (0–100) asociado a cada estado operativo del caso. */
export const CASO_ESTADO_PROGRESO_PCT: Partial<Record<string, number>> = {
  [CasoEstado.RECIBIDO]: 5,
  [CasoEstado.EN_COLA]: 8,
  [CasoEstado.PREPROCESANDO]: 15,
  [CasoEstado.EXTRAYENDO]: 35,
  [CasoEstado.NORMALIZANDO]: 55,
  [CasoEstado.CLASIFICANDO]: 75,
  [CasoEstado.VALIDANDO]: 90,
  [CasoEstado.EN_REVISION]: 100,
  [CasoEstado.APROBADO]: 100,
  [CasoEstado.INFORME_GENERADO]: 100,
};

export function casoEstadoProgresoPct(estado: string): number | null {
  const pct = CASO_ESTADO_PROGRESO_PCT[estado];
  return pct != null ? pct : null;
}

/** % global del diagrama de etapas en bandeja (nodos Carga → Revisión). */
export function ingestFlowStepProgresoPct(step: { id: string; filter: string }): number {
  if (step.id === "rev") return 100;
  return casoEstadoProgresoPct(step.filter) ?? 0;
}

/** Avance global del pipeline (0–100) al completar cada paso AA. */
const PIPELINE_AA_PCT_AL_COMPLETAR: Record<string, number> = {
  "AA.1": 8,
  "AA.2": 55,
  "AA.3": 75,
  "AA.4": 90,
  "AA.5": 100,
  "AA.6": 100,
  "AA.7": 100,
  "AA.8": 100,
};

/** % global a mostrar por paso: en curso → dato vivo; listo → hito al cerrar el paso. */
export function pipelineEtapaProgresoPct(etapa: PipelineEtapaDto): number | null {
  if (etapa.enCurso) {
    return etapa.progresoPct ?? null;
  }
  if (etapa.completada) {
    return PIPELINE_AA_PCT_AL_COMPLETAR[etapa.id] ?? 100;
  }
  return null;
}

export function pipelineResumen(etapas: PipelineEtapaDto[]): {
  completados: number;
  total: number;
  pct: number;
  pasoActual: string | null;
} {
  const total = etapas.length;
  const firstPending = pipelineFirstPendingIndex(etapas);
  const completados = firstPending < 0 ? total : firstPending;
  const pct = total ? Math.round((completados / total) * 100) : 0;
  const actual = firstPending >= 0 ? etapas[firstPending] : undefined;
  const pasoActual = actual ? pipelineFriendlyMeta(actual).titulo : null;
  return { completados, total, pct, pasoActual };
}
