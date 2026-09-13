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

const ANTES = {
  resultadoBruto: "fallaba (225233+172284)",
  indicadoresFinancieros: 0,
  indicadoresOperativos: 0,
  coberturaLineas: "100 (circular)",
  pagina12Lineas: "~6",
};

const { scanPdfPagesText } = await import("../dist/extract/pdf-text-scan.js");
const { detectarFilasTablaEnTexto } = await import("../dist/extract/extraer-lineas-tabla-texto.js");
const { normalizarSignoLinea } = await import("../dist/extract/normalizar-signos-contables.js");
const { ejecutarControlesAritmeticos } = await import("../dist/extract/extract-arithmetic-checks.js");
const { extractDocument } = await import("../dist/extract/extract-provider.js");

const buf = fs.readFileSync(pdfPath);
const scans = await scanPdfPagesText(buf);

console.log("=== PÁGINA 12 — DETECCIÓN INDEPENDIENTE ===");
const p12 = scans.find((s) => s.pageNum === 12);
const filas12 = detectarFilasTablaEnTexto(p12.text, 12, "resultados");
console.log("Filas detectadas:", filas12.length);
for (const f of filas12) console.log(" ", f.denominacion.slice(0, 60));

console.log("\n=== SIGNOS (simulación costo positivo sin paréntesis) ===");
const costoPos = normalizarSignoLinea(
  {
    denominacionOriginal: "Costo de ventas",
    montoOriginal: 172284,
    paginaNumero: 12,
    seccionPagina: "resultados",
  },
  { moneda: "ARS", escala: "millones" }
);
console.log("Costo normalizado:", costoPos.montoNormalizado, "naturaleza:", costoPos.naturaleza);
const ctrlSim = ejecutarControlesAritmeticos([
  { denominacionOriginal: "Ingresos por ventas netas", montoOriginal: 225233, montoNormalizado: 225233, paginaNumero: 12, seccionPagina: "resultados", id: "v" },
  { ...costoPos, id: "c" },
  { denominacionOriginal: "Ganancia bruta", montoOriginal: 52949, montoNormalizado: 52949, paginaNumero: 12, seccionPagina: "resultados", id: "b" },
]);
console.log("Resultado bruto:", ctrlSim.find((c) => c.id === "resultado_bruto"));

if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.log("\nSin API key — fin test parcial.");
  process.exit(0);
}

console.log("\n=== EXTRACCIÓN COMPLETA ===");
const t0 = Date.now();
const result = await extractDocument({
  provider: process.env.OPENAI_API_KEY ? "openai" : "anthropic",
  documentoNombre: "loma-negra-4q25-esp.pdf",
  mimeType: "application/pdf",
  buffer: buf,
});
console.log("Tiempo:", ((Date.now() - t0) / 1000).toFixed(0), "s");

const inf = result.informeExtraccion;
const bruto = inf?.controlesAritmeticos?.find((c) => c.id === "resultado_bruto");
const rev = result.lineas.filter((l) =>
  /ventas|costo|ganancia bruta/i.test(l.denominacionOriginal) && l.requiereRevision
);

console.log("\n| Métrica | ANTES | DESPUÉS |");
console.log("| resultado_bruto | fallaba |", bruto?.passed ? "OK ✓" : "FALLÓ ✗", "|");
console.log("| indicadoresFinancieros | 0 |", result.indicadoresFinancieros?.length ?? 0, "|");
console.log("| indicadoresOperativos | 0 |", result.indicadoresOperativos?.length ?? 0, "|");
console.log("| coberturaLineas | 100 circular |", inf?.coberturaDesglose?.coberturaLineas, "|");
console.log("| cuentas | ~63 |", result.lineas.length, "|");

console.log("\n--- Cobertura por tabla ---");
for (const t of inf?.coberturaTablas ?? []) {
  console.log(`p${t.pagina} ${t.tipo}: ${t.filasExtraidas}/${t.filasDetectadas} (${t.cobertura}%) omitidas: ${t.filasOmitidas}`);
  if (t.filasOmitidasLista?.length) console.log("  omitidas:", t.filasOmitidasLista.slice(0, 8).join("; "));
}

const p12cov = inf?.coberturaTablas?.find((t) => t.pagina === 12);
console.log("\n--- Página 12 Resultados ---");
console.log("Filas detectadas:", p12cov?.filasDetectadas);
console.log("Filas extraídas:", p12cov?.filasExtraidas);
console.log("Filas omitidas:", p12cov?.filasOmitidas);
console.log("Líneas p12:", result.lineas.filter((l) => l.paginaNumero === 12 && l.seccionPagina === "resultados").map((l) => l.denominacionOriginal));

console.log("\n--- Indicadores financieros ---");
for (const i of result.indicadoresFinancieros ?? []) {
  console.log(` ${i.nombre ?? i.denominacion} = ${i.valor} (${i.unidad}) origen=${i.origen}`);
}

console.log("\n--- Indicadores operativos ---");
for (const i of result.indicadoresOperativos ?? []) {
  console.log(` ${i.nombre ?? i.denominacion} = ${i.valor}`);
}

console.log("\nVentas/Costo/Bruto en revisión:", rev.length);
