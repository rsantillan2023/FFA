import type { ExtractedLine, ExtractResult, PaginaClasificada } from "../types.js";
import { denomBaseBalance } from "../balance/dedupe-fuzzy-balance.js";
import {
  buildLineasDesdeTextoEscaneado,
  calcularCoberturaTablas,
  type BuildLineasTextoCtx,
} from "./extraer-lineas-tabla-texto.js";
import { dedupeFuzzyBalanceLineas } from "../balance/dedupe-fuzzy-balance.js";
import { montosCoinciden } from "../balance/parse-balance-pdf-page.js";

function nativePrimaryEnabled(): boolean {
  const flag = process.env.EXTRACT_NATIVE_PRIMARY?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return true;
}

function shortPdfMaxPages(): number {
  const n = Number(process.env.EXTRACT_SHORT_PDF_ALL_PAGES ?? 6);
  return Number.isFinite(n) && n > 0 ? n : 6;
}

/** PDF corto con texto nativo legible en todas las páginas incluidas. */
export function esPdfTextoNativoCandidato(result: ExtractResult): boolean {
  const pages = (result.paginasClasificadas ?? []).filter((p) => p.incluida);
  if (pages.length === 0 || pages.length > shortPdfMaxPages()) return false;
  const minChars = Number(process.env.EXTRACT_NATIVE_MIN_CHARS ?? 120);
  return pages.every((p) => (p.textoEscaneado?.trim().length ?? 0) >= minChars);
}

function lineaMergeKey(linea: Pick<ExtractedLine, "denominacionOriginal" | "paginaNumero">): string {
  return `${linea.paginaNumero}|${denomBaseBalance(linea.denominacionOriginal)}`;
}

function montoLinea(l: ExtractedLine): number {
  return l.montoNormalizado ?? l.montoOriginal;
}

/** Detecta filas con el mismo monto en una página (síntoma de columna incorrecta en Vision). */
function detectarMontosDuplicadosSospechosos(
  lineas: ExtractedLine[],
  pagina: number
): Map<number, ExtractedLine[]> {
  const porPagina = lineas.filter((l) => l.paginaNumero === pagina);
  const byMonto = new Map<number, ExtractedLine[]>();
  for (const l of porPagina) {
    const m = Math.round(montoLinea(l));
    if (m === 0) continue;
    const bucket = byMonto.get(m) ?? [];
    bucket.push(l);
    byMonto.set(m, bucket);
  }
  const sospechosos = new Map<number, ExtractedLine[]>();
  for (const [m, grupo] of byMonto) {
    if (grupo.length >= 3) sospechosos.set(m, grupo);
  }
  return sospechosos;
}

function corregirSangradoColumnaEnPagina(
  lineas: ExtractedLine[],
  pagina: PaginaClasificada,
  nativas: ExtractedLine[]
): ExtractedLine[] {
  const sospechosos = detectarMontosDuplicadosSospechosos(lineas, pagina.pagina);
  if (sospechosos.size === 0) return lineas;

  const nativasPag = nativas.filter((l) => l.paginaNumero === pagina.pagina);
  const nativaByDenom = new Map(nativasPag.map((l) => [lineaMergeKey(l), l]));

  return lineas.map((l) => {
    if (l.paginaNumero !== pagina.pagina) return l;
    const m = Math.round(montoLinea(l));
    const grupo = sospechosos.get(m);
    if (!grupo?.includes(l)) return l;

    const nativa = nativaByDenom.get(lineaMergeKey(l));
    if (!nativa) return l;
    if (montosCoinciden(montoLinea(l), montoLinea(nativa))) return l;

    return {
      ...l,
      montoOriginal: nativa.montoOriginal,
      montoOriginalTexto: nativa.montoOriginalTexto,
      montoNormalizado: nativa.montoNormalizado,
      estadoFinancieroLinea: nativa.estadoFinancieroLinea ?? l.estadoFinancieroLinea,
      metodoExtraccion: "heuristica",
      confianzaExtraccion: 0.9,
      requiereRevision: false,
      motivoRevision: undefined,
    };
  });
}

function fusionarPagina(
  vision: ExtractedLine[],
  nativas: ExtractedLine[],
  pagina: PaginaClasificada
): ExtractedLine[] {
  const visionMap = new Map(vision.map((l) => [lineaMergeKey(l), l]));
  const out: ExtractedLine[] = [];
  const used = new Set<string>();

  for (const nat of nativas) {
    const key = lineaMergeKey(nat);
    used.add(key);
    const vis = visionMap.get(key);
    if (!vis) {
      out.push({
        ...nat,
        metodoExtraccion: "heuristica",
        confianzaExtraccion: Math.max(nat.confianzaExtraccion ?? 0, 0.88),
        fuentePrioridad: "canonico",
      });
      continue;
    }

    const preferNativo =
      !montosCoinciden(montoLinea(vis), montoLinea(nat)) ||
      (vis.metodoExtraccion !== "heuristica" && (vis.confianzaExtraccion ?? 1) < 0.9);

    if (preferNativo) {
      out.push({
        ...vis,
        montoOriginal: nat.montoOriginal,
        montoOriginalTexto: nat.montoOriginalTexto,
        montoNormalizado: nat.montoNormalizado,
        estadoFinancieroLinea: nat.estadoFinancieroLinea ?? vis.estadoFinancieroLinea,
        metodoExtraccion: "heuristica",
        confianzaExtraccion: 0.92,
        requiereRevision: false,
        motivoRevision: undefined,
      });
    } else {
      out.push(vis);
    }
  }

  for (const vis of vision) {
    const key = lineaMergeKey(vis);
    if (used.has(key)) continue;
    out.push(vis);
  }

  return corregirSangradoColumnaEnPagina(out, pagina, nativas);
}

/**
 * P1–P3: prioriza filas del texto nativo del PDF sobre Vision en PDFs cortos legibles.
 * Corrige montos erróneos y completa filas omitidas por el LLM.
 */
export function fusionarExtractTextoNativoPrimario(result: ExtractResult): ExtractResult {
  if (!nativePrimaryEnabled() || !esPdfTextoNativoCandidato(result)) {
    return result;
  }

  const ctx: BuildLineasTextoCtx = {
    moneda: result.metadata.moneda,
    escala: result.metadata.escala,
    escalaFactor: result.metadata.escalaFactor,
    locale: (result.metadata as { localeNumerico?: string }).localeNumerico as "es-AR" | undefined,
    ejercicio: result.metadata.periodo?.ejercicio,
  };

  const paginas = (result.paginasClasificadas ?? []).filter((p) => p.incluida && p.textoEscaneado?.trim());
  const nativas = buildLineasDesdeTextoEscaneado(paginas, ctx);
  if (!nativas.length) return result;

  const visionByPag = new Map<number, ExtractedLine[]>();
  for (const l of result.lineas) {
    const p = l.paginaNumero ?? 1;
    const bucket = visionByPag.get(p) ?? [];
    bucket.push(l);
    visionByPag.set(p, bucket);
  }

  const merged: ExtractedLine[] = [];
  const paginasProcesadas = new Set<number>();

  for (const pg of paginas) {
    paginasProcesadas.add(pg.pagina);
    const vision = visionByPag.get(pg.pagina) ?? [];
    const natPag = nativas.filter((l) => l.paginaNumero === pg.pagina);
    merged.push(...fusionarPagina(vision, natPag, pg));
  }

  for (const [pag, vision] of visionByPag) {
    if (paginasProcesadas.has(pag)) continue;
    merged.push(...vision);
  }

  const coberturaPost = calcularCoberturaTablas(result, merged);
  const lineasAnadidas = Math.max(0, merged.length - result.lineas.length);
  const lineasCorregidas = merged.filter((l) => {
    const prev = result.lineas.find((v) => lineaMergeKey(v) === lineaMergeKey(l));
    return prev && !montosCoinciden(montoLinea(prev), montoLinea(l));
  }).length;

  const omitidasPost = coberturaPost.reduce((s, t) => s + (t.filasOmitidas ?? 0), 0);
  const { lineas: mergedDeduped } = dedupeFuzzyBalanceLineas(merged);

  return {
    ...result,
    lineas: mergedDeduped,
    provenanceExtraccion: result.provenanceExtraccion
      ? {
          ...result.provenanceExtraccion,
          textoNativoPrimario: true,
          lineasDesdeTextoNativo: nativas.length,
          lineasAnadidasDesdeTexto: lineasAnadidas,
          lineasMontosCorregidos: lineasCorregidas,
          lineasOmitidasEstimadas: omitidasPost,
        }
      : undefined,
    informeExtraccion: result.informeExtraccion
      ? {
          ...result.informeExtraccion,
          coberturaTablas: coberturaPost,
          cuentasExtraidas: merged.length,
        }
      : undefined,
  };
}
