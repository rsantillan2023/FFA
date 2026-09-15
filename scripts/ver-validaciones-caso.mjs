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
} catch {}

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa");
const { CasoModel, ValidacionResultadoModel, LineaContableModel } = await import(
  "../packages/db/dist/index.js"
);
const caso = await CasoModel.findOne({ numero });
const vals = await ValidacionResultadoModel.find({ casoId: caso._id });
console.log("Semáforo:", caso.semaforo, "| Confianza:", caso.confianzaGlobal);
console.log("\nValidaciones NO pasadas:");
for (const v of vals.filter((x) => !x.passed)) {
  console.log(`  [${v.severidad}] ${v.tipo}: ${v.mensaje}`);
}
const pend = await LineaContableModel.countDocuments({
  casoId: caso._id,
  requiereRevision: true,
});
console.log("\nLíneas pendientes revisión:", pend);
await mongoose.disconnect();
