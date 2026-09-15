import mongoose from "mongoose";
const numero = process.argv[2] || "FFA-2026-00014";
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa";
const { CasoModel, LineaContableModel } = await import("../packages/db/dist/index.js");
const { esLineaSinSentidoContable } = await import("../packages/pipeline/dist/index.js");
await mongoose.connect(process.env.MONGODB_URI);
const c = await CasoModel.findOne({ numero });
const ls = await LineaContableModel.find({ casoId: c._id }).sort({ paginaNumero: 1 });
for (const l of ls) {
  const r = esLineaSinSentidoContable({
    denominacionOriginal: l.denominacionOriginal,
    montoOriginal: l.montoOriginal,
    montoNormalizado: l.montoNormalizado ?? undefined,
  });
  console.log(
    `p${String(l.paginaNumero).padStart(2)}`,
    (l.rubroCodigo || "—").padEnd(7),
    String(l.confianzaClasificacion ?? 0).padStart(3) + "%",
    r ? "RUIDO" : "     ",
    l.denominacionOriginal.slice(0, 55)
  );
}
console.log("Total:", ls.length);
await mongoose.disconnect();
