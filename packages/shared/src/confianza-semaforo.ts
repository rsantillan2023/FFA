/** Umbral mínimo de confianza (%) para semáforo amarillo (por debajo → rojo). */
export const CONFIANZA_SEMAFORO_AMARILLO_MIN = 50;

export type SemaforoConfianza = "verde" | "amarillo" | "rojo";

/**
 * Semáforo mostrado en la grilla y panel de confianza.
 * Prioriza el % de clasificación; solo baja verde → amarillo si la validación contable
 * es roja (cuadratura crítica u otro control grave). Advertencias amarillas de
 * validación no cambian un verde alto (p. ej. 86 % sigue verde).
 */
export function semaforoEfectivo(
  semaforoClasificacion?: SemaforoConfianza | string | null,
  semaforoValidacion?: SemaforoConfianza | string | null
): SemaforoConfianza | undefined {
  const cls = semaforoClasificacion as SemaforoConfianza | undefined;
  const val = semaforoValidacion as SemaforoConfianza | undefined;
  if (!cls && !val) return undefined;
  if (!cls) return val;
  if (!val) return cls;
  if (cls === "verde" && val === "rojo") return "amarillo";
  return cls;
}

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
  const efectivo = semaforoEfectivo(visual, semaforoValidacion as SemaforoConfianza | undefined);
  if (semaforoValidacion && efectivo !== visual) {
    text += `. Validación contable en rojo: revisar cuadratura/controles`;
  } else if (semaforoValidacion && semaforoValidacion !== "verde" && visual === "verde") {
    text += `. Validación contable: ${semaforoValidacion} (ver detalle en panel)`;
  }
  return text;
}
