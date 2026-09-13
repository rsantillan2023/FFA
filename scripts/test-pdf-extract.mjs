import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const pdfArg = process.argv[2];
if (!pdfArg) {
  console.error("Uso: node scripts/test-pdf-extract.mjs <ruta-al.pdf>");
  process.exit(1);
}

const pdfPath = path.isAbsolute(pdfArg) ? pdfArg : path.join(root, pdfArg);
if (!fs.existsSync(pdfPath)) {
  console.error("No existe:", pdfPath);
  process.exit(1);
}

const { extractDocument } = await import("../packages/pipeline/dist/extract/extract-provider.js");
const { renderPdfToPngPages } = await import("../packages/pipeline/dist/extract/pdf-render.js");

const buffer = fs.readFileSync(pdfPath);
const pages = await renderPdfToPngPages(buffer, 6);
console.log("Archivo:", path.basename(pdfPath));
console.log("Tamaño:", Math.round(buffer.length / 1024), "KB");
console.log("Páginas renderizadas:", pages.length);
console.log("OpenAI key:", process.env.OPENAI_API_KEY ? "sí" : "no");
console.log("Anthropic key:", process.env.ANTHROPIC_API_KEY ? "sí" : "no");
console.log("Modelo Anthropic:", process.env.ANTHROPIC_EXTRACT_MODEL ?? "(default claude-sonnet-4-6)");
console.log("\nExtrayendo (OpenAI → fallback Anthropic)...\n");

const t0 = Date.now();
try {
  const result = await extractDocument({
    provider: "openai",
    documentoNombre: path.basename(pdfPath),
    mimeType: "application/pdf",
    buffer,
    tipoHint: "balance_clasificado",
  });
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("RESULTADO: OK en", sec, "s");
  console.log("Tipo documento:", result.tipoDocumento);
  console.log("Líneas extraídas:", result.lineas.length);
  console.log("Metadatos:", JSON.stringify(result.metadata, null, 2));
  console.log("\nPrimeras 5 líneas:");
  for (const l of result.lineas.slice(0, 5)) {
    console.log(`  p${l.paginaNumero} | ${l.denominacionOriginal} | ${l.montoOriginal}`);
  }
  if (result.lineas.length > 5) {
    console.log(`  ... y ${result.lineas.length - 5} más`);
  }
} catch (e) {
  console.error("RESULTADO: FALLO —", e.message);
  process.exit(1);
}
