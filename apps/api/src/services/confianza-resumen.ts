import {
  CasoModel,
  DocumentoFuenteModel,
  LineaContableModel,
  ValidacionResultadoModel,
} from "@ffa/db";
import {
  CasoEstado,
  semaforoDesdeConfianza,
  semaforoEfectivo,
  type ConfianzaResumenDto,
  type SemaforoConfianza,
} from "@ffa/shared";
import { calcularConfianzaClasificacionCaso } from "./revision.js";
import { buildProvenanceCaso } from "./provenance-caso.js";

function normalizarPctExtraccion(val: number | null | undefined): number | null {
  if (val == null || Number.isNaN(val)) return null;
  if (val <= 1) return Math.round(val * 100);
  return Math.round(val);
}

function informeExtraccionPct(doc: { extractPayload?: { informeExtraccion?: { confianzaGlobal?: number } } } | null): number | null {
  const raw = doc?.extractPayload?.informeExtraccion?.confianzaGlobal;
  return normalizarPctExtraccion(raw);
}

function buildMensajes(input: {
  totalLineas: number;
  lineasSinRubro: number;
  lineasRequierenRevision: number;
  validacionesFallidas: number;
  validacionesTotal: number;
  confianzaClasificacion: number | null;
  confianzaExtraccion: number | null;
  lineasAltaConfianza: number;
}): { mensajePrincipal: string; mensajeSecundario?: string } {
  const {
    totalLineas,
    lineasSinRubro,
    lineasRequierenRevision,
    validacionesFallidas,
    validacionesTotal,
    confianzaClasificacion,
    confianzaExtraccion,
    lineasAltaConfianza,
  } = input;

  if (totalLineas === 0) {
    return {
      mensajePrincipal: "Aún no hay líneas extraídas",
      mensajeSecundario: "El caso puede estar en procesamiento o sin lectura exitosa del PDF.",
    };
  }

  const pctSinRubro = Math.round((lineasSinRubro / totalLineas) * 100);
  const pctRevision = Math.round((lineasRequierenRevision / totalLineas) * 100);

  if (pctSinRubro >= 50) {
    return {
      mensajePrincipal: `${pctSinRubro}% de líneas no se mapearon al plan de cuentas`,
      mensajeSecundario: `${lineasSinRubro} de ${totalLineas} líneas quedaron sin rubro institucional.`,
    };
  }

  if (pctRevision >= 50) {
    return {
      mensajePrincipal: `${lineasRequierenRevision} líneas requieren revisión manual`,
      mensajeSecundario: "Revisá denominaciones dudosas, montos inconsistentes o clasificación incierta.",
    };
  }

  if (confianzaClasificacion != null && confianzaClasificacion >= 85) {
    if (validacionesFallidas > 0) {
      return {
        mensajePrincipal: "Clasificación sólida al plan de cuentas",
        mensajeSecundario: `${lineasAltaConfianza} líneas con confianza ≥ 85%. Pendiente: ${validacionesFallidas} validación(es) contable(s).`,
      };
    }
    return {
      mensajePrincipal: "Clasificación sólida al plan de cuentas",
      mensajeSecundario: `${lineasAltaConfianza} líneas con confianza ≥ 85%.`,
    };
  }

  if (
    confianzaExtraccion != null &&
    confianzaExtraccion >= 70 &&
    confianzaClasificacion != null &&
    confianzaClasificacion < 60
  ) {
    return {
      mensajePrincipal: "La lectura es buena, pero la clasificación es débil",
      mensajeSecundario:
        "Probablemente el plan institucional no cubre bien este tipo de documento (p. ej. IFRS extenso).",
    };
  }

  if (validacionesTotal > 0 && validacionesFallidas >= Math.ceil(validacionesTotal / 2)) {
    if (confianzaClasificacion != null && confianzaClasificacion >= 50) {
      return {
        mensajePrincipal: "Clasificación aceptable — revisar cuadratura y controles",
        mensajeSecundario: `${validacionesFallidas} validación(es) contable(s) con diferencias respecto al documento.`,
      };
    }
    return {
      mensajePrincipal: `${validacionesFallidas} validaciones contables fallidas`,
      mensajeSecundario: "Cuadraturas o controles cruzados con diferencias respecto al documento.",
    };
  }

  if (confianzaClasificacion != null && confianzaClasificacion >= 50) {
    return {
      mensajePrincipal: "Confianza moderada — conviene revisar algunas líneas",
      mensajeSecundario: `${lineasSinRubro} sin rubro · ${lineasRequierenRevision} en revisión.`,
    };
  }

  return {
    mensajePrincipal: "Confianza baja — revisar con atención",
    mensajeSecundario: `${lineasSinRubro} sin rubro · ${lineasRequierenRevision} en revisión.`,
  };
}

export async function buildConfianzaResumen(casoId: string): Promise<ConfianzaResumenDto | null> {
  const caso = await CasoModel.findById(casoId).select("confianzaGlobal semaforo estado");
  if (!caso) return null;

  const [lineas, validaciones, documento, confianzaViva, provenance] = await Promise.all([
    LineaContableModel.find({ casoId }).select(
      "confianzaClasificacion confianzaExtraccion rubroInstitucionalId requiereRevision origenClasificacion"
    ),
    ValidacionResultadoModel.find({ casoId }).select("passed"),
    DocumentoFuenteModel.findOne({ casoId })
      .sort({ createdAt: -1 })
      .select("extractPayload.informeExtraccion.confianzaGlobal"),
    calcularConfianzaClasificacionCaso(casoId),
    buildProvenanceCaso(casoId),
  ]);

  const totalLineas = lineas.length;
  const lineasSinRubro = lineas.filter((l) => !l.rubroInstitucionalId).length;
  const lineasConRubro = totalLineas - lineasSinRubro;
  const lineasRequierenRevision = lineas.filter((l) => l.requiereRevision).length;
  const lineasAltaConfianza = lineas.filter(
    (l) => (l.confianzaClasificacion ?? 0) >= 85 && !!l.rubroInstitucionalId
  ).length;

  const confianzaClasificacion = confianzaViva > 0 ? confianzaViva : caso.confianzaGlobal ?? null;

  if (
    confianzaClasificacion != null &&
    confianzaClasificacion !== caso.confianzaGlobal
  ) {
    await CasoModel.findByIdAndUpdate(casoId, { confianzaGlobal: confianzaClasificacion });
  }

  const extracciones = lineas
    .map((l) => normalizarPctExtraccion(l.confianzaExtraccion))
    .filter((v): v is number => v != null);
  const confianzaExtraccion = extracciones.length
    ? Math.round(extracciones.reduce((a, b) => a + b, 0) / extracciones.length)
    : null;

  const validacionesOk = validaciones.filter((v) => v.passed).length;
  const validacionesFallidas = validaciones.length - validacionesOk;

  const { mensajePrincipal, mensajeSecundario } = buildMensajes({
    totalLineas,
    lineasSinRubro,
    lineasRequierenRevision,
    validacionesFallidas,
    validacionesTotal: validaciones.length,
    confianzaClasificacion,
    confianzaExtraccion,
    lineasAltaConfianza,
  });

  let confianzaInformeExtraccion = informeExtraccionPct(documento);

  /** En revisión manual el snapshot post-lectura del PDF no aporta al ciclo del analista. */
  if (caso.estado === CasoEstado.EN_REVISION) {
    confianzaInformeExtraccion = null;
  }

  const semaforoClasificacion = (semaforoDesdeConfianza(confianzaClasificacion) ??
    null) as SemaforoConfianza | null;
  const semaforoValidacion = (caso.semaforo ?? null) as SemaforoConfianza | null;

  return {
    casoId,
    confianzaClasificacion,
    confianzaExtraccion,
    confianzaInformeExtraccion,
    semaforoClasificacion,
    semaforoValidacion,
    semaforoEfectivo: semaforoEfectivo(semaforoClasificacion, semaforoValidacion) ?? null,
    totalLineas,
    lineasConRubro,
    lineasSinRubro,
    lineasRequierenRevision,
    lineasAltaConfianza,
    validacionesOk,
    validacionesFallidas,
    validacionesTotal: validaciones.length,
    mensajePrincipal,
    mensajeSecundario,
    provenance,
  };
}
