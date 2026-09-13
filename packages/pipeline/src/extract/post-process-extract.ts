import type { CoberturaDesglose, ControlAritmeticoExtract, ExtractResult, InformeExtraccion, SeccionPagina } from "../types.js";
import { clasificarItemsExtract } from "./classify-extract-items.js";
import { buildSeccionesDetectadas } from "./build-secciones-detectadas.js";
import { crossValidateAndDedupe, setDedupeDefaultEjercicio, setDedupePaginasClasificadas } from "./dedupe-extract.js";
import { detectarInconsistencias } from "./cross-validate-extract.js";
import { enriquecerMonedaEscala } from "./detect-moneda-escala.js";
import { enriquecerMetadataIdentidad } from "./metadata-enrich.js";
import { ejecutarControlesAritmeticos } from "./extract-arithmetic-checks.js";
import { normalizarConfianzaExtraccion } from "./normalize-confianza.js";
import { normalizarMontosExtractResult } from "./normalizar-montos-extract.js";
import { extraerIndicadoresDesdeTranscripcion } from "./extraer-indicadores-texto.js";
import { calcularCoberturaTablas, complementarLineasDesdeTextoEscaneado } from "./extraer-lineas-tabla-texto.js";
import { normalizarSignoLinea, normalizarSignosExtractResult } from "./normalizar-signos-contables.js";
import { SECCIONES_CANONICAS_OBLIGATORIAS } from "./pdf-page-select.js";
import { esPaginaCanonicaObligatoria } from "./pdf-text-scan.js";

function seccionesDetectadasEnDoc(result: ExtractResult): Set<SeccionPagina> {
  const fromScan = new Set<SeccionPagina>();
  for (const pg of result.paginasClasificadas ?? []) {
    const scanLike = {
      pageNum: pg.pagina,
      text: "",
      seccion: pg.seccion,
      score: pg.score,
      tituloCanonico: pg.score >= 40,
    };
    if (esPaginaCanonicaObligatoria(scanLike)) fromScan.add(pg.seccion);
  }
  return fromScan;
}

function seccionesExtraidasEnLineas(result: ExtractResult): Set<SeccionPagina> {
  const out = new Set<SeccionPagina>();
  for (const l of result.lineas) {
    if (l.seccionPagina && SECCIONES_CANONICAS_OBLIGATORIAS.includes(l.seccionPagina)) {
      out.add(l.seccionPagina);
    }
  }
  return out;
}

function calcularCoberturaDesglose(
  result: ExtractResult,
  stats: {
    inconsistenciasReales: number;
    controlesFallidos: number;
    controlesTotal: number;
  },
  coberturaTablas: import("../types.js").CoberturaTablaPagina[]
): CoberturaDesglose {
  const detectados = seccionesDetectadasEnDoc(result);
  const extraidos = seccionesExtraidasEnLineas(result);

  const coberturaEstados =
    detectados.size > 0
      ? Math.round(100 * ([...detectados].filter((s) => extraidos.has(s)).length / detectados.size))
      : extraidos.size > 0
        ? Math.round(100 * extraidos.size / SECCIONES_CANONICAS_OBLIGATORIAS.length)
        : 0;

  const paginasRelevantes = (result.paginasClasificadas ?? []).filter((p) =>
    esPaginaCanonicaObligatoria({
      pageNum: p.pagina,
      text: "",
      seccion: p.seccion,
      score: p.score,
      tituloCanonico: p.score >= 40,
    })
  );
  const paginasRelevantesProcesadas = paginasRelevantes.filter((p) => p.incluida).length;
  const coberturaPaginasRelevantes =
    paginasRelevantes.length > 0
      ? Math.round(100 * (paginasRelevantesProcesadas / paginasRelevantes.length))
      : 100;

  const coberturaLineas =
    coberturaTablas.length > 0
      ? Math.round(
          coberturaTablas.reduce((a, t) => a + t.cobertura, 0) / coberturaTablas.length
        )
      : 0;

  const lineasRevision = result.lineas.filter((l) => l.requiereRevision).length;
  const calidadNumerica = Math.max(
    0,
    Math.round(100 - lineasRevision * 3 - stats.inconsistenciasReales * 5 - stats.controlesFallidos * 8)
  );

  const coberturaGlobal = Math.round(
    coberturaEstados * 0.35 +
      coberturaPaginasRelevantes * 0.25 +
      coberturaLineas * 0.15 +
      calidadNumerica * 0.25
  );

  return {
    coberturaEstados,
    coberturaPaginasRelevantes,
    coberturaLineas,
    calidadNumerica,
    coberturaGlobal,
    coberturaTablas,
  };
}

function calcularConfianzaGlobal(result: ExtractResult, cobertura: CoberturaDesglose): number {
  const confs = result.lineas.map((l) => normalizarConfianzaExtraccion(l.confianzaExtraccion));
  if (!confs.length) return 0.5;
  const avg = confs.reduce((a, b) => a + b, 0) / confs.length;
  const penalizacion = (result.inconsistencias?.length ?? 0) * 0.05;
  const fallos = (result.informeExtraccion?.controlesFallidos ?? 0) * 0.03;
  const penalCobertura = cobertura.coberturaGlobal < 80 ? (0.8 - cobertura.coberturaGlobal / 100) * 0.2 : 0;
  return Math.max(0.1, Math.min(1, avg - penalizacion - fallos - penalCobertura));
}

function aplicarControlesFallidos(
  lineas: ExtractResult["lineas"],
  controles: ControlAritmeticoExtract[]
): ExtractResult["lineas"] {
  const failed = controles.filter((c) => !c.passed);

  if (!failed.length) return lineas;

  const idsAfectados = new Set<string>();
  for (const ctrl of failed) {
    for (const ref of ctrl.lineasInvolucradas ?? []) {
      idsAfectados.add(ref);
    }
  }

  return lineas.map((linea) => {
    const id = linea.id ?? linea.denominacionOriginal;
    if (!idsAfectados.has(id) && !idsAfectados.has(linea.denominacionOriginal)) return linea;

    const ctrl = failed.find(
      (c) =>
        c.lineasInvolucradas?.includes(id) ||
        c.lineasInvolucradas?.includes(linea.denominacionOriginal)
    );
    if (!ctrl) return linea;

    return {
      ...linea,
      requiereRevision: true,
      motivoRevision: linea.motivoRevision ?? `Control aritmético fallido: ${ctrl.descripcion}`,
    };
  });
}

/** Post-procesamiento estructural post-merge. */
function enrichIndicadorNombre<T extends { denominacion: string; nombre?: string; origen?: string }>(
  items: T[]
): T[] {
  return items.map((i) => ({
    ...i,
    nombre: i.nombre ?? i.denominacion,
    origen: (i.origen as "extraido") ?? "extraido",
  }));
}

export function postProcessExtractResult(result: ExtractResult): ExtractResult {
  let working = normalizarMontosExtractResult(result);
  working = complementarLineasDesdeTextoEscaneado(working);
  working = normalizarSignosExtractResult(working);

  const paginasTotales = working.paginasClasificadas?.length ?? working.tiposPorPagina?.length ?? 0;

  const clasificadosPre = clasificarItemsExtract(working.lineas);

  setDedupePaginasClasificadas(working.paginasClasificadas);
  setDedupeDefaultEjercicio(working.metadata.periodo?.ejercicio);
  const { lineas: deduped, stats: dedupeStats } = crossValidateAndDedupe(clasificadosPre.lineasContables);

  const { lineas, inconsistencias, descartadasPorPeriodo } = detectarInconsistencias(deduped);
  const ctxSigno = {
    moneda: working.metadata.moneda,
    escala: working.metadata.escala,
    escalaFactor: working.metadata.escalaFactor,
    locale: (working.metadata as { localeNumerico?: string }).localeNumerico,
  };
  const lineasConSigno = lineas.map((l) => normalizarSignoLinea(l, ctxSigno));
  const controlesAritmeticos = ejecutarControlesAritmeticos(lineasConSigno);
  const seccionesDetectadas = buildSeccionesDetectadas(working.paginasClasificadas);

  let metadata = enriquecerMonedaEscala(working.metadata, working.transcripcionPaginas);
  metadata = enriquecerMetadataIdentidad(metadata, working.transcripcionPaginas);

  const paginasConLineas = new Set(lineas.map((l) => l.paginaNumero)).size;
  const paginasIncluidas = working.paginasClasificadas?.filter((p) => p.incluida).length ?? 0;
  const paginasProcesadas = Math.max(paginasConLineas, working.tiposPorPagina?.length ?? 0, paginasIncluidas);

  const desdeTexto = extraerIndicadoresDesdeTranscripcion(working);
  const dedupeInd = <T extends { denominacion: string; valor: number; periodo?: { etiqueta?: string } }>(
    items: T[]
  ): T[] => {
    const seen = new Set<string>();
    return items.filter((i) => {
      const key = `${i.denominacion}|${i.valor}|${i.periodo?.etiqueta ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const esIndicadorFinancieroValido = (i: { denominacion: string }) => {
    const d = i.denominacion.trim();
    if (d.length > 60 || d.length < 4) return false;
    if (/\d{1,2}\s*0,\d%|\bbps\b/i.test(d)) return false;
    return /^(ebitda|deuda|margen|ganancia neta|ingresos netos)/i.test(d) ||
      /ebitda ajustado|deuda neta|margen ebitda|deuda neta\s*\//i.test(d);
  };

  const indicadoresFinancieros = enrichIndicadorNombre(
    dedupeInd([
      ...(working.indicadoresFinancieros ?? []).filter(esIndicadorFinancieroValido),
      ...clasificadosPre.indicadoresFinancieros.filter(esIndicadorFinancieroValido),
      ...desdeTexto.financieros,
    ])
  );
  const indicadoresOperativos = enrichIndicadorNombre(
    dedupeInd([
      ...(working.indicadoresOperativos ?? []),
      ...clasificadosPre.indicadoresOperativos,
      ...desdeTexto.operativos,
    ])
  );

  const informeBase: InformeExtraccion = {
    paginasTotales,
    paginasProcesadas,
    paginasOmitidas: Math.max(0, paginasTotales - paginasProcesadas),
    seccionesDetectadas,
    cuentasExtraidas: lineas.length,
    indicadoresFinancierosExtraidos: indicadoresFinancieros.length,
    indicadoresOperativosExtraidos: indicadoresOperativos.length,
    duplicadosResueltos: dedupeStats.descartadasDuplicadas,
    duplicadosConfirmados: dedupeStats.duplicadosConfirmados,
    reclasificadosOperativos: clasificadosPre.reclasificadosOperativos,
    reclasificadosFinancieros: clasificadosPre.reclasificadosFinancieros,
    inconsistencias,
    inconsistenciasDescartadasPorPeriodo: descartadasPorPeriodo,
    controlesAritmeticos,
    controlesAprobados: controlesAritmeticos.filter((c) => c.passed).length,
    controlesFallidos: controlesAritmeticos.filter((c) => !c.passed).length,
    confianzaGlobal: 0,
    coberturaEstimadaPct: 0,
  };

  const lineasFinales = aplicarControlesFallidos(lineasConSigno, controlesAritmeticos);
  const coberturaTablas = calcularCoberturaTablas(working, lineasFinales);

  const coberturaDesglose = calcularCoberturaDesglose(
    { ...working, lineas: lineasFinales, informeExtraccion: informeBase },
    {
      inconsistenciasReales: inconsistencias.length,
      controlesFallidos: informeBase.controlesFallidos,
      controlesTotal: controlesAritmeticos.length,
    },
    coberturaTablas
  );

  const merged: ExtractResult = {
    ...working,
    metadata,
    lineas: lineasFinales,
    indicadoresFinancieros: indicadoresFinancieros.length ? indicadoresFinancieros : [],
    indicadoresOperativos: indicadoresOperativos.length ? indicadoresOperativos : [],
    seccionesDetectadas,
    inconsistencias,
    informeExtraccion: {
      ...informeBase,
      coberturaDesglose,
      coberturaTablas,
      coberturaEstimadaPct: coberturaDesglose.coberturaGlobal,
      cuentasExtraidas: lineasFinales.length,
    },
  };

  merged.informeExtraccion!.confianzaGlobal = calcularConfianzaGlobal(merged, coberturaDesglose);

  return merged;
}
