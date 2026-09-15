import mongoose from "mongoose";
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa";
const { CasoModel, LineaContableModel } = await import("../packages/db/dist/index.js");
await mongoose.connect(process.env.MONGODB_URI);
const c = await CasoModel.findOne({ numero: "FFA-2026-00014" });
const ls = await LineaContableModel.find({ casoId: c._id, paginaNumero: 11 }).sort({
  rubroCodigo: 1,
  denominacionOriginal: 1,
});
const pares = ["1.2.05", "1.2.04", "2.2.04", "2.1.07", "2.1.08", "2.1.09"];
for (const rub of pares) {
  const g = ls.filter((l) => l.rubroCodigo === rub);
  if (g.length === 0) continue;
  console.log(`\n=== ${rub} (${g.length}) ===`);
  for (const l of g) {
    console.log(`  ${l.montoNormalizado ?? l.montoOriginal} | ${l.origenClasificacion} | ${l.denominacionOriginal}`);
  }
}
console.log("\nTotal líneas:", await LineaContableModel.countDocuments({ casoId: c._id }));
await mongoose.disconnect();
