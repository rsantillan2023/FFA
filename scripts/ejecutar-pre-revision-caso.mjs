/**
 * Ejecuta preparación pre-revisión (limpieza, cuadratura, IA) en Mongo.
 * node scripts/ejecutar-pre-revision-caso.mjs [FFA-2026-00011]
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

const { CasoModel, LineaContableModel } = await import("../packages/db/dist/index.js");
const { analizarBalanceCaso } = await import("../packages/db/dist/services/balance-reconciliar.js");
const { ejecutarPreRevisionCaso } = await import(
  "../packages/db/dist/services/pre-revision-orchestrator.js"
);
const { esLineaSinSentidoContable } = await import("../packages/pipeline/dist/index.js");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const caso = await CasoModel.findOne({ numero });
  if (!caso) {
    console.error("Caso no encontrado:", numero);
    process.exit(1);
  }
  const casoId = caso._id.toString();

  const lineasAntes = await LineaContableModel.find({ casoId });
  const ruidoAntes = lineasAntes.filter((l) =>
    esLineaSinSentidoContable({
      denominacionOriginal: l.denominacionOriginal,
      montoOriginal: l.montoOriginal,
      montoNormalizado: l.montoNormalizado ?? undefined,
    })
  );
  let analisisAntes;
  try {
    analisisAntes = await analizarBalanceCaso(casoId);
  } catch (e) {
    analisisAntes = null;
  }

  console.log("=== ANTES ===");
  console.log("Caso:", numero, "| estado:", caso.estado, "| semáforo:", caso.semaforo ?? "—");
  console.log("Líneas totales:", lineasAntes.length);
  console.log("Líneas sin sentido/ruido detectables:", ruidoAntes.length);
  if (ruidoAntes.length) {
    for (const l of ruidoAntes.slice(0, 8)) {
      console.log("  ·", l.denominacionOriginal.slice(0, 80));
    }
    if (ruidoAntes.length > 8) console.log("  … y", ruidoAntes.length - 8, "más");
  }
  if (analisisAntes) {
    const t = analisisAntes.totales;
    console.log(
      "Cuadratura:",
      t.cuadraturaOk ? "OK" : "NO",
      "| diff:",
      t.diferencia,
      "| activo:",
      t.activo
    );
  }

  console.log("\n=== EJECUTANDO PRE-REVISIÓN ===");
  const res = await ejecutarPreRevisionCaso(casoId, {
    iaAutomatica: true,
    crearAjusteBalance: false,
  });

  for (const p of res.pasos) {
    console.log(`  [${p.paso}] ${p.detalle}${p.duracionMs != null ? ` (${p.duracionMs}ms)` : ""}`);
  }

  const casoPost = await CasoModel.findById(casoId);
  const lineasPost = await LineaContableModel.find({ casoId });
  const analisisPost = await analizarBalanceCaso(casoId);

  console.log("\n=== DESPUÉS ===");
  console.log("Semáforo:", res.semaforo, "| confianza:", Math.round(res.confianzaGlobal), "%");
  console.log("Estado caso:", casoPost?.estado);
  console.log("Líneas totales:", lineasPost.length, "(−", lineasAntes.length - lineasPost.length, ")");
  console.log("Ruido eliminado:", res.ruidoEliminado);
  console.log("Duplicados eliminados:", res.duplicadosEliminados);
  console.log("Acciones reconciliación:", res.reconciliacionAcciones);
  console.log("IA:", res.ia);
  const t = analisisPost.totales;
  console.log(
    "Cuadratura:",
    t.cuadraturaOk ? "OK ✓" : "NO",
    "| diff:",
    t.diferencia,
    "| activo:",
    t.activo,
    "| P+PN:",
    t.pasivo + t.patrimonio
  );
  if (analisisPost.testigoRecomendado) {
    const tr = analisisPost.testigoRecomendado;
    console.log("Testigo pág.", tr.paginaNumero, "activo:", tr.totalActivo);
    console.log("Desvío vs testigo:", t.activo - tr.totalActivo);
  }

  const pendientes = lineasPost.filter((l) => l.requiereRevision).length;
  console.log("Líneas pendientes revisión:", pendientes);

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
