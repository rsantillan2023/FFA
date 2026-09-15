/**
 * Detalle cuadratura pág. balance — node scripts/detalle-p11-cuadratura.mjs FFA-2026-00014 [pag]
 */
import mongoose from "mongoose";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const numero = process.argv[2] || "FFA-2026-00014";
const pag = Number(process.argv[3] || 11);

try {
  for (const line of readFileSync(resolve(__dirname, "../.env"), "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  /* ignore */
}
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa";

const { CasoModel, LineaContableModel, RubroInstitucionalModel } = await import(
  "../packages/db/dist/index.js"
);
const { motivoExclusionCuadratura } = await import("../packages/pipeline/dist/balance/balance-filters.js");
const { esLineaSinSentidoContable } = await import("../packages/pipeline/dist/index.js");

await mongoose.connect(process.env.MONGODB_URI);
const caso = await CasoModel.findOne({ numero });
const lineas = await LineaContableModel.find({ casoId: caso._id, paginaNumero: pag });
const rubros = await RubroInstitucionalModel.find({ planCuentasVersionId: caso.planCuentasVersionId });
const rubroMap = new Map(rubros.map((r) => [r._id.toString(), r]));

let activo = 0;
let pasivo = 0;
let pat = 0;

console.log(`=== Pág. ${pag} — ${lineas.length} líneas ===\n`);

for (const l of lineas.sort((a, b) => (a.rubroCodigo || "").localeCompare(b.rubroCodigo || ""))) {
  const r = l.rubroInstitucionalId ? rubroMap.get(l.rubroInstitucionalId.toString()) : null;
  const rub = r
    ? { id: r._id.toString(), codigo: r.codigo, estadoFinanciero: r.estadoFinanciero, asignable: r.asignable }
    : undefined;
  const motivo = motivoExclusionCuadratura(l, rub);
  const ruido = esLineaSinSentidoContable({
    denominacionOriginal: l.denominacionOriginal,
    montoOriginal: l.montoOriginal,
    montoNormalizado: l.montoNormalizado ?? undefined,
  });
  const m = l.montoNormalizado ?? l.montoOriginal;
  const inc = motivo === null && !l.excluirDeCuadratura;
  if (inc && rub) {
    if (rub.estadoFinanciero === "activo") activo += m;
    if (rub.estadoFinanciero === "pasivo") pasivo += m;
    if (rub.estadoFinanciero === "patrimonio") pat += m;
  }
  console.log(
    (inc ? "INCL" : "EXCL").padEnd(5),
    (motivo || (l.excluirDeCuadratura ? "manual" : "—")).padEnd(14),
    (l.rubroCodigo || "—").padEnd(7),
    String(m).padStart(16),
    ruido ? "RUIDO" : "     ",
    l.denominacionOriginal.slice(0, 60)
  );
}

console.log("\n--- Sumas incluidas pág.", pag, "---");
console.log({ activo, pasivo, patrimonio: pat, diff: activo - pasivo - pat });

await mongoose.disconnect();
