import { DocumentoFuenteModel, LineaContableModel } from "@ffa/db";
import type { ProvenanceCasoDto } from "@ffa/shared";
import type { ProvenanceExtraccion } from "@ffa/pipeline";

function buildExtraccion(prov: ProvenanceExtraccion | undefined): ProvenanceCasoDto["extraccion"] {
  if (!prov) return undefined;
  return {
    seleccionPaginas: prov.seleccionPaginas,
    paginasPdfTotal: prov.paginasPdfTotal,
    paginasEnviadasVision: prov.paginasEnviadasVision,
    paginasOmitidasVision: prov.paginasOmitidasVision,
    complementoHeuristico: prov.complementoHeuristicoPostExtract,
    lineasOmitidasEstimadas: prov.lineasOmitidasEstimadas ?? 0,
    textoNativoPrimario: prov.textoNativoPrimario ?? false,
  };
}

function buildClasificacion(
  lineas: Array<{ origenClasificacion?: string | null; rubroInstitucionalId?: unknown }>
): ProvenanceCasoDto["clasificacion"] {
  let iaPrimaria = 0;
  let semanticaFallback = 0;
  let regla = 0;
  let criterioContribuyente = 0;
  let manual = 0;
  let otro = 0;

  for (const l of lineas) {
    const o = l.origenClasificacion ?? "";
    if (o === "ia_clasificacion" || o === "ia_pre_revision" || o === "ia_revision") iaPrimaria++;
    else if (o === "semantica" || o === "asistida") semanticaFallback++;
    else if (o === "regla") regla++;
    else if (o === "criterio_contribuyente") criterioContribuyente++;
    else if (o === "manual") manual++;
    else otro++;
  }

  return {
    iaPrimaria,
    semanticaFallback,
    regla,
    criterioContribuyente,
    manual,
    otro,
  };
}

function detectaFallback(
  extraccion: ProvenanceCasoDto["extraccion"],
  clasificacion: ProvenanceCasoDto["clasificacion"]
): boolean {
  if (extraccion?.textoNativoPrimario && (extraccion.lineasOmitidasEstimadas ?? 0) <= 3) {
    return (clasificacion?.semanticaFallback ?? 0) > 0;
  }
  if (extraccion?.complementoHeuristico) return true;
  if (extraccion?.seleccionPaginas === "heuristica" && (extraccion.paginasOmitidasVision ?? 0) > 0) {
    return true;
  }
  const semFallback = clasificacion?.semanticaFallback ?? 0;
  const iaPrimaria = clasificacion?.iaPrimaria ?? 0;
  if (semFallback > 0 && iaPrimaria === 0) return true;
  /** Fallback parcial: algunas líneas cayeron a heurística tras fallo IA. */
  if (semFallback > 0 && semFallback >= Math.max(3, Math.floor((semFallback + iaPrimaria) * 0.15))) {
    return true;
  }
  if (
    (extraccion?.lineasOmitidasEstimadas ?? 0) > 3 &&
    extraccion?.seleccionPaginas !== "pdf_corto_completo"
  ) {
    return true;
  }
  return false;
}

function bannerFromProvenance(
  extraccion: ProvenanceCasoDto["extraccion"],
  clasificacion: ProvenanceCasoDto["clasificacion"],
  usaFallback: boolean
): { mensaje?: string; tipo?: "info" | "warning" } {
  if (!usaFallback) return {};

  const partes: string[] = [];
  if (extraccion?.seleccionPaginas === "heuristica" && extraccion.paginasOmitidasVision > 0) {
    partes.push(
      `${extraccion.paginasEnviadasVision}/${extraccion.paginasPdfTotal} páginas enviadas a Vision (heurística)`
    );
  }
  if (extraccion?.complementoHeuristico) partes.push("complemento regex en extracción");
  const lineasOmitidas = extraccion?.lineasOmitidasEstimadas ?? 0;
  if (lineasOmitidas > 0) {
    partes.push(`~${lineasOmitidas} filas PDF no extraídas`);
  }
  const semFallback = clasificacion?.semanticaFallback ?? 0;
  if (semFallback > 0) {
    partes.push(`${semFallback} líneas con clasificación heurística`);
  }

  if (extraccion?.textoNativoPrimario && partes.length <= 1 && (extraccion.lineasOmitidasEstimadas ?? 0) <= 3) {
    return {
      mensaje: `Extracción desde texto nativo del PDF (${extraccion.paginasEnviadasVision}/${extraccion.paginasPdfTotal} pág. validadas con Vision).`,
      tipo: "info",
    };
  }

  if (partes.length === 0) return {};
  return {
    mensaje: `Parte del procesamiento usó heurística en lugar de IA: ${partes.join(" · ")}.`,
    tipo: "warning",
  };
}

export async function buildProvenanceCaso(casoId: string): Promise<ProvenanceCasoDto | undefined> {
  const [documento, lineas] = await Promise.all([
    DocumentoFuenteModel.findOne({ casoId })
      .sort({ createdAt: -1 })
      .select("extractPayload.provenanceExtraccion"),
    LineaContableModel.find({ casoId }).select("origenClasificacion rubroInstitucionalId"),
  ]);

  const provRaw = (
    documento?.extractPayload as { provenanceExtraccion?: ProvenanceExtraccion } | undefined
  )?.provenanceExtraccion;

  const extraccion = buildExtraccion(provRaw);
  const clasificacion = buildClasificacion(lineas);
  const usaFallbackHeuristico = detectaFallback(extraccion, clasificacion);
  let banner = bannerFromProvenance(extraccion, clasificacion, usaFallbackHeuristico);
  if (!banner.mensaje && extraccion?.textoNativoPrimario) {
    banner = {
      mensaje: `Extracción primaria desde texto nativo del PDF (${extraccion.paginasEnviadasVision}/${extraccion.paginasPdfTotal} pág. con validación Vision).`,
      tipo: "info",
    };
  }

  if (!extraccion && lineas.length === 0) return undefined;

  return {
    extraccion,
    clasificacion,
    usaFallbackHeuristico,
    bannerMensaje: banner.mensaje,
    bannerTipo: banner.tipo,
  };
}
