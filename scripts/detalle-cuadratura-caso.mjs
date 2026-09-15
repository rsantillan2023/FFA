/**
 * Detalle cuadratura completo — node scripts/detalle-cuadratura-caso.mjs FFA-2026-00014
 */
import mongoose from "mongoose";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const numero = process.argv[2] || "FFA-2026-00014";

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
const lineas = await LineaContableModel.find({ casoId: caso._id });
const rubros = await RubroInstitucionalModel.find({ planCuentasVersionId: caso.planCuentasVersionId });
const rubroMap = new Map(rubros.map((r) => [r._id.toString(), r]));

let activo = 0;
let pasivo = 0;
let pat = 0;
const incluidas = [];

for (const l of lineas) {
  const r = l.rubroInstitucionalId ? rubroMap.get(l.rubroInstitucionalId.toString()) : null;
  const rub = r
    ? { id: r._id.toString(), codigo: r.codigo, estadoFinanciero: r.estadoFinanciero, asignable: r.asignable }
    : undefined;
  const motivo = motivoExclusionCuadratura(l, rub);
  const m = l.montoNormalizado ?? l.montoOriginal;
  const inc = motivo === null && !l.excluirDeCuadratura;
  if (inc && rub) {
    if (rub.estadoFinanciero === "activo") activo += m;
    if (rub.estadoFinanciero === "pasivo") pasivo += m;
    if (rub.estadoFinanciero === "patrimonio") pat += m;
    incluidas.push({ pag: l.paginaNumero, rubro: l.rubroCodigo, m, denom: l.denominacionOriginal });
  }
}

console.log(`=== INCLUIDAS (${incluidas.length}) ===`);
for (const x of incluidas.sort((a, b) => Math.abs(b.m) - Math.abs(a.m))) {
  const ruido = esLineaSinSentidoContable({
    denominacionOriginal: x.denom,
    montoOriginal: x.m,
  });
  console.log(
    `p${x.pag}`.padEnd(4),
    (x.rubro || "—").padEnd(7),
    String(x.m).padStart(16),
    ruido ? "RUIDO" : "     ",
    x.denom.slice(0, 55)
  );
}
console.log("\nTotales:", { activo, pasivo, patrimonio: pat, diff: activo - pasivo - pat });

await mongoose.disconnect();
