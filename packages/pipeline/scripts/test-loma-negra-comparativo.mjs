import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
dotenv.config({ path: path.join(root, ".env") });

const pdfPath = path.join(
  root,
  "apps/api/data/storage/casos/6aa5bc8cd22abcd9ce4cb7d9/6aa5bc8cd22abcd9ce4cb7dc/loma-negra-4q25-esp.pdf"
);

/** Baseline pre-correcciones incrementales (iteración anterior). */
const ANTES = {
  cuentasExtraidas: 79,
  duplicadosResueltos: 2,
  duplicadosConfirmados: 0,
  inconsistenciasReales: "varias (31.416 vs 31416, 2025 vs 2024)",
  inconsistenciasDescartadasPorPeriodo: 0,
  indicadoresFinancieros: 0,
  indicadoresOperativos: 0,
  controlesAprobados: 0,
  controlesFallidos: "≥1 (resultado bruto)",
  patrimonioMarcadoRevision: ">0",
  coberturaEstimadaPct: 90,
  confianzaGlobal: "~0.85",
};

const { parseMontoLocale } = await import("../dist/extract/parse-monto-locale.js");
const { detectarInconsistencias } = await import("../dist/extract/cross-validate-extract.js");
const { ejecutarControlesAritmeticos } = await import("../dist/extract/extract-arithmetic-checks.js");
const { extraerIndicadoresDesdeTranscripcion } = await import("../dist/extract/extraer-indicadores-texto.js");
const { scanPdfPagesText } = await import("../dist/extract/pdf-text-scan.js");
const { extractDocument } = await import("../dist/extract/extract-provider.js");

console.log("=== NORMALIZACIÓN NUMÉRICA (muestra) ===");
for (const raw of ["31.416", "31416", "58.012", "58012", "-128.976", "-128976", "19,7", "1.234,56"]) {
  const p = parseMontoLocale(raw, { moneda: "ARS", escala: "millones", escalaFactor: 1_000_000 });
  console.log(`  ${raw.padEnd(12)} → ${p.montoNormalizado}`);
}

console.log("\n=== INCONSISTENCIAS PERÍODO (simulación) ===");
const sim = detectarInconsistencias([
  { denominacionOriginal: "Efectivo al cierre", montoOriginal: 31416, montoNormalizado: 31416, paginaNumero: 13, columnaOrigen: "2025", seccionPagina: "flujo_efectivo", fuentePrioridad: "canonico" },
  { denominacionOriginal: "Efectivo al cierre", montoOriginal: 11048, montoNormalizado: 11048, paginaNumero: 13, columnaOrigen: "2024", seccionPagina: "flujo_efectivo", fuentePrioridad: "canonico" },
]);
console.log("  Inconsistencias reales:", sim.inconsistencias.length, "(esperado: 0)");
console.log("  Descartadas por período:", sim.descartadasPorPeriodo);

console.log("\n=== CONTROL RESULTADO BRUTO (simulación signos) ===");
const ctrl = ejecutarControlesAritmeticos([
  { denominacionOriginal: "Ventas", montoOriginal: 225233, montoNormalizado: 225233, paginaNumero: 12, seccionPagina: "resultados", fuentePrioridad: "canonico", id: "Ventas" },
  { denominacionOriginal: "Costo de ventas", montoOriginal: -172284, montoNormalizado: -172284, paginaNumero: 12, seccionPagina: "resultados", fuentePrioridad: "canonico", id: "Costo de ventas" },
  { denominacionOriginal: "Ganancia bruta", montoOriginal: 52949, montoNormalizado: 52949, paginaNumero: 12, seccionPagina: "resultados", fuentePrioridad: "canonico", id: "Ganancia bruta" },
]);
const bruto = ctrl.find((c) => c.id === "resultado_bruto");
console.log("  Resultado bruto:", bruto?.passed ? "OK ✓" : "FALLÓ ✗", bruto ? `(obtenido=${bruto.obtenido}, esperado=${bruto.esperado})` : "");

console.log("\n=== INDICADORES DESDE TEXTO ESCANEADO (sin LLM) ===");
const buf = fs.readFileSync(pdfPath);
const scans = await scanPdfPagesText(buf);
const indicadoresHeur = extraerIndicadoresDesdeTranscripcion({
  tipoDocumento: "mixto",
  metadata: { moneda: "ARS", escala: "millones", escalaFactor: 1_000_000, periodo: { ejercicio: 2025 } },
  lineas: [],
  paginasClasificadas: scans.map((s) => ({
    pagina: s.pageNum,
    seccion: s.seccion,
    score: s.score,
    incluida: false,
    textoEscaneado: s.text,
  })),
});
console.log("  Financieros:", indicadoresHeur.financieros.length);
for (const i of indicadoresHeur.financieros) {
  console.log(`    ${i.denominacion} | ${i.valor} | ${i.periodo?.etiqueta ?? ""}`);
}
console.log("  Operativos:", indicadoresHeur.operativos.length);
for (const i of indicadoresHeur.operativos) {
  console.log(`    ${i.denominacion} | ${i.valor}`);
}

if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.log("\nSin API key — omitiendo extracción completa.");
  process.exit(0);
}

console.log("\n=== EXTRACCIÓN LOMA NEGRA ===\n");
const t0 = Date.now();
const result = await extractDocument({
  provider: process.env.OPENAI_API_KEY ? "openai" : "anthropic",
  documentoNombre: "loma-negra-4q25-esp.pdf",
  mimeType: "application/pdf",
  buffer: buf,
});
const sec = ((Date.now() - t0) / 1000).toFixed(0);
const inf = result.informeExtraccion;
const cob = inf?.coberturaDesglose;

const patrimonioMarcado = result.lineas.filter((l) => /patrimonio/i.test(l.denominacionOriginal) && l.requiereRevision);
const evidenciasDup = result.lineas.filter((l) => l.evidenciasDuplicado?.length).length;

const despues = {
  cuentasExtraidas: inf?.cuentasExtraidas,
  duplicadosResueltos: inf?.duplicadosResueltos,
  duplicadosConfirmados: inf?.duplicadosConfirmados,
  inconsistenciasReales: inf?.inconsistencias?.length,
  inconsistenciasDescartadasPorPeriodo: inf?.inconsistenciasDescartadasPorPeriodo,
  indicadoresFinancieros: inf?.indicadoresFinancierosExtraidos,
  indicadoresOperativos: inf?.indicadoresOperativosExtraidos,
  controlesAprobados: inf?.controlesAprobados,
  controlesFallidos: inf?.controlesFallidos,
  patrimonioMarcadoRevision: patrimonioMarcado.length,
  coberturaGlobal: cob?.coberturaGlobal,
  confianzaGlobal: inf?.confianzaGlobal?.toFixed(2),
};

console.log(`Tiempo: ${sec}s | Empresa: ${result.metadata.razonSocial} | Moneda: ${result.metadata.moneda}`);
console.log("\n| Métrica | ANTES | DESPUÉS |");
console.log("|---------|-------|---------|");
for (const key of Object.keys(ANTES)) {
  console.log(`| ${key} | ${ANTES[key]} | ${despues[key] ?? "—"} |`);
}

console.log("\n--- Controles aritméticos ---");
for (const c of inf?.controlesAritmeticos ?? []) {
  console.log(`  ${c.passed ? "✓" : "✗"} ${c.descripcion}`);
}

console.log("\n--- Cobertura desglosada ---");
console.log(cob);

if (result.indicadoresFinancieros?.length) {
  console.log("\n--- Indicadores financieros ---");
  for (const i of result.indicadoresFinancieros) {
    console.log(`  p${i.paginaNumero} | ${i.denominacion} | ${i.valor} (${i.unidad}) ${i.periodo?.etiqueta ?? ""}`);
  }
}
if (result.indicadoresOperativos?.length) {
  console.log("\n--- Indicadores operativos ---");
  for (const i of result.indicadoresOperativos) {
    console.log(`  p${i.paginaNumero} | ${i.denominacion} | ${i.valor}`);
  }
}

console.log(`\nLíneas con evidencia duplicada confirmada: ${evidenciasDup}`);
