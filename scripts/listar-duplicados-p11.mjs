import mongoose from "mongoose";
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa";
const { CasoModel, LineaContableModel } = await import("../packages/db/dist/index.js");
await mongoose.connect(process.env.MONGODB_URI);
const c = await CasoModel.findOne({ numero: "FFA-2026-00014" });
const ls = await LineaContableModel.find({ casoId: c._id, paginaNumero: 11 });
const byRubroPag = new Map();
for (const l of ls) {
  const m = l.montoNormalizado ?? l.montoOriginal;
  const k = `${l.rubroCodigo}\0${l.paginaNumero}\0${m}`;
  const g = byRubroPag.get(k) ?? [];
  g.push(l);
  byRubroPag.set(k, g);
}
console.log("=== Duplicados rubro+página+monto ===");
for (const [k, g] of byRubroPag) {
  if (g.length < 2) continue;
  console.log("\nGrupo:", k.replace("\0", " | "));
  for (const l of g) {
    console.log(" ", l.confianzaClasificacion + "%", l.origenClasificacion, l.denominacionOriginal);
  }
}
console.log("\n=== Préstamos (mismo rubro, montos distintos) ===");
for (const l of ls.filter((x) => x.rubroCodigo === "2.1.08"))
  console.log(l.montoNormalizado ?? l.montoOriginal, l.confianzaClasificacion, l.origenClasificacion, l.denominacionOriginal);
await mongoose.disconnect();
