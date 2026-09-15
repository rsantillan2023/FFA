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
const { CasoModel, LineaContableModel } = await import("../packages/db/dist/index.js");
const { esLineaSinSentidoContable } = await import("../packages/pipeline/dist/index.js");

const caso = await CasoModel.findOne({ numero });
const lines = await LineaContableModel.find({
  casoId: caso._id,
  denominacionOriginal: /comparaci|millones|por acci|participaci/i,
});

console.log("Coincidencias por texto:", lines.length);
for (const l of lines) {
  const ruido = esLineaSinSentidoContable({
    denominacionOriginal: l.denominacionOriginal,
    montoOriginal: l.montoOriginal,
    montoNormalizado: l.montoNormalizado ?? undefined,
  });
  console.log(
    `[${ruido ? "RUIDO" : "OK"}] p${l.paginaNumero} m=${l.montoNormalizado ?? l.montoOriginal} excl=${l.excluirDeCuadratura}`,
    l.denominacionOriginal.slice(0, 90)
  );
}

await mongoose.disconnect();
