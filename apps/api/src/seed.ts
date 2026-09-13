import { CONFIG_SISTEMA_ID, PlanCuentasEstado, UserRole } from "@ffa/shared";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ConfiguracionSistemaModel,
  IndicadorDefinicionVersionModel,
  PlanCuentasHistorialModel,
  PlanCuentasVersionModel,
  PlantillaInformeVersionModel,
  ReglasClasificacionVersionModel,
  RubroInstitucionalModel,
  UserModel,
  connectDatabase,
  disconnectDatabase,
} from "@ffa/db";
import { stopMemoryMongo } from "@ffa/infra";
import { Types } from "mongoose";
import { appConfig } from "./config.js";
import { bootstrapInfra } from "./lib/bootstrap.js";
import { parsePlanCuentasCsv } from "./lib/csv-plan-cuentas.js";
import { refreshDemoInformes, refreshDemoPresentacion, seedDemoCasos } from "./seed-demo-casos.js";
import { INFORME_HTML_TEMPLATE } from "./services/informe-render.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

type PlanCsvRow = ReturnType<typeof parsePlanCuentasCsv>[number];

function loadPlanCsvRows(): PlanCsvRow[] {
  const csv = readFileSync(resolve(rootDir, "fixtures/plan-cuentas-ejemplo.csv"), "utf-8");
  return parsePlanCuentasCsv(csv);
}

function rubroPayload(planOid: Types.ObjectId, row: PlanCsvRow, padreId?: string) {
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

async function importRubrosForPlan(
  planId: string | Types.ObjectId,
  rows: PlanCsvRow[]
): Promise<Map<string, string>> {
  const planOid = new Types.ObjectId(String(planId));
  const rubrosByCodigo = new Map<string, string>();
  const csvCodes = new Set(rows.map((r) => r.codigo));
  const existing = await RubroInstitucionalModel.countDocuments({ planCuentasVersionId: planOid });

  if (existing === 0) {
    const padreIds = new Map<string, string>();
    for (const row of rows) {
      const doc = await RubroInstitucionalModel.create(
        rubroPayload(planOid, row, row.padreCodigo ? padreIds.get(row.padreCodigo) : undefined)
      );
      const id = doc._id.toString();
      padreIds.set(row.codigo, id);
      rubrosByCodigo.set(row.codigo, id);
    }
    return rubrosByCodigo;
  }

  const idByCodigo = new Map<string, string>();
  for (const row of rows) {
    const doc = await RubroInstitucionalModel.findOneAndUpdate(
      { planCuentasVersionId: planOid, codigo: row.codigo },
      {
        $set: {
          ...rubroPayload(planOid, row),
          padreId: undefined,
        },
      },
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
    rubrosByCodigo.set(row.codigo, idByCodigo.get(row.codigo)!);
  }

  await RubroInstitucionalModel.updateMany(
    { planCuentasVersionId: planOid, codigo: { $nin: [...csvCodes] } },
    { $set: { activo: false } }
  );

  return rubrosByCodigo;
}

async function seedPlanHistorial(
  planId: string | Types.ObjectId,
  adminId: Types.ObjectId,
  entries: Array<{ accion: string; motivo: string; at: Date }>
): Promise<void> {
  const planOid = new Types.ObjectId(String(planId));
  const existing = await PlanCuentasHistorialModel.countDocuments({ planCuentasVersionId: planOid });
  if (existing > 0) return;
  for (const entry of entries) {
    await PlanCuentasHistorialModel.create({
      planCuentasVersionId: planOid,
      accion: entry.accion,
      actorId: adminId,
      motivo: entry.motivo,
      at: entry.at,
    });
  }
}

const DEMO_PLAN_REFERENTES = [
  {
    version: "0.9.0",
    email: "m.gonzalez@ecr-salud.local",
    nombre: "María González",
    rol: UserRole.REFERENTE,
  },
  {
    version: "1.0.0",
    email: "p.ferreyra@ecr-salud.local",
    nombre: "Patricia Ferreyra",
    rol: UserRole.REFERENTE,
  },
  {
    version: "1.1.0",
    email: "l.almada@ecr-salud.local",
    nombre: "Lucas Almada",
    rol: UserRole.REFERENTE,
  },
  {
    version: "1.2.0",
    email: "d.morales@ecr-salud.local",
    nombre: "Diego Morales",
    rol: UserRole.PRODUCT_OWNER,
  },
] as const;

async function upsertDemoUser(
  email: string,
  nombre: string,
  rol: (typeof UserRole)[keyof typeof UserRole]
): Promise<Types.ObjectId> {
  const passwordHash = await bcrypt.hash("Demo123!", 12);
  const user = await UserModel.findOneAndUpdate(
    { email },
    { email, passwordHash, nombre, rol, activo: true },
    { upsert: true, new: true }
  );
  return new Types.ObjectId(user._id.toString());
}

/** Asigna un referente distinto a cada versión del plan (idempotente en cada seed). */
async function assignDemoPlanReferentes(): Promise<number> {
  let assigned = 0;
  for (const ref of DEMO_PLAN_REFERENTES) {
    const responsableId = await upsertDemoUser(ref.email, ref.nombre, ref.rol);
    const result = await PlanCuentasVersionModel.updateOne(
      { version: ref.version },
      { $set: { responsableId } }
    );
    if (result.matchedCount > 0) assigned++;
  }
  return assigned;
}

/** Versiones adicionales (obsoleta, borrador, pendiente) para demo del ciclo de vida del plan. */
async function ensureDemoPlanVersions(adminId: string): Promise<number> {
  const adminOid = new Types.ObjectId(adminId);
  const allRows = loadPlanCsvRows();
  let created = 0;

  const defs: Array<{
    version: string;
    estado: (typeof PlanCuentasEstado)[keyof typeof PlanCuentasEstado];
    notas: string;
    createdAt: Date;
    aprobacionAt?: Date;
    filter: (rows: PlanCsvRow[]) => PlanCsvRow[];
    historial: Array<{ accion: string; motivo: string; at: Date }>;
  }> = [
    {
      version: "0.9.0",
      estado: PlanCuentasEstado.OBSOLETO,
      notas: "Plan institucional 2024 — reemplazado por v1.0.0 (dic. 2025)",
      createdAt: new Date("2024-03-15T10:00:00"),
      aprobacionAt: new Date("2024-04-01T12:00:00"),
      filter: (rows) => rows.filter((r) => !["2.2.02", "3.4"].includes(r.codigo)),
      historial: [
        {
          accion: "csv_importado",
          motivo: "Importación CSV — plan reducido (sin pasivos por contrato ni participaciones minoritarias)",
          at: new Date("2024-03-16T09:00:00"),
        },
        {
          accion: "version_aprobada",
          motivo: "Aprobado por comité técnico — vigente hasta v1.0.0",
          at: new Date("2024-04-01T12:00:00"),
        },
      ],
    },
    {
      version: "1.1.0",
      estado: PlanCuentasEstado.BORRADOR,
      notas: "Borrador 2026 — ampliación IFRS 16 y rubros de resultados pendientes",
      createdAt: new Date("2026-01-10T14:00:00"),
      filter: (rows) => rows.filter((r) => !r.codigo.startsWith("4.")),
      historial: [
        {
          accion: "csv_importado",
          motivo: "Importación parcial — activo, pasivo y patrimonio (sin EERR aún)",
          at: new Date("2026-01-11T11:00:00"),
        },
      ],
    },
    {
      version: "1.2.0",
      estado: PlanCuentasEstado.PENDIENTE_APROBACION,
      notas: "En comité técnico — segregación de pasivos laborales y notas explicativas",
      createdAt: new Date("2026-02-20T09:30:00"),
      filter: (rows) => rows,
      historial: [
        {
          accion: "csv_importado",
          motivo: "Plan completo importado desde plantilla institucional",
          at: new Date("2026-02-21T10:00:00"),
        },
        {
          accion: "solicitud_aprobacion",
          motivo: "Enviado a aprobación del Product Owner",
          at: new Date("2026-03-01T16:00:00"),
        },
      ],
    },
  ];

  for (const def of defs) {
    const exists = await PlanCuentasVersionModel.exists({ version: def.version });
    if (exists) continue;

    const plan = await PlanCuentasVersionModel.create({
      version: def.version,
      estado: def.estado,
      notas: def.notas,
      createdBy: adminOid,
      ...(def.aprobacionAt
        ? {
            aprobacion: {
              by: adminOid,
              at: def.aprobacionAt,
              comentario: "Aprobación histórica (demo)",
            },
          }
        : {}),
    });
    await PlanCuentasVersionModel.updateOne(
      { _id: plan._id },
      { $set: { createdAt: def.createdAt, updatedAt: def.createdAt } }
    );
    await importRubrosForPlan(plan._id.toString(), def.filter(allRows));
    await seedPlanHistorial(plan._id.toString(), adminOid, def.historial);
    created++;
  }

  await PlanCuentasVersionModel.updateOne(
    { version: "1.0.0", notas: /seed|inicial/i },
    {
      $set: {
        notas: "Plan vigente 2025 — estructura NIIF alineada a estados consolidados YPF (2023)",
      },
    }
  );

  return created;
}

async function seedPlanCuentas(adminId: string): Promise<{
  planVersionId: string;
  rubrosByCodigo: Map<string, string>;
}> {
  const adminOid = new Types.ObjectId(adminId);
  let plan = await PlanCuentasVersionModel.findOne({ version: "1.0.0" });
  if (!plan) {
    plan = await PlanCuentasVersionModel.create({
      version: "1.0.0",
      estado: PlanCuentasEstado.APROBADO,
      notas: "Plan vigente 2025 — clasificación ampliada con provisiones y reservas legales",
      createdBy: adminOid,
      aprobacion: {
        by: adminOid,
        at: new Date("2025-12-01T10:00:00"),
        comentario: "Aprobado — reemplaza v0.9.0",
      },
    });
    await PlanCuentasVersionModel.updateOne(
      { _id: plan._id },
      { $set: { createdAt: new Date("2025-11-20T09:00:00") } }
    );
    await seedPlanHistorial(plan._id.toString(), adminOid, [
      {
        accion: "csv_importado",
        motivo: "Importación CSV completa — 59 rubros NIIF (referencia YPF 2023)",
        at: new Date("2025-11-21T10:00:00"),
      },
      {
        accion: "version_aprobada",
        motivo: "Marcado como plan vigente institucional",
        at: new Date("2025-12-01T10:00:00"),
      },
    ]);
  }

  const rubrosByCodigo = await importRubrosForPlan(plan._id.toString(), loadPlanCsvRows());
  return { planVersionId: plan._id.toString(), rubrosByCodigo };
}

async function seedReglas(rubrosByCodigo: Map<string, string>): Promise<string> {
  const reglasDef: Array<{
    id: string;
    prioridad: number;
    patron: string;
    codigo: string;
    tipo?: "patron_denominacion" | "regex";
  }> = [
    { id: "r-cash", prioridad: 1, patron: "cash and cash", codigo: "1.2.01" },
    { id: "r-efectivo", prioridad: 2, patron: "efectivo y equivalente", codigo: "1.2.01" },
    { id: "r-caja", prioridad: 3, patron: "caja", codigo: "1.2.01" },
    { id: "r-intangibles", prioridad: 4, patron: "intangible", codigo: "1.1.01" },
    { id: "r-ppe-en", prioridad: 5, patron: "property plant", codigo: "1.1.02" },
    { id: "r-ppe", prioridad: 6, patron: "propiedades", codigo: "1.1.02" },
    { id: "r-rou", prioridad: 7, patron: "right-of-use", codigo: "1.1.03" },
    { id: "r-asociadas", prioridad: 8, patron: "associates and joint", codigo: "1.1.04" },
    { id: "r-inventarios", prioridad: 9, patron: "inventor", codigo: "1.2.05" },
    { id: "r-trade-rec", prioridad: 10, patron: "trade receivable", codigo: "1.2.03" },
    { id: "r-cxc", prioridad: 11, patron: "cuentas por cobrar", codigo: "1.2.03" },
    { id: "r-activos-fin", prioridad: 12, patron: "investments in financial", codigo: "1.2.02" },
    { id: "r-imp-dif-activo", prioridad: 13, patron: "deferred income tax asset", codigo: "1.1.07" },
    { id: "r-provision-nc", prioridad: 14, patron: "provisions non", codigo: "2.1.01" },
    { id: "r-provision", prioridad: 15, patron: "provision", codigo: "2.2.01" },
    { id: "r-lease-nc", prioridad: 16, patron: "lease liabilities non", codigo: "2.1.07" },
    { id: "r-lease", prioridad: 17, patron: "lease liabilit", codigo: "2.2.06" },
    { id: "r-deuda-nc", prioridad: 18, patron: "deuda financiera no", codigo: "2.1.08" },
    { id: "r-deuda", prioridad: 19, patron: "deuda largo", codigo: "2.1.08" },
    { id: "r-loans-nc", prioridad: 20, patron: "loans non", codigo: "2.1.08" },
    { id: "r-loans", prioridad: 21, patron: "loans current", codigo: "2.2.07" },
    { id: "r-cxp-en", prioridad: 22, patron: "accounts payable", codigo: "2.2.09" },
    { id: "r-cxp", prioridad: 23, patron: "cuentas por pagar", codigo: "2.2.09" },
    { id: "r-sueldos", prioridad: 24, patron: "salaries and social", codigo: "2.2.05" },
    { id: "r-imp-gan-nc", prioridad: 25, patron: "deferred income tax liab", codigo: "2.1.03" },
    { id: "r-capital", prioridad: 26, patron: "capital emitido", codigo: "3.1" },
    { id: "r-aportes", prioridad: 27, patron: "shareholders contribution", codigo: "3.1" },
    { id: "r-ret-util", prioridad: 28, patron: "utilidades retenidas", codigo: "3.2" },
    { id: "r-retained", prioridad: 29, patron: "retained earnings", codigo: "3.2" },
    { id: "r-retiros", prioridad: 30, patron: "retiros", codigo: "3.5" },
    { id: "r-minorit", prioridad: 31, patron: "non-controlling", codigo: "3.4" },
    { id: "r-ingresos-en", prioridad: 32, patron: "^revenues$", codigo: "4.1", tipo: "regex" },
    { id: "r-ingresos", prioridad: 33, patron: "ingresos operacion", codigo: "4.1" },
    { id: "r-fin-costs", prioridad: 34, patron: "financial cost", codigo: "4.10" },
    { id: "r-costos-en", prioridad: 35, patron: "^costs$", codigo: "4.2", tipo: "regex" },
    { id: "r-costos", prioridad: 36, patron: "costos operacion", codigo: "4.2" },
    { id: "r-gastos-adm", prioridad: 37, patron: "administrative expense", codigo: "4.4" },
    { id: "r-exploracion", prioridad: 38, patron: "exploration expense", codigo: "4.5" },
    { id: "r-deterioro", prioridad: 39, patron: "impairment of property", codigo: "4.6" },
    { id: "r-res-fin", prioridad: 40, patron: "net financial result", codigo: "4.10" },
    { id: "r-imp-gan", prioridad: 41, patron: "income tax", codigo: "4.11" },
    { id: "r-utilidad-en", prioridad: 42, patron: "net profit or loss", codigo: "4.12" },
    { id: "r-utilidad", prioridad: 43, patron: "utilidad del ejercicio", codigo: "4.12" },
    { id: "r-nota-caja", prioridad: 44, patron: "fondos fijos", codigo: "1.2.01" },
    { id: "r-nota-ppe", prioridad: 45, patron: "nota explicativa", codigo: "1.1.02" },
  ];

  const reglasPayload = reglasDef
    .filter((r) => rubrosByCodigo.has(r.codigo))
    .map((r) => ({
      id: r.id,
      prioridad: r.prioridad,
      tipo: r.tipo ?? ("patron_denominacion" as const),
      patron: r.patron,
      rubroInstitucionalId: rubrosByCodigo.get(r.codigo)!,
      activa: true,
    }));

  const reglas = await ReglasClasificacionVersionModel.findOneAndUpdate(
    { version: "1.0.0" },
    {
      $set: {
        reglas: reglasPayload,
        estado: PlanCuentasEstado.APROBADO,
      },
      $setOnInsert: { version: "1.0.0" },
    },
    { upsert: true, new: true }
  );
  return reglas._id.toString();
}

async function seedIndicadores(): Promise<string> {
  const indicadores = [
    {
      codigo: "LIQ_CORRIENTE",
      nombre: "Liquidez corriente",
      categoria: "liquidez",
      formula: "AC_CORRIENTE / PC_CORRIENTE",
      rubrosRequeridos: ["1.2", "2.2"],
      obligatorio: true,
    },
    {
      codigo: "END_TOTAL",
      nombre: "Endeudamiento total",
      categoria: "endeudamiento",
      formula: "(PC_CORRIENTE + PC_NO_CORRIENTE) / ACTIVO",
      rubrosRequeridos: ["2.1", "2.2", "1.1", "1.2"],
      obligatorio: true,
    },
    {
      codigo: "MARGEN_BRUTO",
      nombre: "Margen bruto aprox.",
      categoria: "rentabilidad",
      formula: "(R_4_1 - R_4_2) / R_4_1",
      rubrosRequeridos: ["4.1", "4.2"],
      obligatorio: false,
    },
    {
      codigo: "CAP_TRABAJO",
      nombre: "Capital de trabajo",
      categoria: "capital_trabajo",
      formula: "AC_CORRIENTE - PC_CORRIENTE",
      rubrosRequeridos: ["1.2", "2.2"],
      obligatorio: true,
    },
    {
      codigo: "COBERTURA_PAT",
      nombre: "Cobertura patrimonial",
      categoria: "factoring",
      formula: "PATRIMONIO / (PC_CORRIENTE + PC_NO_CORRIENTE)",
      rubrosRequeridos: ["3.1", "2.1", "2.2"],
      obligatorio: false,
    },
  ];

  const ver = await IndicadorDefinicionVersionModel.findOneAndUpdate(
    { version: "1.0.0" },
    {
      $set: {
        indicadores,
        estado: PlanCuentasEstado.APROBADO,
      },
      $setOnInsert: { version: "1.0.0" },
    },
    { upsert: true, new: true }
  );
  return ver._id.toString();
}

async function seedPlantillaInforme(): Promise<string> {
  const secciones = [
    { id: "apartado_analisis", nombre: "Análisis del analista", tipo: "variable" as const, obligatorio: true },
    { id: "apartado_recomendacion", nombre: "Recomendación", tipo: "variable" as const, obligatorio: true },
    { id: "tabla_balance", nombre: "Balance", tipo: "auto" as const },
    { id: "tabla_indicadores", nombre: "Indicadores", tipo: "auto" as const },
    { id: "tabla_trazabilidad", nombre: "Trazabilidad", tipo: "auto" as const },
    { id: "tabla_inconsistencias", nombre: "Inconsistencias", tipo: "auto" as const },
  ];

  const ver = await PlantillaInformeVersionModel.findOneAndUpdate(
    { version: "1.0.0" },
    {
      $set: { htmlTemplate: INFORME_HTML_TEMPLATE, secciones, estado: PlanCuentasEstado.APROBADO },
      $setOnInsert: { version: "1.0.0" },
    },
    { upsert: true, new: true }
  );
  return ver._id.toString();
}

export async function runSeed(options: {
  skipBootstrap?: boolean;
  teardown?: boolean;
} = {}): Promise<void> {
  if (!options.skipBootstrap) {
    const mongoUri = await bootstrapInfra();
    await connectDatabase(mongoUri);
  }

  const passwordHash = await bcrypt.hash(appConfig.seedAdminPassword, 12);
  const admin = await UserModel.findOneAndUpdate(
    { email: appConfig.seedAdminEmail },
    {
      email: appConfig.seedAdminEmail,
      passwordHash,
      nombre: "Administrador SOOFT FINYX",
      rol: UserRole.ADMIN,
      activo: true,
    },
    { upsert: true, new: true }
  );

  const { planVersionId, rubrosByCodigo } = await seedPlanCuentas(admin._id.toString());
  const planesDemoExtra = await ensureDemoPlanVersions(admin._id.toString());
  const referentesPlan = await assignDemoPlanReferentes();
  const reglasVersionId = await seedReglas(rubrosByCodigo);
  const indicadoresVersionId = await seedIndicadores();
  const plantillaVersionId = await seedPlantillaInforme();

  const extractionProvider = process.env.OPENAI_API_KEY?.trim() ? "openai" : "mock";

  await ConfiguracionSistemaModel.findByIdAndUpdate(
    CONFIG_SISTEMA_ID,
    {
      _id: CONFIG_SISTEMA_ID,
      umbralConfianza: 85,
      extractionProvider,
      planCuentasVigenteId: planVersionId,
      reglasVigenteId: reglasVersionId,
      indicadoresVigenteId: indicadoresVersionId,
      plantillaVigenteId: plantillaVersionId,
      notificacionAnalistas: [appConfig.seedAdminEmail],
      notificacionAdmin: [appConfig.seedAdminEmail],
    },
    { upsert: true, new: true }
  );

  await seedDemoCasos({
    adminId: admin._id.toString(),
    planVersionId,
    reglasVersionId,
    indicadoresVersionId,
    plantillaVersionId,
    rubrosByCodigo,
    umbral: 85,
  });

  const presentacionDemo = await refreshDemoPresentacion();
  if (presentacionDemo > 0) {
    console.log(`  Textos demo actualizados: ${presentacionDemo} caso(s)`);
  }

  const informesDemo = await refreshDemoInformes();
  if (informesDemo > 0) {
    console.log(`  Informes demo regenerados: ${informesDemo}`);
  }

  const planCount = await PlanCuentasVersionModel.countDocuments();
  console.log("Seed OK:");
  console.log(`  Admin: ${appConfig.seedAdminEmail}`);
  console.log(
    `  Plan cuentas: v1.0.0 vigente (${rubrosByCodigo.size} rubros) · ${planCount} versión(es) en total`
  );
  if (planesDemoExtra > 0) {
    console.log(`  Planes contables demo: +${planesDemoExtra} versión(es) históricas/borrador`);
  }
  if (referentesPlan > 0) {
    console.log(`  Referentes del plan: ${referentesPlan} versión(es) asignadas`);
  }
  console.log(`  Reglas clasificación: ${reglasVersionId}`);
  console.log(`  Indicadores: ${indicadoresVersionId}`);
  console.log(`  Plantilla informe: ${plantillaVersionId}`);
  console.log(`  Proveedor extracción: ${extractionProvider}`);

  if (options.teardown !== false) {
    await disconnectDatabase();
    await stopMemoryMongo();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeed({ teardown: true }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
