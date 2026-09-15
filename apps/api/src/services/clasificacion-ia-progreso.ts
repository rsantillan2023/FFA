import type {
  ClasificacionIaLineaEventoDto,
  ClasificacionIaMasivaResultDto,
  ClasificacionIaProgresoDto,
} from "@ffa/shared";

const MAX_ULTIMAS_LINEAS = 15;

const TTL_MS = 10 * 60 * 1000;
const store = new Map<string, { progreso: ClasificacionIaProgresoDto; expiresAt: number }>();

function nowIso(): string {
  return new Date().toISOString();
}

function idle(casoId: string): ClasificacionIaProgresoDto {
  return {
    casoId,
    activo: false,
    estado: "idle",
    total: 0,
    procesadas: 0,
    actualizadas: 0,
    errores: 0,
    actualizadoEn: nowIso(),
  };
}

function purgeExpired(): void {
  const t = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt <= t) store.delete(id);
  }
}

export function obtenerClasificacionIaProgreso(casoId: string): ClasificacionIaProgresoDto {
  purgeExpired();
  return store.get(casoId)?.progreso ?? idle(casoId);
}

export function clasificacionIaEnCurso(casoId: string): boolean {
  return obtenerClasificacionIaProgreso(casoId).estado === "en_curso";
}

export function iniciarClasificacionIaProgreso(
  casoId: string,
  input: {
    total: number;
    loteSinRubro: number;
    loteBajaConfianza: number;
  }
): void {
  purgeExpired();
  const progreso: ClasificacionIaProgresoDto = {
    casoId,
    activo: true,
    estado: "en_curso",
    total: input.total,
    procesadas: 0,
    actualizadas: 0,
    errores: 0,
    loteSinRubro: input.loteSinRubro,
    loteBajaConfianza: input.loteBajaConfianza,
    ultimasLineas: [],
    mensaje: "Preparando clasificación con IA…",
    actualizadoEn: nowIso(),
  };
  store.set(casoId, { progreso, expiresAt: Date.now() + TTL_MS });
}

export function registrarEventoLineaClasificacionIa(
  casoId: string,
  evento: Omit<ClasificacionIaLineaEventoDto, "at"> & { at?: string }
): void {
  const entry = store.get(casoId);
  if (!entry || entry.progreso.estado !== "en_curso") return;

  const ev: ClasificacionIaLineaEventoDto = {
    ...evento,
    at: evento.at ?? nowIso(),
  };

  if (evento.estado === "procesando") {
    entry.progreso.lineaEnCurso = ev;
    entry.progreso.lineaId = ev.lineaId;
    entry.progreso.denominacionOriginal = ev.denominacionOriginal;
  } else {
    entry.progreso.lineaEnCurso = undefined;
    entry.progreso.ultimasLineas = [ev, ...(entry.progreso.ultimasLineas ?? [])].slice(
      0,
      MAX_ULTIMAS_LINEAS
    );
  }

  entry.progreso.actualizadoEn = nowIso();
  entry.expiresAt = Date.now() + TTL_MS;
}

export function actualizarClasificacionIaProgreso(
  casoId: string,
  patch: Partial<
    Pick<
      ClasificacionIaProgresoDto,
      | "procesadas"
      | "actualizadas"
      | "errores"
      | "lote"
      | "loteActual"
      | "loteTotalLineas"
      | "loteProcesadas"
      | "lineaId"
      | "denominacionOriginal"
      | "mensaje"
    >
  >
): void {
  const entry = store.get(casoId);
  if (!entry || entry.progreso.estado !== "en_curso") return;
  entry.progreso = {
    ...entry.progreso,
    ...patch,
    actualizadoEn: nowIso(),
  };
  entry.expiresAt = Date.now() + TTL_MS;
}

export function finalizarClasificacionIaProgreso(
  casoId: string,
  resultado: ClasificacionIaMasivaResultDto,
  error?: string
): void {
  const entry = store.get(casoId);
  const base = entry?.progreso ?? idle(casoId);
  const progreso: ClasificacionIaProgresoDto = {
    ...base,
    activo: false,
    estado: error ? "error" : "completado",
    total: resultado.procesadas || base.total,
    procesadas: resultado.procesadas,
    actualizadas: resultado.actualizadas,
    errores: resultado.errores,
    lineaEnCurso: undefined,
    mensaje: error
      ? error
      : `Listo — ${resultado.actualizadas} clasificada(s), ${resultado.errores} error(es)`,
    error,
    resultado,
    actualizadoEn: nowIso(),
  };
  store.set(casoId, { progreso, expiresAt: Date.now() + TTL_MS });
}

export function limpiarClasificacionIaProgreso(casoId: string): void {
  store.delete(casoId);
}
