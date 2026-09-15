/**
 * Compara totales del proceso (Mongo + pipeline) con testigos extraídos del PDF.
 * node scripts/comparar-testigo-pdf.mjs [FFA-2026-00011] [--reconciliar]
 */
import mongoose from "mongoose";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const reconciliar = args.includes("--reconciliar");
const numero = args.find((a) => !a.startsWith("-")) || "FFA-2026-00011";

function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
}

loadEnv();
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa";

const { analizarBalance, filtrarRubrosAsignables, planificarReconciliacion } = await import(
  "../packages/pipeline/dist/index.js"
);

const Caso = mongoose.model("Caso", new mongoose.Schema({}, { strict: false, collection: "casos" }));
const Linea = mongoose.model(
  "LineaContable",
  new mongoose.Schema({}, { strict: false, collection: "lineacontables" })
);
const Rubro = mongoose.model(
  "RubroInstitucional",
  new mongoose.Schema({}, { strict: false, collection: "rubroinstitucionals" })
);

function fmt(n) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n));
}

async function run() {
  await mongoose.connect(uri);
  const caso = await Caso.findOne({ numero });
  if (!caso) {
    console.error("Caso no encontrado:", numero);
    process.exit(1);
  }
  const casoId = caso._id.toString();
  const planId = caso.planCuentasVersionId;
  const [lineas, rubrosDocs] = await Promise.all([
    Linea.find({ casoId: caso._id }),
    Rubro.find({ planCuentasVersionId: planId, activo: true }),
  ]);

  const refs = rubrosDocs.map((r) => ({
    id: r._id.toString(),
    codigo: r.codigo,
    nombre: r.nombre,
    estadoFinanciero: r.estadoFinanciero,
    convencionSigno: r.convencionSigno,
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

  console.log("\n=== Comparación testigo PDF vs proceso ===");
  console.log("Caso:", numero, "| Líneas:", lineas.length);

  const antes = analizarBalance(inputs, rubros);
  printAnalisis("ANTES", antes);

  if (antes.testigoRecomendado) {
    const t = antes.testigoRecomendado;
    const diffTestigo = antes.totales.activo - t.totalActivo;
    const pct = (Math.abs(diffTestigo) / Math.max(t.totalActivo, 1)) * 100;
    console.log("\n--- Desvío vs testigo PDF recomendado (pág.", t.paginaNumero, ") ---");
    console.log("  Activo proceso:", fmt(antes.totales.activo));
    console.log("  Activo testigo: ", fmt(t.totalActivo));
    console.log("  Desvío:         ", fmt(diffTestigo), `(${pct.toFixed(2)}%)`);
  }

  if (reconciliar) {
    console.log("\n=== Plan de reconciliación (simulación) ===");
    const acciones = planificarReconciliacion(inputs, rubros, antes.paginasBalanceObjetivo);
    const byTipo = {};
    for (const a of acciones) byTipo[a.tipo] = (byTipo[a.tipo] ?? 0) + 1;
    console.log("Acciones planificadas:", acciones.length, byTipo);
    console.log("\nPara aplicar en BD, usar API POST /casos/:id/balance/reconciliar o la UI «Reconciliar balance».");
  }

  await mongoose.disconnect();
}

function printAnalisis(label, a) {
  console.log(`\n--- ${label} ---`);
  console.log("Testigos detectados:", a.testigos.length);
  for (const t of a.testigos.slice(0, 5)) {
    console.log(
      `  pág.${t.paginaNumero}: Activo=${fmt(t.totalActivo)} | P+P=${fmt(t.totalPasivoPatrimonio)}`
    );
  }
  if (a.testigoRecomendado) {
    console.log("Testigo recomendado: pág.", a.testigoRecomendado.paginaNumero);
  }
  console.log("Páginas objetivo:", a.paginasBalanceObjetivo.join(", ") || "(ninguna)");
  console.log("Totales proceso:");
  console.log("  Activo:    ", fmt(a.totales.activo));
  console.log("  Pasivo:    ", fmt(a.totales.pasivo));
  console.log("  Patrimonio:", fmt(a.totales.patrimonio));
  console.log("  2+3:       ", fmt(a.totales.pasivo + a.totales.patrimonio));
  console.log("  Diferencia:", fmt(a.totales.diferencia), a.totales.cuadraturaOk ? "✓ CUADRA" : "✗ NO CUADRA");
  console.log("Detalle cuadratura:", a.conteos.detalle, "| Excluidas:", JSON.stringify(a.conteos));
  console.log("Pares escala ×1000:", a.paresEscala);
  console.log("Patrimonio mal en pasivo:", fmt(a.patrimonioMalEnPasivo));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
