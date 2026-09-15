/**
 * Continúa pipeline desde normalize (tras extract OK).
 * Uso: node scripts/continuar-pipeline-caso.mjs FFA-2026-00018
 */
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const numero = process.argv[2] || "FFA-2026-00018";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, "../.env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
}

loadEnv();
process.env.QUEUE_BACKEND = process.env.QUEUE_BACKEND || "inline";

const apiStorage = resolve(__dirname, "../apps/api/data/storage");
function resolveStoragePath() {
  const raw = process.env.LOCAL_STORAGE_PATH;
  if (!raw) return apiStorage;
  const candidates = [
    resolve(process.cwd(), raw),
    resolve(__dirname, "..", raw),
    resolve(__dirname, "../apps/api", raw.replace(/^\.\//, "")),
    apiStorage,
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return apiStorage;
}
process.env.LOCAL_STORAGE_PATH = resolveStoragePath();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { bootstrapInfra } = await import("../apps/api/dist/lib/bootstrap.js");
const { connectDatabase, CasoModel, DocumentoFuenteModel, LineaContableModel, transicionarCaso } =
  await import("../packages/db/dist/index.js");
const { enqueueNormalize } = await import("../apps/worker/dist/lib/enqueue.js");
const { CasoEstado } = await import("../packages/shared/dist/index.js");
const { analizarBalanceCaso } = await import("../packages/db/dist/services/balance-reconciliar.js");
const { calcularTotalesCuadraturaRevision } = await import("../packages/pipeline/dist/index.js");
const { RubroInstitucionalModel } = await import("../packages/db/dist/models/rubro-institucional.js");

await connectDatabase(await bootstrapInfra());

const caso = await CasoModel.findOne({ numero });
const doc = await DocumentoFuenteModel.findOne({ casoId: caso._id });
if (!caso || !doc) {
  console.error("Caso o documento no encontrado");
  process.exit(1);
}

console.log("Continuando pipeline:", numero, "lineas:", await LineaContableModel.countDocuments({ casoId: caso._id }));

const casoId = caso._id.toString();
if (caso.estado === CasoEstado.ERROR) {
  await transicionarCaso(casoId, CasoEstado.EN_COLA, { nota: "Recovery pipeline post-extract" });
  await transicionarCaso(casoId, CasoEstado.PREPROCESANDO, { nota: "Recovery" });
  await transicionarCaso(casoId, CasoEstado.EXTRAYENDO, { nota: "Recovery extract OK" });
}
await transicionarCaso(casoId, CasoEstado.NORMALIZANDO, {
  nota: "Continuación manual pipeline post-extract",
});
await enqueueNormalize(casoId, doc._id.toString());

const t0 = Date.now();
for (let i = 0; i < 180; i++) {
  await sleep(5000);
  const c = await CasoModel.findById(caso._id);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  process.stdout.write(`\r[${elapsed}s] estado=${c?.estado} conf=${c?.confianzaGlobal ?? "?"}   `);
  if (c?.estado === "en_revision" || c?.estado === "aprobado") {
    console.log("\nOK:", c.estado);
    break;
  }
  if (c?.estado === "error" || c?.estado === "pendiente_calidad") {
    const d = await DocumentoFuenteModel.findById(doc._id);
    console.log("\nEstado:", c.estado, d?.procesamiento?.ultimoError);
    break;
  }
}

const cFinal = await CasoModel.findById(caso._id);
const lineas = await LineaContableModel.find({ casoId: caso._id });
const rubros = await RubroInstitucionalModel.find({
  planCuentasVersionId: cFinal.planCuentasVersionId,
  activo: true,
});

const tot = calcularTotalesCuadraturaRevision(
  lineas.map((l) => ({
    id: l._id.toString(),
    denominacionOriginal: l.denominacionOriginal,
    montoOriginal: l.montoOriginal,
    montoNormalizado: l.montoNormalizado,
    paginaNumero: l.paginaNumero,
    rubroInstitucionalId: l.rubroInstitucionalId?.toString(),
    rubroCodigo: l.rubroCodigo,
    excluirDeCuadratura: l.excluirDeCuadratura,
    motivoExclusionCuadratura: l.motivoExclusionCuadratura,
  })),
  rubros.map((r) => ({
    id: r._id.toString(),
    codigo: r.codigo,
    estadoFinanciero: r.estadoFinanciero,
    asignable: r.asignable !== false,
    convencionSigno: r.convencionSigno,
  }))
);

console.log("\n=== RESUMEN ===");
console.log("Líneas:", lineas.length, "| Requiere rev:", lineas.filter((l) => l.requiereRevision).length);
console.log("Cuadratura:", tot.diferenciaPct.toFixed(2) + "%", tot.cuadraturaOk ? "OK" : "NO");
console.log("Activo:", (tot.activo / 1e12).toFixed(3), "T | P+PN:", ((tot.pasivo + tot.patrimonio) / 1e12).toFixed(3), "T");

const analisis = await analizarBalanceCaso(caso._id.toString());
console.log("Activo incompleto:", analisis.activoIncompleto, "| Ratio testigo:", analisis.ratioActivoVsTestigo, "%");

await import("mongoose").then((m) => m.default.disconnect());
