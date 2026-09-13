import { CasoEstado, type CasoEstadoHistorialEntry, type PipelineEtapaDto } from "@ffa/shared";

export type WorkflowStepStatus = "pending" | "active" | "completed" | "error";

export interface WorkflowMacroStep {
  id: string;
  orden: number;
  titulo: string;
  descripcion: string;
  icon: string;
  subetapas: string[];
  routeName?: string;
  routeLabel?: string;
}

export interface WorkflowStepView extends WorkflowMacroStep {
  status: WorkflowStepStatus;
  detalle?: string;
  fecha?: string;
}

/** Maestros y preparación (visible al expandir «Proceso extendido»). */
export const WORKFLOW_PREPEND_STEPS: WorkflowMacroStep[] = [
  {
    id: "maestros",
    orden: 0,
    titulo: "Maestros institucionales",
    descripcion:
      "Datos de referencia que el sistema usa antes y durante el procesamiento: empresas, plan contable y parámetros globales.",
    icon: "fas fa-database",
    subetapas: [
      "Directorio de contribuyentes (RUT, razón social, alias)",
      "Plan de cuentas vigente (rubros e importación CSV)",
      "Umbrales y reglas globales de clasificación",
    ],
    routeName: "contribuyentes",
    routeLabel: "Directorio de empresas",
  },
];

/** Análisis posterior al informe (visible al expandir «Proceso extendido»). */
export const WORKFLOW_APPEND_STEPS: WorkflowMacroStep[] = [
  {
    id: "comparacion",
    orden: 7,
    titulo: "Comparación histórica",
    descripcion:
      "Contrasta indicadores y balances de distintos ejercicios del mismo contribuyente para detectar tendencias.",
    icon: "fas fa-balance-scale",
    subetapas: [
      "Selección de fichas aprobadas del archivo",
      "Tabla comparativa de indicadores clave",
      "Variaciones entre ejercicios",
    ],
    routeName: "comparacion",
    routeLabel: "Comparar ejercicios",
  },
  {
    id: "consolidacion",
    orden: 8,
    titulo: "Consolidación de grupo",
    descripcion:
      "Agrupa entre 2 y 12 fichas aprobadas de empresas relacionadas para un análisis de holding o grupo económico.",
    icon: "fas fa-layer-group",
    subetapas: [
      "Selección de fichas del repositorio",
      "Revisión de empresas y ejercicios",
      "Indicadores agregados del grupo",
    ],
    routeName: "consolidacion",
    routeLabel: "Consolidar grupo",
  },
  {
    id: "operacion",
    orden: 9,
    titulo: "Monitoreo operativo",
    descripcion:
      "Seguimiento de colas, reintentos, alertas y salud del pipeline automático para administradores.",
    icon: "fas fa-heart-pulse",
    subetapas: [
      "Estado de colas de procesamiento",
      "Reintentos y fichas atascadas",
      "Notificaciones y accesos fallidos",
    ],
    routeName: "admin-operacion",
    routeLabel: "Centro de operación",
  },
];

export const WORKFLOW_MACRO_STEPS: WorkflowMacroStep[] = [
  {
    id: "carga",
    orden: 1,
    titulo: "Carga documental",
    descripcion: "Ingreso de la ficha financiera (PDF o imagen) y apertura del expediente.",
    icon: "fas fa-file-upload",
    subetapas: ["Recepción del documento", "Registro del caso", "Encolado para procesamiento"],
    routeName: "casos",
    routeLabel: "Bandeja de fichas",
  },
  {
    id: "procesamiento",
    orden: 2,
    titulo: "Procesamiento automático",
    descripcion: "Extracción, normalización, clasificación contable y validaciones del sistema.",
    icon: "fas fa-cogs",
    subetapas: ["Extracción OCR", "Normalización de montos", "Clasificación por rubros", "Validaciones automáticas"],
  },
  {
    id: "revision",
    orden: 3,
    titulo: "Revisión del analista",
    descripcion: "Validación humana de datos extraídos, correcciones e inconsistencias.",
    icon: "fas fa-user-check",
    subetapas: ["Comparación documento vs. datos", "Corrección de líneas", "Confirmación de alertas"],
    routeName: "caso-revision",
    routeLabel: "Estación de revisión",
  },
  {
    id: "aprobacion",
    orden: 4,
    titulo: "Aprobación de ficha",
    descripcion: "Cierre formal de la ficha canónica con indicadores calculados.",
    icon: "fas fa-check-circle",
    subetapas: ["Cuadratura verificada", "Ficha en estado aprobado", "Indicadores financieros"],
    routeName: "caso-revision",
    routeLabel: "Aprobar ficha",
  },
  {
    id: "archivo",
    orden: 5,
    titulo: "Archivo en repositorio",
    descripcion: "La ficha aprobada queda disponible para consulta histórica institucional.",
    icon: "fas fa-archive",
    subetapas: ["Publicación en repositorio", "Vinculación contribuyente/ejercicio", "Trazabilidad conservada"],
    routeName: "repositorio",
    routeLabel: "Repositorio",
  },
  {
    id: "informe",
    orden: 6,
    titulo: "Informe de comité",
    descripcion: "Elaboración del documento formal para presentación al comité de crédito.",
    icon: "fas fa-file-contract",
    subetapas: ["Generación preliminar", "Apartados del analista", "Exportación y cierre"],
    routeName: "caso-informe",
    routeLabel: "Informe de comité",
  },
];

export const WORKFLOW_ALL_STEPS: WorkflowMacroStep[] = [
  ...WORKFLOW_PREPEND_STEPS,
  ...WORKFLOW_MACRO_STEPS,
  ...WORKFLOW_APPEND_STEPS,
];

const ERROR_ESTADOS = new Set<string>([
  CasoEstado.ERROR,
  CasoEstado.RECHAZADO,
  CasoEstado.CANCELADO,
]);

const ESTADO_ACTIVE_ORDEN: Record<string, number> = {
  [CasoEstado.RECIBIDO]: 1,
  [CasoEstado.EN_COLA]: 1,
  [CasoEstado.PREPROCESANDO]: 2,
  [CasoEstado.EXTRAYENDO]: 2,
  [CasoEstado.NORMALIZANDO]: 2,
  [CasoEstado.CLASIFICANDO]: 2,
  [CasoEstado.VALIDANDO]: 2,
  [CasoEstado.PENDIENTE_CALIDAD]: 2,
  [CasoEstado.EN_REVISION]: 3,
  [CasoEstado.APROBADO]: 6,
  [CasoEstado.INFORME_GENERADO]: 7,
};

function pipelineByPrefix(pipeline: PipelineEtapaDto[], ids: string[]): PipelineEtapaDto[] {
  const set = new Set(ids);
  return pipeline.filter((p) => set.has(p.id));
}

function detalleFromPipeline(items: PipelineEtapaDto[]): string | undefined {
  const done = items.filter((i) => i.completada);
  if (!done.length && items.length) return items[0]?.detalle;
  if (done.length === items.length && items.length) return items[items.length - 1]?.detalle;
  const pendiente = items.find((i) => !i.completada);
  return pendiente?.detalle ?? done[done.length - 1]?.detalle;
}

function fechaForOrden(
  historial: CasoEstadoHistorialEntry[] | undefined,
  orden: number,
): string | undefined {
  if (!historial?.length) return undefined;
  const mapOrdenEstados: Record<number, string[]> = {
    1: [CasoEstado.RECIBIDO, CasoEstado.EN_COLA],
    2: [
      CasoEstado.PREPROCESANDO,
      CasoEstado.EXTRAYENDO,
      CasoEstado.NORMALIZANDO,
      CasoEstado.CLASIFICANDO,
      CasoEstado.VALIDANDO,
      CasoEstado.PENDIENTE_CALIDAD,
    ],
    3: [CasoEstado.EN_REVISION],
    4: [CasoEstado.APROBADO],
    6: [CasoEstado.INFORME_GENERADO],
  };
  const targets = mapOrdenEstados[orden];
  if (!targets) return undefined;
  const hit = historial.find((h) => targets.includes(h.estado));
  return hit?.at;
}

export function resolveWorkflowForCaso(input: {
  estado: string;
  pipeline?: PipelineEtapaDto[];
  progresoPct?: number;
  etapaActual?: string;
  historial?: CasoEstadoHistorialEntry[];
}): WorkflowStepView[] {
  const pipeline = input.pipeline ?? [];
  let activeOrden = ESTADO_ACTIVE_ORDEN[input.estado] ?? 1;
  const isError = ERROR_ESTADOS.has(input.estado);
  if (isError && input.historial?.length) {
    for (let i = input.historial.length - 1; i >= 0; i--) {
      const h = input.historial[i]!;
      if (!ERROR_ESTADOS.has(h.estado)) {
        activeOrden = ESTADO_ACTIVE_ORDEN[h.estado] ?? activeOrden;
        break;
      }
    }
  }
  const informeEtapa = pipeline.find((p) => p.id === "AA.8");
  const revisionEtapa = pipeline.find((p) => p.id === "AA.6");
  const aprobadoPlus =
    input.estado === CasoEstado.APROBADO || input.estado === CasoEstado.INFORME_GENERADO;

  return WORKFLOW_MACRO_STEPS.map((step) => {
    let status: WorkflowStepStatus = "pending";
    if (isError) {
      if (step.orden < activeOrden) status = "completed";
      else if (step.orden === Math.min(activeOrden, 6)) status = "error";
    } else if (step.orden < activeOrden) {
      status = "completed";
    } else if (step.orden === activeOrden || (input.estado === CasoEstado.APROBADO && step.orden === 6)) {
      status = input.estado === CasoEstado.INFORME_GENERADO ? "completed" : "active";
    } else if (input.estado === CasoEstado.APROBADO && step.orden <= 5) {
      status = "completed";
    }

    let detalle: string | undefined;
    switch (step.id) {
      case "carga":
        detalle = detalleFromPipeline(pipelineByPrefix(pipeline, ["AA.1"]));
        break;
      case "procesamiento":
        detalle =
          input.etapaActual && activeOrden === 2
            ? `Etapa técnica: ${input.etapaActual}${input.progresoPct != null ? ` · ${input.progresoPct}%` : ""}`
            : detalleFromPipeline(pipelineByPrefix(pipeline, ["AA.2", "AA.3", "AA.4", "AA.5"]));
        break;
      case "revision":
        detalle = revisionEtapa?.detalle ?? (input.estado === CasoEstado.EN_REVISION ? "En curso" : undefined);
        break;
      case "aprobacion":
        detalle = revisionEtapa?.completada ? revisionEtapa.detalle : undefined;
        break;
      case "archivo":
        detalle = aprobadoPlus ? "Disponible en repositorio institucional" : undefined;
        break;
      case "informe":
        detalle = informeEtapa?.detalle;
        break;
    }

    return {
      ...step,
      status,
      detalle,
      fecha: fechaForOrden(input.historial, step.orden),
    };
  });
}

export function workflowStepsGeneral(): WorkflowStepView[] {
  return WORKFLOW_MACRO_STEPS.map((step) => ({
    ...step,
    status: "pending" as WorkflowStepStatus,
  }));
}

export function workflowStepsExtended(): WorkflowStepView[] {
  return WORKFLOW_ALL_STEPS.map((step) => ({
    ...step,
    status: "pending" as WorkflowStepStatus,
  }));
}

export function findWorkflowStep(id: string): WorkflowMacroStep | undefined {
  return WORKFLOW_ALL_STEPS.find((s) => s.id === id);
}

const CASO_SCOPED_ROUTE_NAMES = new Set([
  "caso-expediente",
  "caso-revision",
  "caso-informe",
]);

/** Resuelve enlace de etapa; devuelve null si la ruta exige :id y no hay caso. */
export function workflowRouteFor(
  step: Pick<WorkflowMacroStep, "routeName">,
  casoId?: string,
): { name: string; params?: { id: string } } | null {
  const name = step.routeName;
  if (!name) return null;
  if (CASO_SCOPED_ROUTE_NAMES.has(name)) {
    if (!casoId) return null;
    return { name, params: { id: casoId } };
  }
  return { name };
}

const PROCESAMIENTO_ESTADOS = new Set<string>([
  CasoEstado.PREPROCESANDO,
  CasoEstado.EXTRAYENDO,
  CasoEstado.NORMALIZANDO,
  CasoEstado.CLASIFICANDO,
  CasoEstado.VALIDANDO,
  CasoEstado.PENDIENTE_CALIDAD,
]);

const CARGA_ESTADOS = new Set<string>([CasoEstado.RECIBIDO, CasoEstado.EN_COLA]);

/** Identificador de etapa macro (1–6) según el estado operativo del caso. */
export function macroEtapaIdForEstado(estado: string): string {
  if (CARGA_ESTADOS.has(estado)) return "carga";
  if (PROCESAMIENTO_ESTADOS.has(estado)) return "procesamiento";
  if (estado === CasoEstado.EN_REVISION) return "revision";
  if (estado === CasoEstado.APROBADO) return "aprobacion";
  if (estado === CasoEstado.INFORME_GENERADO) return "informe";
  if (ERROR_ESTADOS.has(estado)) return "interrumpido";
  return "carga";
}

export function macroEtapaLabelForEstado(estado: string): string {
  const id = macroEtapaIdForEstado(estado);
  if (id === "interrumpido") return "Interrumpido";
  const step = WORKFLOW_MACRO_STEPS.find((s) => s.id === id);
  return step ? `${step.orden}. ${step.titulo}` : estado;
}
