import mongoose from "mongoose";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  readFileSync(resolve(__dirname, "../.env"), "utf8")
    .split("\n")
    .forEach((l) => {
      const m = l.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    });
} catch {}

const { analizarBalance, filtrarRubrosAsignables } = await import("../packages/pipeline/dist/index.js");

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa");
const Caso = mongoose.model("Caso", new mongoose.Schema({}, { strict: false }), "casos");
const Linea = mongoose.model("LineaContable", new mongoose.Schema({}, { strict: false }), "lineacontables");
const Rubro = mongoose.model("RubroInstitucional", new mongoose.Schema({}, { strict: false }), "rubroinstitucionals");

const caso = await Caso.findOne({ numero: "FFA-2026-00011" });
await Linea.deleteMany({
  casoId: caso._id,
  denominacionOriginal: /Ajuste imputaci|Ajuste de cuadratura/i,
});

const lineas = await Linea.find({ casoId: caso._id });
const rubrosDocs = await Rubro.find({ planCuentasVersionId: caso.planCuentasVersionId, activo: true });
const refs = rubrosDocs.map((r) => ({
  id: r._id.toString(),
  codigo: r.codigo,
  nombre: r.nombre,
  estadoFinanciero: r.estadoFinanciero,
  padreId: r.padreId?.toString(),
}));
const ids = new Set(filtrarRubrosAsignables(refs).map((r) => r.id));
const rubros = refs.map((r) => ({
  id: r.id,
  codigo: r.codigo,
  estadoFinanciero: r.estadoFinanciero,
  asignable: ids.has(r.id),
}));

const inputs = lineas.map((l) => ({
  id: l._id.toString(),
  denominacionOriginal: l.denominacionOriginal,
  montoOriginal: l.montoOriginal,
  montoNormalizado: l.montoNormalizado,
  paginaNumero: l.paginaNumero,
  rubroCodigo: l.rubroCodigo,
  excluirDeCuadratura: l.excluirDeCuadratura ?? false,
}));

const a = analizarBalance(inputs, rubros, [75, 76, 77]);
console.log("Sin ajustes genéricos:");
console.log("Activo:", a.totales.activo);
console.log("Pasivo:", a.totales.pasivo);
console.log("Patrimonio:", a.totales.patrimonio);
console.log("Diff:", a.totales.diferencia);
console.log("Testigo:", a.testigoRecomendado?.totalActivo);
console.log("Detalle:", a.conteos.detalle);

const det = lineas.filter((l) => !l.excluirDeCuadratura && l.paginaNumero >= 75 && l.paginaNumero <= 77);
console.log("\nLíneas detalle p75-77:", det.length);
for (const l of det.sort((a, b) => (a.rubroCodigo || "").localeCompare(b.rubroCodigo || ""))) {
  console.log(l.rubroCodigo, l.montoNormalizado ?? l.montoOriginal, l.denominacionOriginal.slice(0, 55));
}
await mongoose.disconnect();
