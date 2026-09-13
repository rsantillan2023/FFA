import type { CasoDocument } from "@ffa/db";
import { CasoEstado } from "@ffa/shared";

export interface CasoTiemposDto {
  minutosEnCola: number | null;
  minutosProcesamientoTotal: number | null;
  minutosEnRevision: number | null;
}

function findHistorialAt(
  caso: CasoDocument,
  estados: string | string[]
): Date | null {
  const list = Array.isArray(estados) ? estados : [estados];
  const hit = caso.estadoHistorial?.find((h) => list.includes(h.estado));
  return hit?.at ?? null;
}

/** J.18 — tiempos desde estadoHistorial y timestamps. */
export function calcularTiemposCaso(caso: CasoDocument): CasoTiemposDto {
  const now = Date.now();
  const created = caso.createdAt?.getTime() ?? now;
  const enColaAt = caso.enColaAt?.getTime() ?? findHistorialAt(caso, CasoEstado.EN_COLA)?.getTime();
  const enRevisionAt = findHistorialAt(caso, CasoEstado.EN_REVISION)?.getTime();
  const aprobadoAt = findHistorialAt(caso, [CasoEstado.APROBADO, CasoEstado.INFORME_GENERADO])?.getTime();

  const fin = aprobadoAt ?? now;
  const minutosProcesamientoTotal = Math.round((fin - created) / 60_000);

  let minutosEnCola: number | null = null;
  if (enColaAt) {
    const finCola = enRevisionAt ?? fin;
    minutosEnCola = Math.round((finCola - enColaAt) / 60_000);
  }

  let minutosEnRevision: number | null = null;
  if (enRevisionAt) {
    minutosEnRevision = Math.round((fin - enRevisionAt) / 60_000);
  }

  return { minutosEnCola, minutosProcesamientoTotal, minutosEnRevision };
}
