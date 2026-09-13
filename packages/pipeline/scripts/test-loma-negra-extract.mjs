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

const { planPdfPagesForExtraction } = await import("../dist/extract/pdf-extract-pages.js");
const { extractDocument } = await import("../dist/extract/extract-provider.js");

const buffer = fs.readFileSync(pdfPath);
const plan = await planPdfPagesForExtraction(buffer);

console.log("=== PLAN DE PÁGINAS ===");
console.log("Total:", plan.totalPages, "| Procesar:", plan.pages.map((p) => p.pageNum).join(", "));
const canon = plan.paginasClasificadas.filter((p) =>
  ["balance", "resultados", "flujo_efectivo"].includes(p.seccion)
);
console.log(
  "Canónicas:",
  canon.map((p) => `p${p.pagina}=${p.seccion}${p.incluida ? "✓" : "✗"}`).join(", ")
);

if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.log("\nSin API key — solo plan de páginas (OK si 11,12,13 incluidas)");
  process.exit(0);
}

console.log("\n=== EXTRACCIÓN IA (puede tardar varios minutos) ===\n");
const t0 = Date.now();
const result = await extractDocument({
  provider: process.env.OPENAI_API_KEY ? "openai" : "anthropic",
  documentoNombre: "loma-negra-4q25-esp.pdf",
  mimeType: "application/pdf",
  buffer,
});

const sec = ((Date.now() - t0) / 1000).toFixed(0);
const inf = result.informeExtraccion;

console.log("Tiempo:", sec, "s");
console.log("Empresa:", result.metadata.razonSocial);
console.log("Identificador:", result.metadata.identificadorFiscal ?? result.metadata.rut ?? "—");
console.log("Moneda:", result.metadata.moneda, "| Escala:", result.metadata.descripcionEscala ?? result.metadata.escala);
console.log("\nInforme:");
console.log("  Páginas:", inf?.paginasProcesadas, "/", inf?.paginasTotales);
console.log("  Cobertura:", inf?.coberturaEstimadaPct, "%");
console.log("  Líneas contables:", inf?.cuentasExtraidas);
console.log("  Ind. financieros:", inf?.indicadoresFinancierosExtraidos);
console.log("  Ind. operativos:", inf?.indicadoresOperativosExtraidos);
console.log("  Controles aritméticos:", inf?.controlesAprobados, "OK /", inf?.controlesFallidos, "fallidos");
console.log("  Inconsistencias:", inf?.inconsistencias?.length ?? 0);

const bySection = {};
for (const l of result.lineas) {
  const s = l.seccionPagina ?? "otro";
  bySection[s] = (bySection[s] ?? 0) + 1;
}
console.log("\nLíneas por sección:", bySection);

const checks = [
  ["Propiedades, planta y equipo", /propiedades.*planta.*equipo/i],
  ["Total del activo", /total del activo/i],
  ["Inventarios", /inventarios/i],
  ["Caja y bancos", /caja y bancos/i],
  ["Ganancia bruta", /ganancia bruta/i],
  ["Ganancia neta", /ganancia neta/i],
  ["Actividades operativas (flujo)", /actividades operativas/i],
  ["Variación del efectivo", /variaci[oó]n del efectivo/i],
];

console.log("\n=== CRITERIOS DE ACEPTACIÓN ===");
for (const [label, pat] of checks) {
  const hit = result.lineas.find((l) => pat.test(l.denominacionOriginal));
  console.log(hit ? "✓" : "✗", label, hit ? `(p${hit.paginaNumero}, ${hit.montoOriginal})` : "");
}

const cemento = result.lineas.some((l) => /cemento/i.test(l.denominacionOriginal));
console.log(cemento ? "✗" : "✓", "Sin cemento/volumen en lineas contables");
