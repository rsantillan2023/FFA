/**
 * Reinicia un caso a foja cero y espera el pipeline inline (preprocess→extract→…→validate).
 * Uso: node scripts/reprocesar-caso-testigo.mjs [FFA-2026-00018]
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
console.log("LOCAL_STORAGE_PATH:", process.env.LOCAL_STORAGE_PATH);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { bootstrapInfra } = await import("../apps/api/dist/lib/bootstrap.js");
const { connectDatabase, CasoModel, UserModel, DocumentoFuenteModel } = await import(
  "../packages/db/dist/index.js"
);
const { reiniciarCasoFojaCero } = await import("../apps/api/dist/services/reiniciar-caso.js");
const { analizarBalanceCaso } = await import(
  "../packages/db/dist/services/balance-reconciliar.js"
);
const { calcularTotalesCuadraturaRevision } = await import("../packages/pipeline/dist/index.js");
const { RubroInstitucionalModel } = await import("../packages/db/dist/models/rubro-institucional.js");
const { LineaContableModel } = await import("../packages/db/dist/models/linea-contable.js");

const mongoUri = await bootstrapInfra();
await connectDatabase(mongoUri);

const caso = await CasoModel.findOne({ numero });
if (!caso) {
  console.error("Caso no encontrado:", numero);
  process.exit(1);
}

const admin = await UserModel.findOne({ activo: { $ne: false } }).sort({ createdAt: 1 });
if (!admin) {
  console.error("No hay usuario admin en la BD");
  process.exit(1);
}

console.log(`\n=== Reinicio foja cero: ${numero} (${caso._id}) ===`);
console.log("Estado actual:", caso.estado);

const t0 = Date.now();
await reiniciarCasoFojaCero(caso._id.toString(), admin._id.toString(), {
  motivo: "Reproceso testigo P1-P8 — Falabella",
  reutilizarPreproceso: false,
});
console.log("Encolado. Esperando pipeline inline…");

const FINAL = new Set(["en_revision", "pendiente_calidad", "aprobado"]);
const FAIL = new Set(["error", "rechazado"]);

for (let i = 0; i < 180; i++) {
  await sleep(5000);
  const c = await CasoModel.findById(caso._id);
  const doc = await DocumentoFuenteModel.findOne({ casoId: caso._id });
  const etapa = doc?.procesamiento?.etapaActual ?? "?";
  const pct = doc?.procesamiento?.progresoPct ?? 0;
  const lineas = await LineaContableModel.countDocuments({ casoId: caso._id });
  const elapsed = Math.round((Date.now() - t0) / 1000);
  process.stdout.write(
    `\r[${elapsed}s] estado=${c?.estado} etapa=${etapa} ${pct}% lineas=${lineas}   `
  );

  if (c && FINAL.has(c.estado)) {
    console.log("\n\nPipeline terminado:", c.estado);
    break;
  }
  if (c && FAIL.has(c.estado)) {
    console.log("\n\nPipeline falló:", c.estado, doc?.procesamiento?.ultimoError);
    process.exit(1);
  }
  if (i === 179) {
    console.log("\n\nTimeout esperando pipeline (15 min)");
    process.exit(1);
  }
}

const cFinal = await CasoModel.findById(caso._id);
const docFinal = await DocumentoFuenteModel.findOne({ casoId: caso._id });
const lineas = await LineaContableModel.find({ casoId: caso._id });
const prov = docFinal?.extractPayload?.provenanceExtraccion;

console.log("\n=== RESULTADO EXTRACCIÓN ===");
console.log("Líneas totales:", lineas.length);
console.log("Cuentas extract:", docFinal?.extractPayload?.informeExtraccion?.cuentasExtraidas);
console.log("Texto nativo primario:", prov?.textoNativoPrimario ?? false);
console.log("Líneas desde texto nativo:", prov?.lineasDesdeTextoNativo);
console.log("Añadidas/corregidas:", prov?.lineasAnadidasDesdeTexto, "/", prov?.lineasMontosCorregidos);
console.log("Omitidas estimadas:", prov?.lineasOmitidasEstimadas);
console.log("Confianza global caso:", cFinal?.confianzaGlobal, "semáforo:", cFinal?.semaforo);

const origen = {};
for (const l of lineas) {
  const o = l.origenClasificacion || "sin";
  origen[o] = (origen[o] || 0) + 1;
}
console.log("Origen clasificación:", origen);
console.log("Requiere revisión:", lineas.filter((l) => l.requiereRevision).length);

const rubros = await RubroInstitucionalModel.find({
  planCuentasVersionId: cFinal.planCuentasVersionId,
  activo: true,
});
const rubrosDto = rubros.map((r) => ({
  id: r._id.toString(),
  codigo: r.codigo,
  estadoFinanciero: r.estadoFinanciero,
  asignable: r.asignable !== false,
  convencionSigno: r.convencionSigno,
}));

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
  rubrosDto
);

console.log("\n=== CUADRATURA ===");
console.log("Activo:", (tot.activo / 1e12).toFixed(3), "T CLP");
console.log("Pasivo:", (tot.pasivo / 1e12).toFixed(3), "T");
console.log("Patrimonio:", (tot.patrimonio / 1e12).toFixed(3), "T");
console.log("Diferencia:", (tot.diferencia / 1e12).toFixed(3), "T");
console.log("Diferencia %:", tot.diferenciaPct.toFixed(2) + "%");
console.log("Cuadratura OK:", tot.cuadraturaOk);

try {
  const analisis = await analizarBalanceCaso(caso._id.toString());
  console.log("\n=== ANÁLISIS BALANCE ===");
  console.log("Activo incompleto:", analisis.activoIncompleto);
  console.log("Ratio activo vs testigo:", analisis.ratioActivoVsTestigo, "%");
  if (analisis.testigoRecomendado) {
    console.log(
      "Testigo PDF total activo:",
      (analisis.testigoRecomendado.totalActivo / 1e12).toFixed(3),
      "T"
    );
  }
  console.log("Detalle en cuadratura:", analisis.conteos?.detalle);
} catch (e) {
  console.warn("Análisis balance:", e.message);
}

await import("mongoose").then((m) => m.default.disconnect());
console.log("\nDone.");
