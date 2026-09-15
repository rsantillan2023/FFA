import path from "node:path";
import { fileURLToPath } from "node:url";

let cachedStandardFontDataUrl: string | undefined | null = null;

function resolveStandardFontDataUrl(): string | undefined {
  if (cachedStandardFontDataUrl !== null) return cachedStandardFontDataUrl;
  try {
    const pdfjsRoot = path.dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));
    cachedStandardFontDataUrl = path.join(pdfjsRoot, "standard_fonts") + path.sep;
  } catch {
    cachedStandardFontDataUrl = undefined;
  }
  return cachedStandardFontDataUrl;
}

export interface PdfLoadOptions {
  useSystemFonts?: boolean;
  disableFontFace?: boolean;
}

/** Carga PDF con pdfjs-dist — compartido entre render y escaneo de texto. */
export async function loadPdfDocument(pdfBuffer: Buffer, options: PdfLoadOptions = {}) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const standardFontDataUrl = resolveStandardFontDataUrl();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: options.useSystemFonts ?? true,
    disableFontFace: options.disableFontFace ?? false,
    ...(standardFontDataUrl ? { standardFontDataUrl } : {}),
  });
  return loadingTask.promise;
}
