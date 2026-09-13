/** Carga PDF con pdfjs-dist — compartido entre render y escaneo de texto. */
export async function loadPdfDocument(pdfBuffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    standardFontDataUrl: undefined,
  });
  return loadingTask.promise;
}
