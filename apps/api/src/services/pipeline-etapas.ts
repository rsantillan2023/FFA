import {
  CasoModel,
  DocumentoFuenteModel,
  FichaCanonicaModel,
  IndicadorCalculadoModel,
  InformeComiteModel,
  LineaContableModel,
  ValidacionResultadoModel,
  type CasoDocument,
} from "@ffa/db";
import { CasoEstado, type PipelineEtapaDto } from "@ffa/shared";

const ETAPA_INICIO: Record<string, string[]> = {
  "AA.1": [CasoEstado.RECIBIDO],
  "AA.2": [CasoEstado.PREPROCESANDO, CasoEstado.EXTRAYENDO],
  "AA.3": [CasoEstado.NORMALIZANDO],
  "AA.4": [CasoEstado.CLASIFICANDO],
  "AA.5": [CasoEstado.VALIDANDO],
  "AA.6": [CasoEstado.EN_REVISION],
  "AA.7": [CasoEstado.APROBADO],
  "AA.8": [CasoEstado.INFORME_GENERADO],
};

const ETAPA_FIN: Record<string, string[]> = {
  "AA.1": [CasoEstado.EN_COLA, CasoEstado.PREPROCESANDO],
  "AA.2": [CasoEstado.NORMALIZANDO],
  "AA.3": [CasoEstado.CLASIFICANDO],
  "AA.4": [CasoEstado.VALIDANDO],
  "AA.5": [CasoEstado.EN_REVISION],
  "AA.6": [CasoEstado.APROBADO],
  "AA.7": [CasoEstado.INFORME_GENERADO],
};

/** Estado del caso → paso AA en curso (para % de progreso global). */
const ESTADO_AA: Partial<Record<string, string>> = {
  [CasoEstado.RECIBIDO]: "AA.1",
  [CasoEstado.EN_COLA]: "AA.1",
  [CasoEstado.PREPROCESANDO]: "AA.2",
  [CasoEstado.EXTRAYENDO]: "AA.2",
  [CasoEstado.NORMALIZANDO]: "AA.3",
  [CasoEstado.CLASIFICANDO]: "AA.4",
  [CasoEstado.VALIDANDO]: "AA.5",
  [CasoEstado.PENDIENTE_CALIDAD]: "AA.2",
  [CasoEstado.EN_REVISION]: "AA.6",
  [CasoEstado.APROBADO]: "AA.7",
  [CasoEstado.INFORME_GENERADO]: "AA.8",
};

const ETAPA_PCT: Partial<Record<string, number>> = {
  [CasoEstado.RECIBIDO]: 5,
  [CasoEstado.EN_COLA]: 8,
  [CasoEstado.PREPROCESANDO]: 15,
  [CasoEstado.EXTRAYENDO]: 35,
  [CasoEstado.NORMALIZANDO]: 55,
  [CasoEstado.CLASIFICANDO]: 75,
  [CasoEstado.VALIDANDO]: 90,
  [CasoEstado.PENDIENTE_CALIDAD]: 0,
};

/** Orden del workflow — define qué pasos AA ya se superaron. */
const ESTADO_ORDEN: string[] = [
  CasoEstado.RECIBIDO,
  CasoEstado.EN_COLA,
  CasoEstado.PREPROCESANDO,
  CasoEstado.EXTRAYENDO,
  CasoEstado.NORMALIZANDO,
  CasoEstado.CLASIFICANDO,
  CasoEstado.VALIDANDO,
  CasoEstado.EN_REVISION,
  CasoEstado.APROBADO,
  CasoEstado.INFORME_GENERADO,
];

/** Nivel mínimo del caso para considerar cerrado cada paso AA. */
const PASO_NIVEL_MIN: Record<string, string> = {
  "AA.1": CasoEstado.EN_COLA,
  "AA.2": CasoEstado.NORMALIZANDO,
  "AA.3": CasoEstado.CLASIFICANDO,
  "AA.4": CasoEstado.VALIDANDO,
  "AA.5": CasoEstado.EN_REVISION,
  "AA.6": CasoEstado.APROBADO,
  "AA.7": CasoEstado.INFORME_GENERADO,
  "AA.8": CasoEstado.INFORME_GENERADO,
};

function nivelEstado(estado: string): number {
  const i = ESTADO_ORDEN.indexOf(estado);
  return i >= 0 ? i : 0;
}

/** PENDIENTE_CALIDAD es un corte temprano en extracción — no implica haber superado etapas posteriores. */
function nivelEstadoParaPipeline(estado: string): number {
  if (estado === CasoEstado.PENDIENTE_CALIDAD) {
    return nivelEstado(CasoEstado.EXTRAYENDO);
  }
  return nivelEstado(estado);
}

function estadoSupero(casoEstado: string, minEstado: string): boolean {
  return nivelEstadoParaPipeline(casoEstado) >= nivelEstado(minEstado);
}

type HistorialEntry = { at: Date; estado: string; nota?: string | null };

/** Historial desde el último reinicio a foja cero (evita mezclar corridas). */
function historialCorridaActual(caso: CasoDocument): HistorialEntry[] {
  const hist = (caso.estadoHistorial ?? []) as HistorialEntry[];
  if (!hist.length) return [];
  for (let i = hist.length - 1; i >= 0; i -= 1) {
    const h = hist[i];
    if (
      h?.estado === CasoEstado.EN_COLA &&
      h.nota?.toLowerCase().includes("reinicio")
    ) {
      return hist.slice(i);
    }
  }
  return hist;
}

function earliestHistorial(historial: HistorialEntry[], estados: string[]): Date | undefined {
  let best: Date | undefined;
  for (const h of historial ?? []) {
    if (!estados.includes(h.estado)) continue;
    const t = new Date(h.at);
    if (!best || t < best) best = t;
  }
  return best;
}

function earliestHistorialAfter(
  historial: HistorialEntry[],
  estados: string[],
  after?: Date
): Date | undefined {
  let best: Date | undefined;
  for (const h of historial ?? []) {
    if (!estados.includes(h.estado)) continue;
    const t = new Date(h.at);
    if (after && t.getTime() <= after.getTime()) continue;
    if (!best || t < best) best = t;
  }
  return best;
}

interface EtapaTimingScratch {
  etapa: PipelineEtapaDto;
  iniciadaEn?: Date;
  completadaEn?: Date;
  index?: number;
}

function enrichEtapasTiming(caso: CasoDocument, etapas: PipelineEtapaDto[]): PipelineEtapaDto[] {
  const aaActual = ESTADO_AA[caso.estado];
  const pctGlobal = ETAPA_PCT[caso.estado];
  const now = Date.now();
  const historial = historialCorridaActual(caso);
  const nivelCaso = nivelEstadoParaPipeline(caso.estado);

  const scratch: EtapaTimingScratch[] = etapas.map((etapa, index) => {
    const pasoAlcanzado =
      nivelCaso >= nivelEstado(PASO_NIVEL_MIN[etapa.id] ?? CasoEstado.RECIBIDO);
    const enCursoPaso = etapa.id === aaActual && !etapa.completada;

    if (!pasoAlcanzado && !enCursoPaso) {
      return { etapa, iniciadaEn: undefined, completadaEn: undefined };
    }

    const inicioEstados = ETAPA_INICIO[etapa.id] ?? [];
    const finEstados = ETAPA_FIN[etapa.id] ?? [];
    const inicioCorrida = historial[0]?.at ? new Date(historial[0].at) : undefined;

    let iniciadaEn =
      earliestHistorial(historial, inicioEstados) ??
      (etapa.id === "AA.1"
        ? (inicioCorrida ?? (caso as { createdAt?: Date }).createdAt)
        : undefined);

    let completadaEn: Date | undefined;
    if (etapa.completada) {
      completadaEn =
        earliestHistorialAfter(historial, finEstados, iniciadaEn) ??
        earliestHistorial(historial, finEstados);
    }

    return { etapa, iniciadaEn, completadaEn, index };
  });

  for (let i = 0; i < scratch.length; i++) {
    if (!scratch[i].iniciadaEn && i > 0 && scratch[i - 1].completadaEn) {
      scratch[i].iniciadaEn = scratch[i - 1].completadaEn;
    }
    if (scratch[i].etapa.completada && !scratch[i].completadaEn && i < scratch.length - 1) {
      const nextInicio = ETAPA_INICIO[scratch[i + 1].etapa.id] ?? [];
      if (nextInicio.length) {
        scratch[i].completadaEn = earliestHistorialAfter(
          historial,
          nextInicio,
          scratch[i].iniciadaEn
        );
      }
    }
  }

  return scratch.map(({ etapa, iniciadaEn, completadaEn }) => {
    const enCurso = etapa.id === aaActual && !etapa.completada;
    let progresoPct: number | undefined;
    if (enCurso && pctGlobal != null) progresoPct = pctGlobal;

    let duracionSegundos: number | undefined;
    if (iniciadaEn) {
      const fin = completadaEn ?? (enCurso ? new Date(now) : undefined);
      if (fin) {
        duracionSegundos = Math.max(0, Math.floor((fin.getTime() - iniciadaEn.getTime()) / 1000));
      }
    }

    let detalle = etapa.detalle;
    if (
      enCurso &&
      etapa.id === "AA.2" &&
      caso.estado !== CasoEstado.PENDIENTE_CALIDAD &&
      duracionSegundos != null &&
      duracionSegundos > 90
    ) {
      const mins = Math.floor(duracionSegundos / 60);
      const tiempo = mins > 0 ? `${mins} min` : `${duracionSegundos} s`;
      detalle = `${detalle ?? "Extracción IA en curso"} — lleva ${tiempo} (normal en PDFs grandes; si supera ~10 min probá reiniciar el caso)`;
    }

    return {
      ...etapa,
      detalle,
      enCurso,
      iniciadaEn: iniciadaEn?.toISOString(),
      completadaEn: completadaEn?.toISOString(),
      progresoPct: enCurso ? progresoPct : undefined,
      duracionSegundos: enCurso || etapa.completada ? duracionSegundos : undefined,
    };
  });
}

/** Marca completada solo si todas las etapas anteriores también lo están. */
function aplicarSecuenciaPipeline(etapas: PipelineEtapaDto[]): PipelineEtapaDto[] {
  let secuenciaRota = false;
  return etapas.map((etapa) => {
    const rawComplete = etapa.completada;
    const completada = !secuenciaRota && rawComplete;
    if (!completada) secuenciaRota = true;
    if (!completada && rawComplete) {
      return {
        ...etapa,
        completada: false,
        detalle: `En espera de etapas anteriores (${etapa.detalle ?? "parcial"})`,
      };
    }
    return { ...etapa, completada };
  });
}

export async function getPipelineEtapas(casoId: string): Promise<PipelineEtapaDto[]> {
  const [caso, docs, lineas, validaciones, ficha, indicadores, informe] = await Promise.all([
    CasoModel.findById(casoId),
    DocumentoFuenteModel.find({ casoId }),
    LineaContableModel.countDocuments({ casoId }),
    ValidacionResultadoModel.countDocuments({ casoId }),
    FichaCanonicaModel.findOne({ casoId }),
    FichaCanonicaModel.findOne({ casoId }).then(async (f) =>
      f ? IndicadorCalculadoModel.countDocuments({ fichaId: f._id }) : 0
    ),
    InformeComiteModel.findOne({ casoId, estado: { $ne: "archivado" } }).sort({
      createdAt: -1,
    }),
  ]);

  if (!caso) return [];

  const esPendienteCalidad = caso.estado === CasoEstado.PENDIENTE_CALIDAD;
  const postRecepcion = caso.estado !== CasoEstado.RECIBIDO;
  const extraccionEnCurso =
    caso.estado === CasoEstado.PREPROCESANDO || caso.estado === CasoEstado.EXTRAYENDO;
  const extraccionCompletada =
    !esPendienteCalidad &&
    !extraccionEnCurso &&
    (lineas > 0 ||
      estadoSupero(caso.estado, CasoEstado.NORMALIZANDO) ||
      docs.some((d) => Boolean(d.extractMetadata) && lineas > 0));
  const metaDoc = docs.find((d) => d.extractMetadata);
  const normalizado =
    !esPendienteCalidad &&
    (Boolean(caso.moneda || caso.escala || caso.periodo?.ejercicio) ||
      Boolean(metaDoc?.extractMetadata?.moneda || metaDoc?.extractMetadata?.escala) ||
      estadoSupero(caso.estado, CasoEstado.CLASIFICANDO));
  const lineasClasificadas = await LineaContableModel.countDocuments({
    casoId,
    rubroInstitucionalId: { $exists: true, $ne: null },
  });
  const clasificado =
    !esPendienteCalidad &&
    (lineasClasificadas > 0 || estadoSupero(caso.estado, CasoEstado.VALIDANDO));
  const validado =
    !esPendienteCalidad &&
    ((validaciones > 0 && Boolean(caso.semaforo)) ||
      estadoSupero(caso.estado, CasoEstado.EN_REVISION));
  const revisionOk =
    ficha?.estado === "aprobada" ||
    caso.estado === CasoEstado.APROBADO ||
    caso.estado === CasoEstado.INFORME_GENERADO;
  const analisisOk = typeof indicadores === "number" && indicadores > 0;
  const informeOk = Boolean(informe);

  const docEnProceso = docs.find(
    (d) =>
      d.procesamiento?.etapaActual === "extract" ||
      d.procesamiento?.etapaActual === "preprocess" ||
      (caso.estado === CasoEstado.EXTRAYENDO && !d.extractMetadata)
  );
  const detalleExtraccion = (() => {
    if (esPendienteCalidad) {
      const docFallido = docs.find((d) => d.procesamiento?.ultimoError);
      return docFallido?.procesamiento?.ultimoError ?? "Extracción fallida — revisión manual";
    }
    if (lineas > 0) return `${lineas} línea(s)`;
    const proc = docEnProceso?.procesamiento;
    if (proc?.etapaActual === "extract") {
      return "Extracción IA en curso";
    }
    if (proc?.etapaActual === "preprocess") return "Preprocesando PDF";
    if (caso.estado === CasoEstado.PREPROCESANDO) return "Preprocesando documento";
    if (caso.estado === CasoEstado.EXTRAYENDO) return "Extracción IA en curso";
    return "Pendiente extracción";
  })();

  const etapas: PipelineEtapaDto[] = [
    {
      id: "AA.1",
      nombre: "Recepción",
      completada: docs.length > 0 && postRecepcion,
      detalle: docs.length ? `${docs.length} documento(s)` : "Sin documentos",
    },
    {
      id: "AA.2",
      nombre: "Extracción",
      completada: extraccionCompletada,
      detalle: detalleExtraccion,
    },
    {
      id: "AA.3",
      nombre: "Normalización",
      completada: normalizado,
      detalle: normalizado
        ? `${caso.moneda ?? metaDoc?.extractMetadata?.moneda ?? "?"} · escala ${caso.escala ?? metaDoc?.extractMetadata?.escala ?? "?"}`
        : caso.estado === CasoEstado.NORMALIZANDO
          ? "Normalizando metadatos del expediente"
          : "Metadatos pendientes",
    },
    {
      id: "AA.4",
      nombre: "Clasificación",
      completada: clasificado,
      detalle: clasificado ? "Líneas con rubro" : "Sin clasificar",
    },
    {
      id: "AA.5",
      nombre: "Validación",
      completada: validado,
      detalle: validado ? `Semáforo ${caso.semaforo}` : "Sin validaciones",
    },
    {
      id: "AA.6",
      nombre: "Revisión",
      completada: revisionOk,
      detalle: ficha ? `Ficha ${ficha.estado}` : "Sin ficha",
    },
    {
      id: "AA.7",
      nombre: "Análisis (indicadores)",
      completada: analisisOk,
      detalle: analisisOk ? `${indicadores} indicador(es)` : "Sin indicadores",
    },
    {
      id: "AA.8",
      nombre: "Informe",
      completada: informeOk,
      detalle: informe ? `Informe ${informe.estado}` : "Sin informe",
    },
  ];

  return enrichEtapasTiming(caso, aplicarSecuenciaPipeline(etapas));
}
