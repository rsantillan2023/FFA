/**
 * Tests golden de selección de páginas — CMP (3 pág.) y Loma Negra (14 pág.).
 * No requiere API key (solo heurística / plan corto).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const { scanPdfPagesText, getPdfNumPages } = await import("../dist/extract/pdf-text-scan.js");
const { planPdfPagesForExtraction, buildProvenanceExtraccion } = await import(
  "../dist/extract/pdf-extract-pages.js"
);

function findPdf(namePattern) {
  const storage = path.join(root, "apps/api/data/storage/casos");
  if (!fs.existsSync(storage)) return null;
  for (const casoDir of fs.readdirSync(storage)) {
    const casoPath = path.join(storage, casoDir);
    for (const docDir of fs.readdirSync(casoPath)) {
      const docPath = path.join(casoPath, docDir);
      for (const f of fs.readdirSync(docPath)) {
        if (f.toLowerCase().includes(namePattern.toLowerCase()) && f.endsWith(".pdf")) {
          return path.join(docPath, f);
        }
      }
    }
  }
  return null;
}

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

async function testCmpShortPdf() {
  console.log("\n=== Golden CMP (PDF corto, ≤6 pág.) ===");
  const pdfPath = findPdf("CMP") ?? findPdf("FINYX_CMP");
  if (!pdfPath) {
    console.log("SKIP — PDF CMP no encontrado en storage");
    return;
  }

  const buffer = fs.readFileSync(pdfPath);
  const total = await getPdfNumPages(buffer);
  assert(total <= 6, `CMP tiene ${total} páginas (esperado ≤6)`);

  const scans = await scanPdfPagesText(buffer);
  assert(scans.length === total, `scan devuelve ${scans.length} páginas`);

  const p2 = scans.find((s) => s.pageNum === 2);
  assert(p2?.seccion === "balance", `p2 debe ser balance (got ${p2?.seccion})`);
  assert((p2?.score ?? 0) >= 40, `p2 score balance ≥40 (got ${p2?.score})`);

  const plan = await planPdfPagesForExtraction(buffer);
  assert(plan.pages.length === total, `plan corto incluye todas: ${plan.pages.length}/${total}`);
  assert(!plan.usedSmartSelection, "PDF corto no usa smart selection");
  const prov = buildProvenanceExtraccion(plan, "anthropic");
  assert(prov.seleccionPaginas === "pdf_corto_completo", `provenance=${prov.seleccionPaginas}`);
}

async function testLomaNegraHeuristic() {
  console.log("\n=== Golden Loma Negra (14 pág., heurística) ===");
  const pdfPath = path.join(
    root,
    "apps/api/data/storage/casos/6aa5bc8cd22abcd9ce4cb7d9/6aa5bc8cd22abcd9ce4cb7dc/loma-negra-4q25-esp.pdf"
  );
  if (!fs.existsSync(pdfPath)) {
    console.log("SKIP — PDF Loma Negra no encontrado");
    return;
  }

  const buffer = fs.readFileSync(pdfPath);
  const scans = await scanPdfPagesText(buffer);
  const balancePages = scans.filter((s) => s.seccion === "balance" && s.score >= 40);
  assert(balancePages.some((s) => s.pageNum === 11), "p11 balance detectada");

  process.env.PDF_CLAUDE_PAGE_MAP = "0";
  const plan = await planPdfPagesForExtraction(buffer);
  const nums = plan.pages.map((p) => p.pageNum);
  assert(nums.includes(11), "p11 balance incluida en plan heurístico");
  assert(nums.includes(12), "p12 resultados incluida");
  const prov = buildProvenanceExtraccion(plan, "anthropic");
  assert(
    prov.seleccionPaginas === "heuristica" || prov.seleccionPaginas === "claude_map",
    `provenance=${prov.seleccionPaginas}`
  );
  console.log("Plan páginas:", nums.join(", "));
}

await testCmpShortPdf();
await testLomaNegraHeuristic();

if (failed > 0) {
  console.error(`\n${failed} assertion(es) fallida(s)`);
  process.exit(1);
}
console.log("\nOK — test-golden-pages");
