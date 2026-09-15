/**
 * Asigna rubro agrupador a subtotales/totales (92% OK) de un caso ya en revisión.
 * Uso: node scripts/asignar-rubros-subtotales-caso.mjs [FFA-2026-00018]
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
const apiStorage = resolve(__dirname, "../apps/api/data/storage");
process.env.LOCAL_STORAGE_PATH = existsSync(apiStorage) ? apiStorage : process.env.LOCAL_STORAGE_PATH;

const { bootstrapInfra } = await import("../apps/api/dist/lib/bootstrap.js");
const { connectDatabase, CasoModel, LineaContableModel, RubroInstitucionalModel } = await import(
  "../packages/db/dist/index.js"
);
const {
  esLineaFilaTotalBalance,
  resolverRubroAgrupadorSubtotal,
  inferEstadoFinancieroDesdePagina,
} = await import("../packages/pipeline/dist/index.js");
const { Types } = await import("mongoose");

const mongoUri = await bootstrapInfra();
await connectDatabase(mongoUri);

const caso = await CasoModel.findOne({ numero });
if (!caso) {
  console.error("Caso no encontrado:", numero);
  process.exit(1);
}

const rubrosDocs = await RubroInstitucionalModel.find({
  planCuentasVersionId: caso.planCuentasVersionId,
  activo: true,
});
const rubros = rubrosDocs.map((r) => ({
  id: r._id.toString(),
  codigo: r.codigo,
  nombre: r.nombre,
  estadoFinanciero: r.estadoFinanciero,
}));

const lineas = await LineaContableModel.find({ casoId: caso._id });
let actualizadas = 0;
let sinMatch = 0;

for (const linea of lineas) {
  if (
    !esLineaFilaTotalBalance({
      denominacionOriginal: linea.denominacionOriginal,
      montoOriginal: linea.montoOriginal,
      montoNormalizado: linea.montoNormalizado ?? undefined,
    })
  ) {
    continue;
  }

  const estado = inferEstadoFinancieroDesdePagina(linea.denominacionOriginal, "balance");
  const rubro = resolverRubroAgrupadorSubtotal(
    linea.denominacionOriginal,
    rubros,
    estado === "activo" || estado === "pasivo" || estado === "patrimonio" ? estado : undefined
  );

  if (!rubro) {
    sinMatch++;
    console.warn("Sin rubro agrupador:", linea.denominacionOriginal);
    continue;
  }

  await LineaContableModel.updateOne(
    { _id: linea._id },
    {
      $set: {
        rubroInstitucionalId: new Types.ObjectId(rubro.id),
        clasificacionPropuesta: new Types.ObjectId(rubro.id),
        rubroCodigo: rubro.codigo,
        excluirDeCuadratura: true,
        motivoExclusionCuadratura: "total",
        requiereRevision: false,
        confianzaClasificacion: 92,
        origenClasificacion: "regla",
      },
    }
  );
  actualizadas++;
  console.log(`✓ ${linea.denominacionOriginal.slice(0, 40)} → ${rubro.codigo} ${rubro.nombre}`);
}

console.log(`\n${numero}: ${actualizadas} subtotal(es) actualizado(s), ${sinMatch} sin match`);
await import("mongoose").then((m) => m.default.disconnect());
