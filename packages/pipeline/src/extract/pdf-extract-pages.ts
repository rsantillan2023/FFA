import type { PaginaClasificada } from "../types.js";
import { renderPdfPageNumbers, type PdfPageImage } from "./pdf-render.js";
import { selectPagesForExtraction } from "./pdf-page-select.js";
import { getPdfNumPages, scanPdfPagesText } from "./pdf-text-scan.js";

export interface PdfExtractPagePlan {
  pages: PdfPageImage[];
  totalPages: number;
  paginasClasificadas: PaginaClasificada[];
  usedSmartSelection: boolean;
}

function pdfMaxPages(): number {
  const n = Number(
    process.env.ANTHROPIC_PDF_MAX_PAGES ?? process.env.OPENAI_PDF_MAX_PAGES ?? 24
  );
  return Number.isFinite(n) && n > 0 ? n : 24;
}

function smartSelectionEnabled(): boolean {
  const flag = process.env.PDF_SMART_PAGE_SELECTION?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return true;
}

/** Planifica y renderiza las páginas a enviar al modelo de visión. */
export async function planPdfPagesForExtraction(pdfBuffer: Buffer): Promise<PdfExtractPagePlan> {
  const maxPages = pdfMaxPages();
  const totalPages = await getPdfNumPages(pdfBuffer);

  if (totalPages === 0) {
    return { pages: [], totalPages: 0, paginasClasificadas: [], usedSmartSelection: false };
  }

  const scans = await scanPdfPagesText(pdfBuffer);

  // Siempre clasificar todas las páginas; la selección respeta obligatorias sin depender del tope
  if (!smartSelectionEnabled()) {
    const pageNums = scans.map((s) => s.pageNum);
    const pages = await renderPdfPageNumbers(pdfBuffer, pageNums);
    const clasificadas: PaginaClasificada[] = scans.map((s) => ({
      pagina: s.pageNum,
      seccion: s.seccion,
      score: s.score,
      incluida: true,
      textoEscaneado: s.text.trim() || undefined,
    }));
    return { pages, totalPages, paginasClasificadas: clasificadas, usedSmartSelection: false };
  }

  const { pageNums, clasificadas } = selectPagesForExtraction(scans, maxPages);
  const pages = await renderPdfPageNumbers(pdfBuffer, pageNums);

  if (pages.length === 0) {
    const fallbackNums = scans.slice(0, maxPages).map((s) => s.pageNum);
    const fallback = await renderPdfPageNumbers(pdfBuffer, fallbackNums);
    return {
      pages: fallback,
      totalPages,
      paginasClasificadas: clasificadas,
      usedSmartSelection: true,
    };
  }

  return {
    pages,
    totalPages,
    paginasClasificadas: clasificadas,
    usedSmartSelection: true,
  };
}
