import { AuditoriaEventoModel, CasoModel, DocumentoFuenteModel, type CasoDocument } from "@ffa/db";
import {
  QUEUE_NAMES,
  getInlineActiveRun,
  getInlineActiveRunForCaso,
  getQueueBackend,
  getRedisConnection,
  inlineConcurrentStats,
  isInlineQueueBusy,
  preprocessInlineConcurrency,
  type ClassifyJobData,
  type PipelineJobData,
} from "@ffa/queue";
import {
  CasoEstado,
  detalleExtraccionEnCurso,
  umbralSegundosProcesamientoTrabado,
  type CasoProgresoDto,
} from "@ffa/shared";
import { Queue } from "bullmq";
import { appConfig } from "../config.js";

const ETAPA_BY_ESTADO: Partial<Record<string, { etapa: string; pct: number }>> = {
  [CasoEstado.RECIBIDO]: { etapa: "recibido", pct: 5 },
  [CasoEstado.EN_COLA]: { etapa: "en_cola", pct: 8 },
  [CasoEstado.PREPROCESANDO]: { etapa: "preprocess", pct: 15 },
  [CasoEstado.EXTRAYENDO]: { etapa: "extract", pct: 35 },
  [CasoEstado.NORMALIZANDO]: { etapa: "normalize", pct: 55 },
  [CasoEstado.CLASIFICANDO]: { etapa: "classify", pct: 75 },
  [CasoEstado.VALIDANDO]: { etapa: "validate", pct: 90 },
  [CasoEstado.PENDIENTE_CALIDAD]: { etapa: "extract", pct: 0 },
  [CasoEstado.EN_REVISION]: { etapa: "en_revision", pct: 100 },
  [CasoEstado.APROBADO]: { etapa: "completado", pct: 100 },
  [CasoEstado.INFORME_GENERADO]: { etapa: "completado", pct: 100 },
};

const ESTADOS_LOG_PIPELINE = new Set<string>([
  CasoEstado.EN_COLA,
  CasoEstado.PREPROCESANDO,
  CasoEstado.EXTRAYENDO,
  CasoEstado.NORMALIZANDO,
  CasoEstado.CLASIFICANDO,
  CasoEstado.VALIDANDO,
  CasoEstado.PENDIENTE_CALIDAD,
  CasoEstado.ERROR,
  CasoEstado.EN_REVISION,
]);

const ESTADO_CASO_LABEL: Record<string, string> = {
  [CasoEstado.RECIBIDO]: "Recibido",
  [CasoEstado.EN_COLA]: "En cola",
  [CasoEstado.PREPROCESANDO]: "Preprocesando",
  [CasoEstado.EXTRAYENDO]: "Extrayendo",
  [CasoEstado.NORMALIZANDO]: "Normalizando",
  [CasoEstado.CLASIFICANDO]: "Clasificando",
  [CasoEstado.VALIDANDO]: "Validando",
  [CasoEstado.EN_REVISION]: "En revisión",
  [CasoEstado.PENDIENTE_CALIDAD]: "Pendiente calidad",
  [CasoEstado.ERROR]: "Error",
};

const ACCION_MENSAJE: Record<string, (p: Record<string, unknown>) => string> = {
  extraccion_intento: (p) =>
    p.ok
      ? `Extracción IA intento ${p.attempt ?? "?"} OK (${p.lineasCount ?? 0} líneas, ${p.provider ?? "?"})`
      : `Extracción IA intento ${p.attempt ?? "?"} falló: ${String(p.error ?? "error")}`,
  extraccion_completada: (p) =>
    `Extracción completada — ${p.lineasCount ?? "?"} líneas leídas`,
  extraccion_derivada_revision: (p) =>
    `Extracción no automática — ${String(p.motivo ?? "derivado a revisión manual")}`,
};

const COLA_LABEL: Record<string, string> = {
  [QUEUE_NAMES.PREPROCESS]: "Preproceso",
  [QUEUE_NAMES.EXTRACT]: "Extracción IA",
  [QUEUE_NAMES.NORMALIZE]: "Normalización",
  [QUEUE_NAMES.CLASSIFY]: "Clasificación",
  [QUEUE_NAMES.VALIDATE]: "Validación",
};

function segundosEnEtapaActual(caso: CasoDocument): number {
  const historial = caso.estadoHistorial ?? [];
  for (let i = historial.length - 1; i >= 0; i -= 1) {
    const h = historial[i];
    if (h?.estado === caso.estado && h.at) {
      return Math.max(0, Math.floor((Date.now() - new Date(h.at).getTime()) / 1000));
    }
  }
  const updated = (caso as { updatedAt?: Date }).updatedAt;
  if (updated) {
    return Math.max(0, Math.floor((Date.now() - new Date(updated).getTime()) / 1000));
  }
  return 0;
}

async function buscarJobsCaso(casoId: string): Promise<
  Array<{ cola: string; colaLabel: string; estado: "active" | "waiting" | "delayed"; jobId: string }>
> {
  if (getQueueBackend() === "inline") return [];

  const connection = getRedisConnection(appConfig.redisUrl);
  const nombres = [
    QUEUE_NAMES.PREPROCESS,
    QUEUE_NAMES.EXTRACT,
    QUEUE_NAMES.NORMALIZE,
    QUEUE_NAMES.CLASSIFY,
    QUEUE_NAMES.VALIDATE,
  ];
  const out: Array<{
    cola: string;
    colaLabel: string;
    estado: "active" | "waiting" | "delayed";
    jobId: string;
  }> = [];

  for (const name of nombres) {
    const queue = new Queue(name, { connection });
    try {
      for (const state of ["active", "waiting", "delayed"] as const) {
        const jobs = await queue.getJobs([state], 0, 40);
        for (const job of jobs) {
          const data = job.data as PipelineJobData | ClassifyJobData;
          if (data?.casoId === casoId) {
            out.push({
              cola: name,
              colaLabel: COLA_LABEL[name] ?? name,
              estado: state,
              jobId: String(job.id ?? ""),
            });
          }
        }
      }
    } finally {
      await queue.close();
    }
  }
  return out;
}

interface InferirMotorContext {
  /** Documento con etapa extract sin metadata — extracción IA en curso. */
  extractDocEnCurso?: boolean;
}

function inferirMotor(
  caso: CasoDocument,
  jobs: Awaited<ReturnType<typeof buscarJobsCaso>>,
  segundosEnEtapa: number,
  ctx?: InferirMotorContext
): NonNullable<CasoProgresoDto["motor"]> {
  const backend = getQueueBackend();

  if (caso.procesamientoPausado) {
    return {
      backend,
      estado: "pausado",
      detalle: "El procesamiento está pausado por un administrador.",
    };
  }

  const ESTADOS_PIPELINE_ACTIVO = new Set<string>([
    CasoEstado.PREPROCESANDO,
    CasoEstado.EXTRAYENDO,
    CasoEstado.NORMALIZANDO,
    CasoEstado.CLASIFICANDO,
    CasoEstado.VALIDANDO,
  ]);

  const ESTADOS_PIPELINE_O_COLA = new Set<string>([
    CasoEstado.EN_COLA,
    ...ESTADOS_PIPELINE_ACTIVO,
  ]);

  if (backend === "inline") {
    const casoId = caso._id.toString();
    const activeMine = getInlineActiveRunForCaso(casoId);
    const activeOtro = getInlineActiveRun();

    const detalleTrabado = (estadoLabel: string) =>
      `Procesamiento trabado — ${Math.floor(segundosEnEtapa / 60)} min en "${estadoLabel}" sin avance. Reiniciá con foja cero si no responde.`;

    if (activeMine) {
      const secs = Math.floor((Date.now() - activeMine.startedAt) / 1000);
      const label = COLA_LABEL[activeMine.queueName] ?? activeMine.queueName;
      const detalleExtra =
        activeMine.queueName === QUEUE_NAMES.EXTRACT && secs > 120
          ? " La extracción IA puede tardar varios minutos en PDFs grandes."
          : "";
      return {
        backend,
        estado: "activo",
        detalle: `Job inline en curso: ${label} (${secs}s).${detalleExtra}`,
        jobCola: label,
      };
    }

    if (caso.estado === CasoEstado.EN_COLA) {
      const umbralTrabado = umbralSegundosProcesamientoTrabado(caso.estado);
      if (segundosEnEtapa > umbralTrabado) {
        return {
          backend,
          estado: "inactivo",
          detalle: detalleTrabado(ESTADO_CASO_LABEL[caso.estado] ?? caso.estado),
        };
      }

      const colaOcupada =
        isInlineQueueBusy(QUEUE_NAMES.PREPROCESS) || isInlineQueueBusy(QUEUE_NAMES.EXTRACT);
      const otroCasoActivo = activeOtro && activeOtro.casoId !== casoId;
      if (colaOcupada || otroCasoActivo) {
        const prep = inlineConcurrentStats(QUEUE_NAMES.PREPROCESS);
        const maxPrep = preprocessInlineConcurrency();
        const prepDetalle = prep
          ? ` Preproceso: ${prep.running}/${maxPrep} activos, ${prep.queued} en espera.`
          : "";
        const otro = otroCasoActivo
          ? ` Otro caso está en ${COLA_LABEL[activeOtro!.queueName] ?? activeOtro!.queueName}.`
          : "";
        return {
          backend,
          estado: "en_cola",
          detalle: `Esperando turno en cola inline.${prepDetalle}${otro}`,
        };
      }
    }

    const enPipeline = ESTADOS_PIPELINE_O_COLA.has(caso.estado);

    if (!enPipeline) {
      return { backend, estado: "inactivo", detalle: "No hay trabajo de pipeline en curso." };
    }

    if (ESTADOS_PIPELINE_ACTIVO.has(caso.estado)) {
      const umbralTrabado = umbralSegundosProcesamientoTrabado(caso.estado);

      // Trabado prevalece: otro caso en el worker no convierte un expediente huérfano en «en curso».
      if (segundosEnEtapa > umbralTrabado) {
        return {
          backend,
          estado: "inactivo",
          detalle: detalleTrabado(ESTADO_CASO_LABEL[caso.estado] ?? caso.estado),
        };
      }

      const otroCasoActivo = activeOtro && activeOtro.casoId !== casoId;
      if (otroCasoActivo) {
        return {
          backend,
          estado: "en_cola",
          detalle: `Esperando — otro caso está en ${COLA_LABEL[activeOtro!.queueName] ?? activeOtro!.queueName}.`,
        };
      }

      const extractEnCurso =
        caso.estado === CasoEstado.EXTRAYENDO &&
        (activeMine != null || ctx?.extractDocEnCurso === true);

      if (extractEnCurso) {
        return {
          backend,
          estado: "activo",
          detalle: detalleExtraccionEnCurso(segundosEnEtapa),
          jobCola: COLA_LABEL[QUEUE_NAMES.EXTRACT],
        };
      }

      if (caso.estado === CasoEstado.EXTRAYENDO) {
        return {
          backend,
          estado: "desconocido",
          detalle: detalleExtraccionEnCurso(segundosEnEtapa),
          jobCola: COLA_LABEL[QUEUE_NAMES.EXTRACT],
        };
      }

      return {
        backend,
        estado: "desconocido",
        detalle: "Pipeline inline — el job debería iniciar en breve.",
      };
    }

    return { backend, estado: "inactivo", detalle: "En cola — esperando inicio del pipeline." };
  }

  const activo = jobs.find((j) => j.estado === "active");
  if (activo) {
    return {
      backend,
      estado: "activo",
      detalle: `Job en ejecución: ${activo.colaLabel} (${activo.jobId})`,
      jobCola: activo.colaLabel,
      jobId: activo.jobId,
    };
  }

  const enCola = jobs.find((j) => j.estado === "waiting" || j.estado === "delayed");
  if (enCola) {
    return {
      backend,
      estado: "en_cola",
      detalle: `En cola Redis — ${enCola.colaLabel}. Verificá que el worker esté corriendo.`,
      jobCola: enCola.colaLabel,
      jobId: enCola.jobId,
    };
  }

  const enPipeline = ESTADOS_PIPELINE_O_COLA.has(caso.estado);

  const umbralTrabado = umbralSegundosProcesamientoTrabado(caso.estado);
  if (enPipeline && segundosEnEtapa > umbralTrabado) {
    return {
      backend,
      estado: "inactivo",
      detalle:
        "Sin jobs activos ni en cola para este caso — posible procesamiento trabado. Probá reiniciar a foja cero.",
    };
  }

  if (enPipeline) {
    return {
      backend,
      estado: "desconocido",
      detalle: "Estado de pipeline en curso; aún no hay job visible en Redis.",
    };
  }

  return { backend, estado: "inactivo", detalle: "Pipeline finalizado o detenido." };
}

function eventoMensaje(accion: string, payload: Record<string, unknown>): string {
  const fn = ACCION_MENSAJE[accion];
  if (fn) return fn(payload);
  if (accion.includes("extraccion")) return accion.replace(/_/g, " ");
  return accion.replace(/_/g, " ");
}

export async function buildProgreso(casoId: string): Promise<CasoProgresoDto | null> {
  const [caso, docs] = await Promise.all([
    CasoModel.findById(casoId),
    DocumentoFuenteModel.find({ casoId }),
  ]);
  if (!caso) return null;

  const esPendienteCalidad = caso.estado === CasoEstado.PENDIENTE_CALIDAD;
  const fromEstado = ETAPA_BY_ESTADO[caso.estado];
  let progresoPct = fromEstado?.pct ?? 0;
  let etapaActual = fromEstado?.etapa;

  const ultimoErrorDoc = docs.find((d) => d.procesamiento?.ultimoError);

  if (esPendienteCalidad) {
    progresoPct = 0;
    etapaActual = "extract";
  } else if (docs.length) {
    const maxDoc = docs.reduce((best, d) => Math.max(best, d.procesamiento?.progresoPct ?? 0), 0);
    if (maxDoc > progresoPct && maxDoc < 100) {
      progresoPct = maxDoc;
    }
    const docEtapa = docs.find((d) => d.procesamiento?.etapaActual)?.procesamiento?.etapaActual;
    if (docEtapa) etapaActual = docEtapa;
  }

  const eventosDb = await AuditoriaEventoModel.find({ casoId })
    .sort({ at: -1 })
    .limit(40)
    .lean();

  const eventosHistorial = (caso.estadoHistorial ?? [])
    .filter((h) => ESTADOS_LOG_PIPELINE.has(h.estado))
    .map((h) => ({
      at: new Date(h.at).toISOString(),
      accion: "transicion_estado",
      mensaje: `Pipeline → ${ESTADO_CASO_LABEL[h.estado] ?? h.estado}${
        h.nota ? ` — ${String(h.nota).slice(0, 100)}` : ""
      }`,
    }));

  const eventosAuditoria = eventosDb
    .filter((e) => e.accion.startsWith("extraccion_"))
    .map((e) => ({
      at: new Date(e.at).toISOString(),
      accion: e.accion,
      mensaje: eventoMensaje(e.accion, (e.payload as Record<string, unknown>) ?? {}),
    }));

  const eventosMerged = [...eventosHistorial, ...eventosAuditoria]
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(-14);

  const segundosEnEtapa = segundosEnEtapaActual(caso);
  const jobs = await buscarJobsCaso(casoId);
  const extractDocEnCurso = docs.some(
    (d) => d.procesamiento?.etapaActual === "extract" && !d.extractMetadata
  );
  const motor = inferirMotor(caso, jobs, segundosEnEtapa, { extractDocEnCurso });

  const umbralAlertaTrabado = umbralSegundosProcesamientoTrabado(caso.estado);
  if (
    motor.estado === "inactivo" &&
    ESTADOS_LOG_PIPELINE.has(caso.estado) &&
    segundosEnEtapa > umbralAlertaTrabado
  ) {
    eventosMerged.push({
      at: new Date().toISOString(),
      accion: "alerta_trabado",
      mensaje: `Sin job activo — ${Math.floor(segundosEnEtapa / 60)} min en "${ESTADO_CASO_LABEL[caso.estado] ?? caso.estado}" sin avanzar.`,
    });
  } else if (motor.estado === "activo") {
    const active = getInlineActiveRun();
    if (active?.casoId === casoId) {
      const secs = Math.floor((Date.now() - active.startedAt) / 1000);
      eventosMerged.push({
        at: new Date(active.startedAt).toISOString(),
        accion: "job_inline_activo",
        mensaje: `Job inline en ejecución: ${COLA_LABEL[active.queueName] ?? active.queueName} (${secs}s)`,
      });
    }
  } else if (motor.estado === "en_cola" && motor.detalle) {
    eventosMerged.push({
      at: new Date().toISOString(),
      accion: "cola_inline",
      mensaje: motor.detalle,
    });
  }

  const eventosRecientes = eventosMerged.slice(-12);

  const ultimaEntradaHistorial = [...(caso.estadoHistorial ?? [])]
    .reverse()
    .find((h) => h.estado === caso.estado);

  return {
    casoId,
    estado: caso.estado,
    etapaActual,
    progresoPct,
    documentos: docs.map((d) => ({
      id: d._id.toString(),
      nombre: d.nombreOriginal,
      etapaActual: d.procesamiento?.etapaActual ?? undefined,
      progresoPct: d.procesamiento?.progresoPct ?? undefined,
      ultimoError: d.procesamiento?.ultimoError ?? undefined,
    })),
    actualizadoEn: (caso as { updatedAt?: Date }).updatedAt?.toISOString(),
    segundosEnEtapa,
    pausado: caso.procesamientoPausado === true,
    ultimoError: ultimoErrorDoc?.procesamiento?.ultimoError ?? undefined,
    ultimoErrorCodigo: ultimoErrorDoc?.procesamiento?.ultimoErrorCodigo ?? undefined,
    notaEtapa: ultimaEntradaHistorial?.nota ?? undefined,
    motor,
    jobs: jobs.map((j) => ({
      cola: j.colaLabel,
      estado: j.estado,
      jobId: j.jobId,
    })),
    eventosRecientes,
  };
}
