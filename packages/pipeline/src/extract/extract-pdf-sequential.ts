import type { ExtractResult, PaginaClasificada } from "../types.js";
import type { PdfPageImage } from "./pdf-render.js";
import { mergeExtractPages } from "./merge-extract.js";
import { ExtractValidationError } from "./validate-schema.js";

const CANONICAL_SECTIONS = new Set(["balance", "resultados", "flujo_efectivo"]);

export type ExtractPdfPageFn = (
  page: PdfPageImage,
  pageIndex: number,
  totalPlanned: number
) => Promise<ExtractResult>;

function earlyAbortAfterPages(): number {
  const n = Number(process.env.EXTRACT_EARLY_ABORT_EMPTY_PAGES ?? 4);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

function sectionForPage(clasificadas: PaginaClasificada[] | undefined, pageNum: number): string | undefined {
  return clasificadas?.find((c) => c.pagina === pageNum)?.seccion;
}

function totalLineas(partials: ExtractResult[]): number {
  return partials.reduce((sum, p) => sum + (p.lineas?.length ?? 0), 0);
}

function shouldAbortEarly(
  partials: ExtractResult[],
  processed: PdfPageImage[],
  clasificadas: PaginaClasificada[] | undefined,
  remaining: PdfPageImage[]
): string | null {
  if (totalLineas(partials) > 0) return null;

  const triedCanonical = processed.some((pg) => {
    const sec = sectionForPage(clasificadas, pg.pageNum);
    return sec != null && CANONICAL_SECTIONS.has(sec);
  });

  if (triedCanonical) {
    return "Se requiere al menos una línea extraída (páginas contables sin datos numéricos)";
  }

  const minPages = earlyAbortAfterPages();
  if (processed.length < minPages) return null;

  const remainingHasCanonical = remaining.some((pg) => {
    const sec = sectionForPage(clasificadas, pg.pageNum);
    return sec != null && CANONICAL_SECTIONS.has(sec);
  });
  if (remainingHasCanonical) return null;

  return "Se requiere al menos una línea extraída (documento sin tablas contables detectadas)";
}

/** Procesa páginas PDF en serie con aborto temprano si no hay líneas contables. */
export async function extractPdfPagesSequential(
  pages: PdfPageImage[],
  extractPage: ExtractPdfPageFn,
  opts?: { paginasClasificadas?: PaginaClasificada[] }
): Promise<ExtractResult> {
  if (pages.length === 0) {
    throw new ExtractValidationError("Se requiere al menos una línea extraída");
  }

  const partials: ExtractResult[] = [];
  const processed: PdfPageImage[] = [];

  for (let i = 0; i < pages.length; i += 1) {
    const pg = pages[i]!;
    const partial = await extractPage(pg, i + 1, pages.length);
    partial.lineas = partial.lineas.map((l) => ({
      ...l,
      paginaNumero: l.paginaNumero || pg.pageNum,
    }));
    partials.push(partial);
    processed.push(pg);

    const remaining = pages.slice(i + 1);
    const abortReason = shouldAbortEarly(partials, processed, opts?.paginasClasificadas, remaining);
    if (abortReason) {
      throw new ExtractValidationError(abortReason);
    }
  }

  return mergeExtractPages(partials, { paginasClasificadas: opts?.paginasClasificadas });
}
