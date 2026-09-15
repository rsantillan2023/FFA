import mongoose from "mongoose";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const q = process.argv[2] || "Loma Negra";

try {
  const raw = readFileSync(resolve(__dirname, "../.env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa");
const { CasoModel, DocumentoFuenteModel, LineaContableModel, ValidacionResultadoModel } =
  await import("../packages/db/dist/index.js");

const caso = await CasoModel.findOne({
  $or: [{ referencia: new RegExp(q, "i") }, { numero: new RegExp(q, "i") }],
}).sort({ createdAt: -1 });

if (!caso) {
  console.log("No encontrado:", q);
  process.exit(1);
}

const [docs, lineas, vals] = await Promise.all([
  DocumentoFuenteModel.find({ casoId: caso._id }),
  LineaContableModel.countDocuments({ casoId: caso._id }),
  ValidacionResultadoModel.find({ casoId: caso._id }),
]);

console.log("=== CASO ===");
console.log("Numero:", caso.numero);
console.log("Referencia:", caso.referencia);
console.log("Estado:", caso.estado);
console.log("Semáforo:", caso.semaforo);
console.log("Confianza:", caso.confianzaGlobal);
console.log("Moneda/escala:", caso.moneda, caso.escala);
console.log("Lineas:", lineas);
console.log("\n=== DOCUMENTOS ===");
for (const d of docs) {
  console.log(
    "-",
    d.nombreOriginal,
    "| etapa:",
    d.procesamiento?.etapaActual,
    d.procesamiento?.progresoPct + "%",
    d.procesamiento?.ultimoError ? "| ERROR: " + d.procesamiento.ultimoError : ""
  );
}
console.log("\n=== HISTORIAL (últimos 8) ===");
for (const h of (caso.estadoHistorial ?? []).slice(-8)) {
  console.log(h.at?.toISOString?.() ?? h.at, h.estado, h.nota?.slice(0, 80));
}
console.log("\n=== VALIDACIONES fallidas ===");
for (const v of vals.filter((x) => !x.passed && x.severidad !== "info")) {
  console.log(`[${v.severidad}]`, v.mensaje.slice(0, 100));
}
await mongoose.disconnect();
