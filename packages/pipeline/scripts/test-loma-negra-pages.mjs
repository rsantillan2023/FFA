import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const pdfPath = path.join(
  root,
  "apps/api/data/storage/casos/6aa5bc8cd22abcd9ce4cb7d9/6aa5bc8cd22abcd9ce4cb7dc/loma-negra-4q25-esp.pdf"
);

const { scanPdfPagesText, getPdfNumPages, esPaginaCanonicaObligatoria } = await import(
  "../dist/extract/pdf-text-scan.js"
);
const { selectPagesForExtraction } = await import("../dist/extract/pdf-page-select.js");

const buffer = fs.readFileSync(pdfPath);
const total = await getPdfNumPages(buffer);
const scans = await scanPdfPagesText(buffer);

console.log("PDF Loma Negra — total páginas:", total);
console.log("\nClasificación por página:");
for (const s of scans) {
  const titulo = s.tituloCanonico ? " [TÍTULO]" : "";
  console.log(`  p${String(s.pageNum).padStart(2)} | ${s.seccion.padEnd(18)} | score ${String(s.score).padStart(2)}${titulo}`);
}

for (const maxPages of [6, 24]) {
  const { pageNums, clasificadas } = selectPagesForExtraction(scans, maxPages);
  console.log(`\n--- maxPages=${maxPages} ---`);
  console.log("Procesar:", pageNums.join(", "));
  const obligatorias = scans.filter(esPaginaCanonicaObligatoria);
  const omitidas = obligatorias.filter((s) => !pageNums.includes(s.pageNum));
  const falsosPositivos = scans.filter(
    (s) =>
      ["balance", "resultados", "flujo_efectivo"].includes(s.seccion) &&
      !esPaginaCanonicaObligatoria(s) &&
      s.pageNum <= 6
  );

  if (omitidas.length) {
    console.log("ERROR: estados canónicos omitidos:", omitidas.map((p) => p.pageNum).join(", "));
    process.exitCode = 1;
  } else {
    console.log("OK obligatorias incluidas:", obligatorias.map((p) => `p${p.pageNum}`).join(", "));
  }

  if (falsosPositivos.length) {
    console.log(
      "AVISO clasificación débil p1-6 (no obligatorias):",
      falsosPositivos.map((p) => `p${p.pageNum}=${p.seccion}`).join(", ")
    );
  }

  const resumenTemprano = scans.filter((s) => s.pageNum <= 6 && s.seccion === "resumen_ejecutivo");
  console.log("Resumen p1-6:", resumenTemprano.map((p) => `p${p.pageNum}`).join(", ") || "—");
}
