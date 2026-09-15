import { createCanvas } from "@napi-rs/canvas";
import { loadPdfDocument } from "./pdf-loader.js";
import {
  assessPageRenderQuality,
  type PageRenderQualityResult,
} from "./pdf-render-quality.js";
import { scanPdfPagesText } from "./pdf-text-scan.js";

export interface PdfPageImage {
  pageNum: number;
  buffer: Buffer;
  mimeType: string;
  /** Método usado para generar la página (auditoría). */
  metodo?: "canvas" | "text_overlay" | "canvas_alta_res";
}

export type PdfRenderMetodo = NonNullable<PdfPageImage["metodo"]>;

type PdfDocument = Awaited<ReturnType<typeof loadPdfDocument>>;

export interface PreprocessRenderResult {
  pages: PdfPageImage[];
  metodo: "canvas" | "text_overlay" | "mixto";
  valido: boolean;
  errores: string[];
  calidadPorPagina: PageRenderQualityResult[];
}

interface RenderPageOptions {
  maxPx: number;
  baseScale?: number;
  outputFormat?: "png" | "jpeg";
  jpegQuality?: number;
  intent?: "display" | "print";
  textOverlay?: boolean;
  loadOptions?: Parameters<typeof loadPdfDocument>[1];
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

type CanvasCtx = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;

function paintWhiteBackground(ctx: CanvasCtx, width: number, height: number): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

async function overlayPdfTextOnCanvas(
  pdfPage: Awaited<ReturnType<PdfDocument["getPage"]>>,
  ctx: CanvasCtx,
  viewport: { width: number; height: number },
  scale: number
): Promise<void> {
  const content = await pdfPage.getTextContent();
  ctx.fillStyle = "#111111";
  ctx.textBaseline = "alphabetic";
  for (const item of content.items) {
    if (!("str" in item) || !item.str) continue;
    const t = item.transform;
    const fontSize = Math.max(6, Math.hypot(t[0], t[1]) * scale);
    const x = t[4] * scale;
    const y = viewport.height - t[5] * scale;
    ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillText(item.str, x, y);
  }
}

async function renderPdfPageWithDoc(
  pdf: PdfDocument,
  pageNum: number,
  opts: RenderPageOptions
): Promise<PdfPageImage | null> {
  try {
    if (pageNum < 1 || pageNum > pdf.numPages) return null;

    const pdfPage = await pdf.getPage(pageNum);
    const base = pdfPage.getViewport({ scale: 1 });
    const baseScale = opts.baseScale ?? 2;
    const scale = computeRenderScale(base.width, base.height, opts.maxPx, baseScale);
    const viewport = pdfPage.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    paintWhiteBackground(ctx, canvas.width, canvas.height);

    await pdfPage.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      intent: opts.intent ?? "display",
    }).promise;

    let metodo: PdfRenderMetodo = opts.textOverlay
      ? "text_overlay"
      : opts.baseScale && opts.baseScale > 2
        ? "canvas_alta_res"
        : "canvas";

    if (opts.textOverlay) {
      await overlayPdfTextOnCanvas(pdfPage, ctx, viewport, scale);
    }

    const outputFormat = opts.outputFormat ?? "jpeg";
    let buffer: Buffer;
    let mimeType: string;
    if (outputFormat === "png") {
      buffer = canvas.toBuffer("image/png");
      mimeType = "image/png";
    } else {
      const q = Math.min(100, Math.max(60, opts.jpegQuality ?? 88));
      try {
        buffer = canvas.toBuffer("image/jpeg", q);
        mimeType = "image/jpeg";
      } catch {
        buffer = canvas.toBuffer("image/png");
        mimeType = "image/png";
      }
    }

    return { pageNum, buffer, mimeType, metodo };
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
      const rendered = await renderPdfPageWithDoc(pdf, i, {
        maxPx,
        jpegQuality,
        outputFormat: "jpeg",
      });
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
  try {
    const pdf = await loadPdfDocument(pdfBuffer);
    const maxPx = pdfRenderMaxPxForFile(pdfBuffer);
    const jpegQuality = jpegQualityForFile(pdfBuffer);
    const out: PdfPageImage[] = [];

    for (const pageNum of pageNums) {
      const rendered = await renderPdfPageWithDoc(pdf, pageNum, {
        maxPx,
        jpegQuality,
        outputFormat: "jpeg",
      });
      if (rendered) out.push(rendered);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Preproceso PDF con validación de calidad y fallback:
 * 1) canvas estándar (PNG, fondo blanco)
 * 2) canvas alta resolución + intent print
 * 3) canvas + superposición de capa de texto (PDFs con fuentes Type3 / Helvetica_path)
 */
export async function renderPdfForPreprocess(
  pdfBuffer: Buffer,
  maxPages = 12
): Promise<PreprocessRenderResult> {
  const errores: string[] = [];
  const calidadPorPagina: PageRenderQualityResult[] = [];
  const pages: PdfPageImage[] = [];
  const metodosUsados = new Set<PdfRenderMetodo>();

  try {
    const pdf = await loadPdfDocument(pdfBuffer);
    const textScans = await scanPdfPagesText(pdfBuffer);
    const textByPage = new Map(textScans.map((s) => [s.pageNum, s.text.length]));
    const count = Math.min(pdf.numPages, maxPages);
    const maxPx = pdfRenderMaxPxForFile(pdfBuffer);

    for (let pageNum = 1; pageNum <= count; pageNum++) {
      const pdfTextChars = textByPage.get(pageNum) ?? 0;
      const attempts: Array<{ label: string; render: () => Promise<PdfPageImage | null> }> = [
        {
          label: "canvas",
          render: () =>
            renderPdfPageWithDoc(pdf, pageNum, {
              maxPx,
              outputFormat: "png",
            }),
        },
        {
          label: "canvas_alta_res",
          render: () =>
            renderPdfPageWithDoc(pdf, pageNum, {
              maxPx: Math.max(maxPx, 2400),
              baseScale: 3,
              outputFormat: "png",
              intent: "print",
            }),
        },
        {
          label: "text_overlay",
          render: () =>
            renderPdfPageWithDoc(pdf, pageNum, {
              maxPx,
              outputFormat: "png",
              textOverlay: true,
            }),
        },
      ];

      let chosen: PdfPageImage | null = null;
      let lastQuality: PageRenderQualityResult | null = null;

      for (const attempt of attempts) {
        const rendered = await attempt.render();
        if (!rendered) continue;

        const quality = await assessPageRenderQuality({
          pageNum,
          buffer: rendered.buffer,
          mimeType: rendered.mimeType,
          pdfTextChars,
        });
        lastQuality = quality;

        if (quality.ok) {
          chosen = rendered;
          if (rendered.metodo) metodosUsados.add(rendered.metodo);
          calidadPorPagina.push(quality);
          break;
        }
      }

      if (!chosen) {
        const motivo =
          lastQuality?.motivo ??
          (pdfTextChars >= 80
            ? "No se pudo renderizar texto legible en la página"
            : "No se pudo generar derivado de la página");
        errores.push(`Pág. ${pageNum}: ${motivo}`);
        if (lastQuality) calidadPorPagina.push(lastQuality);
        continue;
      }

      pages.push(chosen);
    }

    if (pages.length === 0) {
      errores.push("No se generó ninguna página derivada del PDF");
    }

    const metodo: PreprocessRenderResult["metodo"] =
      metodosUsados.size === 0
        ? "canvas"
        : metodosUsados.size === 1
          ? ([...metodosUsados][0] === "text_overlay" ? "text_overlay" : "canvas")
          : "mixto";

    return {
      pages,
      metodo,
      valido: pages.length > 0 && errores.length === 0,
      errores,
      calidadPorPagina,
    };
  } catch (e) {
    errores.push(e instanceof Error ? e.message : "Error al renderizar PDF");
    return { pages: [], metodo: "canvas", valido: false, errores, calidadPorPagina };
  }
}
