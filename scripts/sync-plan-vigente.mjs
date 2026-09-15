/**
 * Upsert rubros del CSV en el plan vigente (Mongo) y refresca reglas de clasificación.
 * Uso: node scripts/sync-plan-vigente.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Types } from "mongoose";
import {
  CONFIG_SISTEMA_ID,
  PlanCuentasEstado,
} from "@ffa/shared";
import {
  ConfiguracionSistemaModel,
  PlanCuentasHistorialModel,
  ReglasClasificacionVersionModel,
  RubroInstitucionalModel,
  connectDatabase,
} from "@ffa/db";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseCsv(csv) {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const dataLines = lines[0].toLowerCase().includes("codigo") ? lines.slice(1) : lines;
  return dataLines.map((line, i) => {
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    const [
      codigo,
      nombre,
      estadoFinanciero,
      corrienteStr,
      signoStr,
      padreCodigo,
      ordenStr,
      aliasesStr,
      notaMargen,
    ] = parts;
    return {
      codigo,
      nombre,
      estadoFinanciero,
      corriente:
        corrienteStr === "true" || corrienteStr === "1"
          ? true
          : corrienteStr === "false" || corrienteStr === "0"
            ? false
            : undefined,
      convencionSigno: signoStr === "invertido" ? "invertido" : "normal",
      padreCodigo: padreCodigo || undefined,
      orden: ordenStr ? Number(ordenStr) : i + 1,
      aliases: aliasesStr
        ? aliasesStr.split(";").map((a) => a.trim()).filter(Boolean)
        : undefined,
      notaMargen: notaMargen || undefined,
    };
  });
}

function rubroPayload(planOid, row, padreId) {
  return {
    planCuentasVersionId: planOid,
    codigo: row.codigo,
    nombre: row.nombre,
    estadoFinanciero: row.estadoFinanciero,
    corriente: row.corriente,
    convencionSigno: row.convencionSigno,
    padreId: padreId ? new Types.ObjectId(padreId) : undefined,
    orden: row.orden,
    activo: true,
    aliases: row.aliases,
    notaMargen: row.notaMargen,
  };
}

async function upsertRubros(planId, rows) {
  const planOid = new Types.ObjectId(planId);
  const idByCodigo = new Map();
  for (const row of rows) {
    const doc = await RubroInstitucionalModel.findOneAndUpdate(
      { planCuentasVersionId: planOid, codigo: row.codigo },
      { $set: rubroPayload(planOid, row) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    idByCodigo.set(row.codigo, doc._id.toString());
  }
  for (const row of rows) {
    const padreId = row.padreCodigo ? idByCodigo.get(row.padreCodigo) : undefined;
    await RubroInstitucionalModel.updateOne(
      { planCuentasVersionId: planOid, codigo: row.codigo },
      { $set: { padreId: padreId ? new Types.ObjectId(padreId) : null } }
    );
  }
  return idByCodigo;
}

const NUEVAS_REGLAS = [
  { id: "r-imp-corr-activo", prioridad: 13, patron: "activos por impuestos corrientes", codigo: "1.2.09" },
  { id: "r-otros-act-nc", prioridad: 14, patron: "otros activos no financieros no corrientes", codigo: "1.1.09" },
  { id: "r-otros-act-c", prioridad: 15, patron: "otros activos no financieros corrientes", codigo: "1.2.08" },
  { id: "r-prop-inversion", prioridad: 16, patron: "propiedad de inversion", codigo: "1.1.10" },
  { id: "r-deriv-activo-c", prioridad: 17, patron: "contratos de derivados", codigo: "1.2.10" },
  { id: "r-pas-fin-c", prioridad: 18, patron: "otros pasivos financieros corrientes", codigo: "2.2.10" },
  { id: "r-pas-fin-nc", prioridad: 19, patron: "otros pasivos financieros no corrientes", codigo: "2.1.11" },
  { id: "r-depositos", prioridad: 20, patron: "depositos y otras obligaciones", codigo: "2.2.12" },
  { id: "r-otras-reservas", prioridad: 21, patron: "otras reservas", codigo: "3.6" },
  { id: "r-primas", prioridad: 22, patron: "primas de emision", codigo: "3.7" },
  { id: "r-res-fx", prioridad: 23, patron: "diferencias de cambio", codigo: "3.8" },
  { id: "r-unidades-reaj", prioridad: 24, patron: "unidades de reajuste", codigo: "3.10" },
  { id: "r-ganancia", prioridad: 44, patron: "ganancia (perdida)", codigo: "4.12" },
  { id: "r-gastos-func", prioridad: 45, patron: "otros gastos por funcion", codigo: "4.7" },
  { id: "r-asoc-gan", prioridad: 46, patron: "participacion en ganancias de asociadas", codigo: "4.9" },
];

await connectDatabase(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/ffa");

const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
const planId = config?.planCuentasVigenteId?.toString();
if (!planId) throw new Error("No hay planCuentasVigenteId en configuración");

const csv = readFileSync(resolve(root, "fixtures/plan-cuentas-ejemplo.csv"), "utf-8");
const rows = parseCsv(csv);
const before = await RubroInstitucionalModel.countDocuments({ planCuentasVersionId: planId, activo: true });
const rubrosByCodigo = await upsertRubros(planId, rows);
const after = await RubroInstitucionalModel.countDocuments({ planCuentasVersionId: planId, activo: true });

const reglasDoc = await ReglasClasificacionVersionModel.findOne({ version: "1.0.0" });
if (reglasDoc) {
  const existingIds = new Set(reglasDoc.reglas.map((r) => r.id));
  let added = 0;
  for (const r of NUEVAS_REGLAS) {
    if (existingIds.has(r.id)) continue;
    const rubroId = rubrosByCodigo.get(r.codigo);
    if (!rubroId) continue;
    reglasDoc.reglas.push({
      id: r.id,
      prioridad: r.prioridad,
      tipo: "patron_denominacion",
      patron: r.patron,
      rubroInstitucionalId: new Types.ObjectId(rubroId),
      activa: true,
    });
    added++;
  }
  if (added > 0) await reglasDoc.save();
  console.log(JSON.stringify({ reglasAgregadas: added }, null, 2));
}

await PlanCuentasHistorialModel.create({
  planCuentasVersionId: planId,
  accion: "rubro_creado",
  motivo: "Ampliación IFRS retail/minería — CMP y Falabella (16 rubros + aliases)",
  payload: { rubrosAntes: before, rubrosDespues: after, nuevos: after - before },
  at: new Date(),
});

console.log(
  JSON.stringify(
    {
      planId,
      rubrosAntes: before,
      rubrosDespues: after,
      nuevosRubros: after - before,
      ok: true,
    },
    null,
    2
  )
);

process.exit(0);
