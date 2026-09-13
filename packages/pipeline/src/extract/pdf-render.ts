import { loadPdfDocument } from "./pdf-loader.js";

export interface PdfPageImage {
  pageNum: number;
  buffer: Buffer;
  mimeType: string;
}

function pdfRenderMaxPx(): number {
  const n = Number(process.env.PDF_RENDER_MAX_PX ?? 1800);
  return Number.isFinite(n) && n >= 800 ? n : 1800;
}

function pdfRenderMaxPxForFile(pdfBuffer: Buffer): number {
  const mb = pdfBuffer.length / (1024 * 1024);
  if (mb >= 10) return 1100;
  if (mb >= 5) return 1400;
  return pdfRenderMaxPx();
}

function jpegQualityForFile(pdfBuffer: Buffer): number {
  const configured = Number(process.env.PDF_RENDER_JPEG_QUALITY ?? 88);
  const base = Number.isFinite(configured) ? configured : 88;
  const mb = pdfBuffer.length / (1024 * 1024);
  if (mb >= 10) return Math.min(base, 72);
  if (mb >= 5) return Math.min(base, 80);
  return base;
}

function computeRenderScale(width: number, height: number, maxPx: number, baseScale = 2): number {
  const maxDim = Math.max(width, height) * baseScale;
  if (maxDim <= maxPx) return baseScale;
  return maxPx / Math.max(width, height);
}

async function renderPdfPage(
  pdfBuffer: Buffer,
  pageNum: number,
  maxPx: number,
  jpegQuality: number
): Promise<PdfPageImage | null> {
  try {
    const { createCanvas } = await import("@napi-rs/canvas");
    const pdf = await loadPdfDocument(pdfBuffer);
    if (pageNum < 1 || pageNum > pdf.numPages) return null;

    const pdfPage = await pdf.getPage(pageNum);
    const base = pdfPage.getViewport({ scale: 1 });
    const scale = computeRenderScale(base.width, base.height, maxPx);
    const viewport = pdfPage.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");

    await pdfPage.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    let buffer: Buffer;
    let mimeType: string;
    try {
      buffer = canvas.toBuffer("image/jpeg", Math.min(100, Math.max(60, jpegQuality)));
      mimeType = "image/jpeg";
    } catch {
      buffer = canvas.toBuffer("image/png");
      mimeType = "image/png";
    }

    return { pageNum, buffer, mimeType };
  } catch {
    return null;
  }
}

/** Renderiza páginas PDF a JPEG/PNG optimizado para visión multimodal (C.11–C.13). */
export async function renderPdfToPngPages(
  pdfBuffer: Buffer,
  maxPages = 12
): Promise<PdfPageImage[]> {
  try {
    const pdf = await loadPdfDocument(pdfBuffer);
    const count = Math.min(pdf.numPages, maxPages);
    const maxPx = pdfRenderMaxPxForFile(pdfBuffer);
    const jpegQuality = jpegQualityForFile(pdfBuffer);
    const out: PdfPageImage[] = [];

    for (let i = 1; i <= count; i++) {
      const rendered = await renderPdfPage(pdfBuffer, i, maxPx, jpegQuality);
      if (rendered) out.push(rendered);
    }
    return out;
  } catch {
    return [];
  }
}

/** Renderiza solo las páginas indicadas (priorización pre-extracción). */
export async function renderPdfPageNumbers(
  pdfBuffer: Buffer,
  pageNums: number[]
): Promise<PdfPageImage[]> {
  if (pageNums.length === 0) return [];
  const maxPx = pdfRenderMaxPxForFile(pdfBuffer);
  const jpegQuality = jpegQualityForFile(pdfBuffer);
  const out: PdfPageImage[] = [];

  for (const pageNum of pageNums) {
    const rendered = await renderPdfPage(pdfBuffer, pageNum, maxPx, jpegQuality);
    if (rendered) out.push(rendered);
  }
  return out;
}
