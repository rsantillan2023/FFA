import {
  CasoEstado,
  umbralSegundosProcesamientoTrabado,
  type ProcesamientoMotorEstado,
} from "@ffa/shared";

const REVISION_ESTADOS = new Set<string>([
  CasoEstado.EN_REVISION,
  CasoEstado.APROBADO,
  CasoEstado.INFORME_GENERADO,
]);

/** Caso listo para revisión manual del analista (o consulta posterior). */
export function puedeIrARevision(estado: string): boolean {
  return REVISION_ESTADOS.has(estado);
}

/** Hay informe de comité generado para este caso. */
export function puedeVerInforme(hasInforme?: boolean): boolean {
  return hasInforme === true;
}

/** Caso con documento almacenado — puede volver a foja cero desde cualquier estado. */
export function puedeReiniciarFojaCero(c: { documentosCount?: number }): boolean {
  return (c.documentosCount ?? 0) > 0;
}

/** Al reiniciar, hay ficha/informe aprobados que se archivan. */
export function reinicioArchivaFichaInforme(estado: string): boolean {
  return estado === CasoEstado.APROBADO || estado === CasoEstado.INFORME_GENERADO;
}

/** Reinicio por procesamiento trabado o fallido (vs. ficha ya aprobada). */
export function reinicioPorProcesamientoMuerto(estado: string): boolean {
  return !reinicioArchivaFichaInforme(estado);
}

/** Estados del pipeline (o error) recuperables con foja cero masiva. */
const ESTADOS_TRABADOS_RECUPERABLES = new Set<string>([
  CasoEstado.EN_COLA,
  CasoEstado.PREPROCESANDO,
  CasoEstado.EXTRAYENDO,
  CasoEstado.NORMALIZANDO,
  CasoEstado.CLASIFICANDO,
  CasoEstado.VALIDANDO,
  CasoEstado.ERROR,
  CasoEstado.PENDIENTE_CALIDAD,
]);

export const MOTIVO_REINICIO_TRABADO =
  "Procesamiento trabado — reinicio masivo desde bandeja";

/** Caso con PDF que quedó trabado en pipeline o en error — candidato a foja cero masiva. */
export function esCasoTrabadoRecuperable(c: {
  estado: string;
  documentosCount?: number;
}): boolean {
  if (c.estado === CasoEstado.ARCHIVADO) return false;
  return (
    puedeReiniciarFojaCero(c) && ESTADOS_TRABADOS_RECUPERABLES.has(c.estado)
  );
}

export interface ProgresoTrabadoContext {
  motorEstado?: ProcesamientoMotorEstado;
  segundosEnEtapa?: number;
  pausado?: boolean;
}

/**
 * Caso realmente trabado (sin job activo), no extracción IA lenta ni reinicio reciente.
 * Alineado con inferirMotor en la API.
 */
export function esCasoProcesamientoTrabado(
  c: { estado: string; documentosCount?: number; procesamientoPausado?: boolean },
  progreso?: ProgresoTrabadoContext | null,
  opts?: { reinicioEnCurso?: boolean }
): boolean {
  if (!esCasoTrabadoRecuperable(c)) return false;
  if (opts?.reinicioEnCurso) return false;

  const motor = progreso?.motorEstado;
  const secs = progreso?.segundosEnEtapa ?? 0;
  const pausado = progreso?.pausado ?? c.procesamientoPausado === true;
  const umbral = umbralSegundosProcesamientoTrabado(c.estado);

  if (motor === "activo" || motor === "en_cola") {
    // Defensa: otro caso ocupando el worker no debe ocultar un expediente ya trabado.
    if (secs > umbral && !opts?.reinicioEnCurso) return true;
    return false;
  }

  if (c.estado === CasoEstado.ERROR || c.estado === CasoEstado.PENDIENTE_CALIDAD) {
    return true;
  }

  if (pausado || motor === "pausado") return true;
  if (motor === "inactivo") return secs > umbral;

  if (motor === "desconocido") return secs > umbral;

  if (motor == null) return secs > umbral;

  return false;
}

/** Caso que puede pasarse a archivado desde la bandeja. */
export function puedeArchivar(estado: string): boolean {
  return estado !== CasoEstado.ARCHIVADO;
}

/** Caso archivado que puede reactivarse. */
export function puedeDesarchivar(estado: string): boolean {
  return estado === CasoEstado.ARCHIVADO;
}
