import { createCanvas, loadImage } from "@napi-rs/canvas";

/** Porcentaje de píxeles con tinta (luminancia < 200). */
export async function measureImageInkRatio(
  buffer: Buffer,
  mimeType: string
): Promise<number | null> {
  try {
    const img = await loadImage(buffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let dark = 0;
    const total = img.width * img.height;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 200) dark++;
    }
    void mimeType;
    return total > 0 ? (dark / total) * 100 : 0;
  } catch {
    return null;
  }
}

export interface PageRenderQualityInput {
  pageNum: number;
  buffer: Buffer;
  mimeType: string;
  /** Caracteres de texto extraíbles del PDF (capa de texto). */
  pdfTextChars: number;
}

export interface PageRenderQualityResult {
  pageNum: number;
  ok: boolean;
  inkRatioPct: number | null;
  motivo?: string;
}

function minInkRatioForText(pdfTextChars: number): number {
  if (pdfTextChars >= 800) return 3;
  if (pdfTextChars >= 200) return 2.5;
  if (pdfTextChars >= 80) return 2;
  return 0.8;
}

/** Valida que una página renderizada tenga contenido acorde al texto del PDF. */
export async function assessPageRenderQuality(
  input: PageRenderQualityInput
): Promise<PageRenderQualityResult> {
  const inkRatioPct = await measureImageInkRatio(input.buffer, input.mimeType);
  if (inkRatioPct == null) {
    return {
      pageNum: input.pageNum,
      ok: false,
      inkRatioPct: null,
      motivo: "No se pudo analizar la imagen derivada",
    };
  }

  if (input.buffer.length < 8_000 && input.pdfTextChars >= 200) {
    return {
      pageNum: input.pageNum,
      ok: false,
      inkRatioPct,
      motivo: "Derivado demasiado pequeño para el contenido esperado",
    };
  }

  const minInk = minInkRatioForText(input.pdfTextChars);
  if (inkRatioPct < minInk) {
    return {
      pageNum: input.pageNum,
      ok: false,
      inkRatioPct,
      motivo:
        input.pdfTextChars >= 80
          ? `Render sin texto legible (tinta ${inkRatioPct.toFixed(2)}%, mínimo ${minInk}%)`
          : `Página casi en blanco (tinta ${inkRatioPct.toFixed(2)}%)`,
    };
  }

  return { pageNum: input.pageNum, ok: true, inkRatioPct };
}
