import { CasoEstado } from "./enums.js";
import { readEnvTimeoutMs } from "./with-timeout.js";

/** Segundos sin avance antes de marcar «trabado» (extracción IA puede tardar mucho). */
export function umbralSegundosProcesamientoTrabado(estado: string): number {
  if (estado === CasoEstado.EXTRAYENDO) {
    const extractSec = Math.floor(
      readEnvTimeoutMs("EXTRACT_JOB_TIMEOUT_MS", 600_000) / 1000
    );
    return Math.max(300, Math.floor(extractSec * 0.9));
  }
  if (estado === CasoEstado.PREPROCESANDO) {
    const preSec = Math.floor(
      readEnvTimeoutMs("PREPROCESS_JOB_TIMEOUT_MS", 180_000) / 1000
    );
    return Math.max(120, Math.floor(preSec * 0.85));
  }
  return 180;
}

/** Mensaje UX mientras la extracción IA sigue en curso (PDF grande). */
export function detalleExtraccionEnCurso(segundosEnEtapa: number): string {
  const min = Math.max(1, Math.floor(segundosEnEtapa / 60));
  return `Extracción IA en curso (${min} min). PDFs grandes suelen tardar 5–15 min; es normal quedar en ~35%.`;
}
