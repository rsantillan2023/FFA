/**
 * Tests de lógica F4 — detección fallback y provenance (sin Mongo).
 */
import { buildProvenanceExtraccion } from "../dist/extract/pdf-extract-pages.js";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

// PDF corto: todas las páginas, sin omitidas
const shortPlan = {
  pages: [{ pageNum: 1 }, { pageNum: 2 }, { pageNum: 3 }],
  totalPages: 3,
  paginasClasificadas: [],
  usedSmartSelection: false,
};
const shortProv = buildProvenanceExtraccion(shortPlan, "anthropic");
assert(shortProv.seleccionPaginas === "pdf_corto_completo", "short pdf mode");
assert(shortProv.paginasOmitidasVision === 0, "short pdf sin omitidas");

// Heurística largo
const longPlan = {
  pages: Array.from({ length: 6 }, (_, i) => ({ pageNum: i + 1 })),
  totalPages: 14,
  paginasClasificadas: [],
  usedSmartSelection: true,
};
const longProv = buildProvenanceExtraccion(longPlan, "anthropic");
assert(longProv.seleccionPaginas === "heuristica", "long heuristic mode");
assert(longProv.paginasOmitidasVision === 8, "14-6=8 omitidas");

// Claude map flag
const claudePlan = { ...longPlan, usedClaudePageMap: true, usedSmartSelection: true };
const claudeProv = buildProvenanceExtraccion(claudePlan, "anthropic");
assert(claudeProv.seleccionPaginas === "claude_map", "claude map mode");
assert(claudeProv.usedClaudePageMap === true, "usedClaudePageMap flag");

if (failed > 0) process.exit(1);
console.log("\nOK — test-f4-provenance");
