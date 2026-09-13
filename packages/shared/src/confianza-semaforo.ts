/** Umbral mínimo de confianza (%) para semáforo amarillo (por debajo → rojo). */
export const CONFIANZA_SEMAFORO_AMARILLO_MIN = 50;

export type SemaforoConfianza = "verde" | "amarillo" | "rojo";

/** Semáforo visual alineado al porcentaje de confianza de clasificación. */
export function semaforoDesdeConfianza(
  confianzaGlobal?: number | null,
  umbralVerde: number = 85
): SemaforoConfianza | undefined {
  if (confianzaGlobal == null || Number.isNaN(confianzaGlobal)) return undefined;
  if (confianzaGlobal >= umbralVerde) return "verde";
  if (confianzaGlobal >= CONFIANZA_SEMAFORO_AMARILLO_MIN) return "amarillo";
  return "rojo";
}

export function confianzaSemaforoLabel(semaforo?: SemaforoConfianza | null): string {
  if (!semaforo) return "Sin dato";
  if (semaforo === "verde") return "Alta";
  if (semaforo === "amarillo") return "Media";
  return "Baja";
}

export function confianzaSemaforoTooltip(
  confianzaGlobal?: number | null,
  semaforoValidacion?: string | null,
  umbralVerde: number = 85
): string {
  const pct = confianzaGlobal != null ? `${confianzaGlobal}%` : "sin dato";
  const visual = semaforoDesdeConfianza(confianzaGlobal, umbralVerde);
  let text = `Confianza de clasificación: ${pct}`;
  if (visual) {
    text += ` (${visual === "verde" ? "alta" : visual === "amarillo" ? "media" : "baja"})`;
  }
  if (semaforoValidacion && visual && semaforoValidacion !== visual) {
    text += `. Validación contable: ${semaforoValidacion} (cuadratura/controles)`;
  }
  return text;
}
