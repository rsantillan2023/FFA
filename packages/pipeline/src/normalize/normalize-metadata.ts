import type { ExtractedMetadata, NormalizeLogEntry } from "../types.js";
import { parseEjercicioPeriodo, parseFechaPeriodoString } from "../utils/fecha-periodo.js";

const AÑO_VIGENTE_DEFAULT = new Date().getFullYear();

/** D.13 — normaliza fechas de período a ISO; descarta valores no parseables. */
export function normalizarPeriodo(
  periodo?: ExtractedMetadata["periodo"]
): ExtractedMetadata["periodo"] | undefined {
  if (!periodo) return undefined;
  const desde = parseFechaPeriodoString(periodo.desde);
  const hasta = parseFechaPeriodoString(periodo.hasta);
  let ejercicio = parseEjercicioPeriodo(periodo.ejercicio);
  if (ejercicio == null && hasta) ejercicio = parseEjercicioPeriodo(hasta.slice(0, 4));
  if (ejercicio == null && desde) ejercicio = parseEjercicioPeriodo(desde.slice(0, 4));
  if (ejercicio == null && !desde && !hasta) return undefined;
  return {
    ejercicio,
    desde,
    hasta,
  };
}

/** D.6/D.7 — detecta escala indeterminada o sospechosa por magnitud. */
export function evaluarEscala(
  metadata: ExtractedMetadata,
  montos: number[],
  log: NormalizeLogEntry[]
): NonNullable<ExtractedMetadata["escala"]> {
  const escala: NonNullable<ExtractedMetadata["escala"]> = metadata.escala ?? "indeterminada";
  if (escala !== "indeterminada") {
    log.push({
      at: new Date(),
      etapa: "escala",
      mensaje: `Escala declarada: ${escala}`,
    });
    return escala;
  }

  const maxAbs = Math.max(0, ...montos.map((m) => Math.abs(m)));
  if (maxAbs > 0 && maxAbs < 500) {
    log.push({
      at: new Date(),
      etapa: "escala",
      mensaje: "Magnitudes bajas — posible escala miles no declarada (D.7)",
    });
    return "indeterminada";
  }

  log.push({
    at: new Date(),
    etapa: "escala",
    mensaje: "Escala no declarada — líneas marcadas para revisión (D.6)",
  });
  return "indeterminada";
}

/** D.14 — ejercicio muy anterior al vigente. */
export function esEjercicioDesactualizado(
  ejercicio: number | undefined,
  añoVigente = AÑO_VIGENTE_DEFAULT
): boolean {
  if (!ejercicio) return false;
  return ejercicio < añoVigente - 2;
}
