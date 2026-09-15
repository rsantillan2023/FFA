/**
 * Aplica reconciliación de balance directamente en Mongo (sin API).
 * node scripts/reconciliar-balance-caso.mjs [FFA-2026-00011]
 */
import mongoose from "mongoose";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const numero = process.argv[2] || "FFA-2026-00011";

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
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ffa";

const { CasoModel } = await import("../packages/db/dist/index.js");
const { reconciliarBalanceCaso } = await import("../packages/db/dist/services/balance-reconciliar.js");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const caso = await CasoModel.findOne({ numero });
  if (!caso) {
    console.error("Caso no encontrado:", numero);
    process.exit(1);
  }
  console.log("Reconciliando caso", numero, "...");
  const res = await reconciliarBalanceCaso(caso._id.toString(), { crearAjuste: true });
  console.log("\n", res.mensaje);
  console.log("Acciones:", res.accionesAplicadas);
  console.log("Eliminadas escala:", res.lineasEliminadas);
  console.log("Excluidas cuadratura:", res.lineasExcluidas);
  console.log("Incluidas en cuadratura:", res.lineasIncluidas);
  console.log("Reclasificadas:", res.lineasReclasificadas);
  console.log("Ajuste 3.9 creado:", res.ajusteCreado);
  const t = res.analisis.totales;
  console.log("\nTotales post-reconciliación:");
  console.log("  Activo:", t.activo);
  console.log("  Pasivo + Patrimonio:", t.pasivo + t.patrimonio);
  console.log("  Diferencia:", t.diferencia, t.cuadraturaOk ? "CUADRA" : "NO CUADRA");
  if (res.analisis.testigoRecomendado) {
    const tr = res.analisis.testigoRecomendado;
    console.log("\nTestigo PDF pág.", tr.paginaNumero, "activo:", tr.totalActivo);
    console.log("Desvío vs testigo:", t.activo - tr.totalActivo);
  }
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
