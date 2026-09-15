/**
 * Analiza líneas excluidas en páginas del balance objetivo.
 * node scripts/analizar-excluidas-balance.mjs [FFA-2026-00011]
 */
import mongoose from "mongoose";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const numero = process.argv[2] || "FFA-2026-00011";

try {
  const raw = readFileSync(resolve(__dirname, "../.env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  /* ignore */
}

const { analizarBalance, filtrarRubrosAsignables } = await import(
  "../packages/pipeline/dist/index.js"
);

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa");
const Caso = mongoose.model("Caso", new mongoose.Schema({}, { strict: false }), "casos");
const Linea = mongoose.model("LineaContable", new mongoose.Schema({}, { strict: false }), "lineacontables");
const Rubro = mongoose.model(
  "RubroInstitucional",
  new mongoose.Schema({}, { strict: false }),
  "rubroinstitucionals"
);

const caso = await Caso.findOne({ numero });
const paginas = [75, 76, 77];
const [lineas, rubrosDocs] = await Promise.all([
  Linea.find({ casoId: caso._id }),
  Rubro.find({ planCuentasVersionId: caso.planCuentasVersionId, activo: true }),
]);

const refs = rubrosDocs.map((r) => ({
  id: r._id.toString(),
  codigo: r.codigo,
  nombre: r.nombre,
  estadoFinanciero: r.estadoFinanciero,
  padreId: r.padreId?.toString(),
}));
const asignables = filtrarRubrosAsignables(refs);
const idsAsignables = new Set(asignables.map((r) => r.id));
const rubros = refs.map((r) => ({
  id: r.id,
  codigo: r.codigo,
  estadoFinanciero: r.estadoFinanciero,
  asignable: idsAsignables.has(r.id),
}));
const byCodigo = new Map(rubrosDocs.map((r) => [r.codigo, r]));

const inputs = lineas.map((l) => ({
  id: l._id.toString(),
  denominacionOriginal: l.denominacionOriginal,
  montoOriginal: l.montoOriginal,
  montoNormalizado: l.montoNormalizado,
  paginaNumero: l.paginaNumero,
  rubroInstitucionalId: l.rubroInstitucionalId?.toString(),
  rubroCodigo: l.rubroCodigo,
  excluirDeCuadratura: l.excluirDeCuadratura ?? false,
  motivoExclusionCuadratura: l.motivoExclusionCuadratura,
}));

const analisis = analizarBalance(inputs, rubros, paginas);
console.log("Páginas objetivo:", paginas.join(", "));
console.log("Testigo pág.", analisis.testigoRecomendado?.paginaNumero, "activo:", analisis.testigoRecomendado?.totalActivo);

const enPag = lineas.filter((l) => paginas.includes(l.paginaNumero));
const excl = enPag.filter((l) => l.excluirDeCuadratura);
const det = enPag.filter((l) => !l.excluirDeCuadratura);

console.log("\nEn páginas balance:", enPag.length, "| detalle:", det.length, "| excluidas:", excl.length);

const byMotivo = {};
for (const l of excl) {
  const m = l.motivoExclusionCuadratura || "?";
  byMotivo[m] = (byMotivo[m] || 0) + 1;
}
console.log("Excluidas por motivo:", byMotivo);

const byRubro = {};
for (const l of excl) {
  const c = l.rubroCodigo || "sin_rubro";
  byRubro[c] = (byRubro[c] || 0) + 1;
}
console.log("Excluidas por rubro:", byRubro);

console.log("\n--- Excluidas recuperables (rubro balance 1/2/3.x, no ER/flujo/total) ---");
const erPat = /^(ingresos|costo|gastos|resultado|impuesto)/i;
const flujoPat = /flujo|efectivo al (inicio|cierre)|resultado por acci[oó]n/i;
const totalPat = /\btotal(es)?\b|\bsubtotal|\bsuma /i;

for (const l of excl) {
  const d = l.denominacionOriginal.trim();
  const rubro = byCodigo.get(l.rubroCodigo);
  const ef = rubro?.estadoFinanciero;
  if (!ef || ef === "resultados") continue;
  if (erPat.test(d) || flujoPat.test(d) || totalPat.test(d)) continue;
  if (l.rubroCodigo === "1" || l.rubroCodigo === "2" || l.rubroCodigo === "3") continue;
  console.log(
    l.motivoExclusionCuadratura?.padEnd(12),
    "|",
    (l.rubroCodigo || "—").padEnd(8),
    "|",
    String(l.montoNormalizado ?? l.montoOriginal).padStart(18),
    "|",
    d.slice(0, 60)
  );
}

console.log("\n--- Ajustes genéricos actuales ---");
for (const l of lineas.filter((l) => /Ajuste imputaci|Ajuste de cuadratura/i.test(l.denominacionOriginal))) {
  console.log(l.rubroCodigo, l.montoNormalizado ?? l.montoOriginal, l.denominacionOriginal);
}

await mongoose.disconnect();
