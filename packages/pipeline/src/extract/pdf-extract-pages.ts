import type { ExtractResult, PaginaClasificada, ProvenanceExtraccion } from "../types.js";
import { renderPdfPageNumbers, type PdfPageImage } from "./pdf-render.js";
import { selectPagesForExtraction } from "./pdf-page-select.js";
import { planPaginasConClaudeMap } from "./pdf-claude-map.js";
import { getPdfNumPages, scanPdfPagesText } from "./pdf-text-scan.js";

export interface PdfExtractPagePlan {
  pages: PdfPageImage[];
  totalPages: number;
  paginasClasificadas: PaginaClasificada[];
  usedSmartSelection: boolean;
  /** true si el plan vino del mapa Claude (PDF largo). */
  usedClaudePageMap?: boolean;
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

function shortPdfAllPagesMax(): number {
  const n = Number(process.env.EXTRACT_SHORT_PDF_ALL_PAGES ?? 6);
  return Number.isFinite(n) && n > 0 ? n : 6;
}

/** PDFs cortos con estados financieros: todas las páginas a Vision (más inferencia IA). */
function planAllPagesForShortPdf(
  pdfBuffer: Buffer,
  scans: Awaited<ReturnType<typeof scanPdfPagesText>>,
  totalPages: number
): Promise<PdfExtractPagePlan> | null {
  if (totalPages > shortPdfAllPagesMax()) return null;
  const pageNums = scans.map((s) => s.pageNum);
  return renderPdfPageNumbers(pdfBuffer, pageNums).then((pages) => ({
    pages,
    totalPages,
    paginasClasificadas: scans.map((s) => ({
      pagina: s.pageNum,
      seccion: s.seccion,
      score: s.score,
      incluida: true,
      textoEscaneado: s.text.trim() || undefined,
    })),
    usedSmartSelection: false,
  }));
}

export function buildProvenanceExtraccion(
  plan: PdfExtractPagePlan,
  proveedor: ProvenanceExtraccion["proveedorExtraccion"],
  complementoHeuristico = false
): ProvenanceExtraccion {
  let seleccionPaginas: ProvenanceExtraccion["seleccionPaginas"];
  if (plan.usedClaudePageMap) {
    seleccionPaginas = "claude_map";
  } else if (!plan.usedSmartSelection && plan.totalPages <= shortPdfAllPagesMax()) {
    seleccionPaginas = "pdf_corto_completo";
  } else if (plan.usedSmartSelection) {
    seleccionPaginas = "heuristica";
  } else {
    seleccionPaginas = "todas";
  }

  return {
    proveedorExtraccion: proveedor,
    seleccionPaginas,
    complementoHeuristicoPostExtract: complementoHeuristico,
    paginasPdfTotal: plan.totalPages,
    paginasEnviadasVision: plan.pages.length,
    paginasOmitidasVision: Math.max(0, plan.totalPages - plan.pages.length),
    usedClaudePageMap: Boolean(plan.usedClaudePageMap),
  };
}

function complementoHeuristicoActivo(): boolean {
  const flag = process.env.EXTRACT_HEURISTIC_COMPLEMENT?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "on";
}

export function attachProvenanceExtraccion(
  result: ExtractResult,
  plan: PdfExtractPagePlan,
  proveedor: ProvenanceExtraccion["proveedorExtraccion"]
): ExtractResult {
  return {
    ...result,
    provenanceExtraccion: buildProvenanceExtraccion(
      plan,
      proveedor,
      complementoHeuristicoActivo()
    ),
  };
}

/** Planifica y renderiza las páginas a enviar al modelo de visión. */
export async function planPdfPagesForExtraction(pdfBuffer: Buffer): Promise<PdfExtractPagePlan> {
  const maxPages = pdfMaxPages();
  const totalPages = await getPdfNumPages(pdfBuffer);

  if (totalPages === 0) {
    return { pages: [], totalPages: 0, paginasClasificadas: [], usedSmartSelection: false };
  }

  const scans = await scanPdfPagesText(pdfBuffer);

  const shortPlan = await planAllPagesForShortPdf(pdfBuffer, scans, totalPages);
  if (shortPlan) return shortPlan;

  const claudeMap = await planPaginasConClaudeMap(scans, totalPages, maxPages);
  if (claudeMap) {
    const scanByPage = new Map(scans.map((s) => [s.pageNum, s]));
    const pages = await renderPdfPageNumbers(pdfBuffer, claudeMap.paginasExtraer);
    const clasificadas: PaginaClasificada[] = claudeMap.paginasExtraer.map((pagina) => {
      const scan = scanByPage.get(pagina);
      const seccion = claudeMap.seccionesPorPagina.get(pagina) ?? scan?.seccion ?? "otro";
      return {
        pagina,
        seccion,
        score: scan?.score ?? 50,
        incluida: true,
        textoEscaneado: scan?.text.trim() || undefined,
      };
    });
    return {
      pages,
      totalPages,
      paginasClasificadas: clasificadas,
      usedSmartSelection: true,
      usedClaudePageMap: true,
    };
  }

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
