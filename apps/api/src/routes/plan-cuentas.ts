import {
  AprobacionConfigModel,
  ConfiguracionSistemaModel,
  PlanCuentasHistorialModel,
  PlanCuentasVersionModel,
  RubroInstitucionalModel,
  UserModel,
  registrarPlanHistorial,
  type PlanCuentasVersionDocument,
  type RubroInstitucionalDocument,
} from "@ffa/db";
import { validatePlanStructure, type RubroRef } from "@ffa/pipeline";
import {
  AprobacionConfigEstado,
  CONFIG_SISTEMA_ID,
  PlanCuentasEstado,
  type PlanCuentasVersionDto,
  type RubroInstitucionalDto,
} from "@ffa/shared";
import type { FastifyInstance } from "fastify";
import { Types } from "mongoose";
import { z } from "zod";
import { parsePlanCuentasCsv } from "../lib/csv-plan-cuentas.js";
import { authenticate } from "../plugins/auth.js";
import { adminOrPo, lecturaEquipo } from "../plugins/rbac.js";

function mapVersion(
  doc: PlanCuentasVersionDocument,
  extras?: { responsableNombre?: string }
): PlanCuentasVersionDto {
  return {
    id: doc._id.toString(),
    version: doc.version,
    estado: doc.estado as PlanCuentasVersionDto["estado"],
    notas: doc.notas ?? undefined,
    aprobacion: doc.aprobacion
      ? {
          by: doc.aprobacion.by.toString(),
          at: doc.aprobacion.at.toISOString(),
          comentario: doc.aprobacion.comentario ?? undefined,
        }
      : undefined,
    responsableId: doc.responsableId?.toString(),
    responsableNombre: extras?.responsableNombre,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

async function mapVersionsWithResponsable(
  versions: PlanCuentasVersionDocument[]
): Promise<PlanCuentasVersionDto[]> {
  const respIds = [
    ...new Set(
      versions.map((v) => v.responsableId?.toString()).filter(Boolean) as string[]
    ),
  ];
  const users = respIds.length
    ? await UserModel.find({ _id: { $in: respIds } }).select("nombre")
    : [];
  const nameMap = new Map(users.map((u) => [u._id.toString(), u.nombre]));
  return versions.map((v) =>
    mapVersion(v, {
      responsableNombre: v.responsableId
        ? nameMap.get(v.responsableId.toString())
        : undefined,
    })
  );
}

function mapRubro(doc: RubroInstitucionalDocument): RubroInstitucionalDto {
  return {
    id: doc._id.toString(),
    planCuentasVersionId: doc.planCuentasVersionId.toString(),
    codigo: doc.codigo,
    nombre: doc.nombre,
    estadoFinanciero: doc.estadoFinanciero as RubroInstitucionalDto["estadoFinanciero"],
    corriente: doc.corriente ?? undefined,
    convencionSigno: doc.convencionSigno as "normal" | "invertido",
    padreId: doc.padreId?.toString(),
    orden: doc.orden,
    activo: doc.activo,
    aliases: doc.aliases?.length ? [...doc.aliases] : undefined,
    notaMargen: doc.notaMargen ?? undefined,
  };
}

async function rubrosToRefs(versionId: string): Promise<RubroRef[]> {
  const docs = await RubroInstitucionalModel.find({ planCuentasVersionId: versionId, activo: true });
  return docs.map((r) => ({
    id: r._id.toString(),
    codigo: r.codigo,
    nombre: r.nombre,
    estadoFinanciero: r.estadoFinanciero,
    convencionSigno: r.convencionSigno,
    corriente: r.corriente ?? undefined,
    padreId: r.padreId?.toString(),
    aliases: r.aliases?.length ? [...r.aliases] : undefined,
  }));
}

function buildRubroTree(rubros: RubroInstitucionalDto[]): RubroInstitucionalDto[] {
  const byId = new Map(rubros.map((r) => [r.id, { ...r, hijos: [] as RubroInstitucionalDto[] }]));
  const roots: RubroInstitucionalDto[] = [];
  for (const r of byId.values()) {
    if (r.padreId && byId.has(r.padreId)) {
      byId.get(r.padreId)!.hijos!.push(r);
    } else {
      roots.push(r);
    }
  }
  const sortRec = (nodes: RubroInstitucionalDto[]) => {
    nodes.sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo));
    nodes.forEach((n) => n.hijos && sortRec(n.hijos));
  };
  sortRec(roots);
  return roots;
}

const createVersionSchema = z.object({
  version: z.string().min(1),
  notas: z.string().optional(),
});

const createRubroSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  estadoFinanciero: z.enum(["activo", "pasivo", "patrimonio", "resultados"]),
  corriente: z.boolean().optional(),
  convencionSigno: z.enum(["normal", "invertido"]).default("normal"),
  padreId: z.string().optional(),
  orden: z.number().int().default(0),
  aliases: z.array(z.string()).optional(),
  notaMargen: z.string().optional(),
});

const patchRubroSchema = z.object({
  nombre: z.string().min(1).optional(),
  convencionSigno: z.enum(["normal", "invertido"]).optional(),
  aliases: z.array(z.string()).optional(),
  notaMargen: z.string().optional(),
  motivo: z.string().optional(),
});

export async function planCuentasRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/plan-cuentas/versions",
    { preHandler: [authenticate, lecturaEquipo] },
    async (): Promise<PlanCuentasVersionDto[]> => {
      const [versions, config] = await Promise.all([
        PlanCuentasVersionModel.find().sort({ createdAt: -1 }),
        ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID).select("planCuentasVigenteId"),
      ]);
      const vigenteId = config?.planCuentasVigenteId?.toString();
      const counts = await RubroInstitucionalModel.aggregate<{ _id: unknown; count: number }>([
        { $group: { _id: "$planCuentasVersionId", count: { $sum: 1 } } },
      ]);
      const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
      const mapped = await mapVersionsWithResponsable(versions);
      return mapped.map((v) => ({
        ...v,
        rubrosCount: countMap.get(v.id) ?? 0,
        esVigente: vigenteId != null && v.id === vigenteId,
      }));
    }
  );

  app.get(
    "/plan-cuentas/versions/vigente",
    { preHandler: [authenticate, lecturaEquipo] },
    async (_req, reply) => {
      const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
      if (!config?.planCuentasVigenteId) {
        return reply.code(404).send({ error: "No hay plan de cuentas vigente aprobado" });
      }
      const version = await PlanCuentasVersionModel.findById(config.planCuentasVigenteId);
      if (!version || version.estado !== PlanCuentasEstado.APROBADO) {
        return reply.code(404).send({ error: "Plan vigente no encontrado o no aprobado" });
      }
      return mapVersion(version);
    }
  );

  app.post(
    "/plan-cuentas/versions",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const parsed = createVersionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Datos inválidos" });
      }
      const exists = await PlanCuentasVersionModel.findOne({ version: parsed.data.version });
      if (exists) {
        return reply.code(409).send({ error: "Versión ya existe" });
      }
      const doc = await PlanCuentasVersionModel.create({
        ...parsed.data,
        estado: PlanCuentasEstado.BORRADOR,
        createdBy: new Types.ObjectId(request.user.id),
      });
      return reply.code(201).send(mapVersion(doc));
    }
  );

  app.get(
    "/plan-cuentas/versions/:id",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const version = await PlanCuentasVersionModel.findById(id);
      if (!version) return reply.code(404).send({ error: "Versión no encontrada" });
      return mapVersion(version);
    }
  );

  app.get(
    "/plan-cuentas/versions/:id/rubros",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const { id } = request.params as { id: string };
      const flat = await RubroInstitucionalModel.find({ planCuentasVersionId: id }).sort({
        orden: 1,
        codigo: 1,
      });
      return buildRubroTree(flat.map(mapRubro));
    }
  );

  app.post(
    "/plan-cuentas/versions/:id/rubros",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const version = await PlanCuentasVersionModel.findById(id);
      if (!version) return reply.code(404).send({ error: "Versión no encontrada" });
      if (version.estado === PlanCuentasEstado.APROBADO) {
        return reply.code(400).send({ error: "No se pueden editar rubros de versión aprobada" });
      }

      const parsed = createRubroSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Rubro inválido" });
      }

      const doc = await RubroInstitucionalModel.create({
        planCuentasVersionId: id,
        ...parsed.data,
        padreId: parsed.data.padreId || undefined,
      });
      await registrarPlanHistorial({
        planCuentasVersionId: id,
        accion: "rubro_creado",
        actorId: request.user.id,
        payload: { codigo: doc.codigo, nombre: doc.nombre },
      });
      return reply.code(201).send(mapRubro(doc));
    }
  );

  app.patch(
    "/plan-cuentas/versions/:id/rubros/:rid",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const { id, rid } = request.params as { id: string; rid: string };
      const version = await PlanCuentasVersionModel.findById(id);
      if (!version) return reply.code(404).send({ error: "Versión no encontrada" });
      if (version.estado === PlanCuentasEstado.APROBADO) {
        return reply.code(400).send({ error: "Versión aprobada no admite edición" });
      }

      const parsed = patchRubroSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      const rubro = await RubroInstitucionalModel.findOne({ _id: rid, planCuentasVersionId: id });
      if (!rubro) return reply.code(404).send({ error: "Rubro no encontrado" });

      if (parsed.data.nombre) rubro.nombre = parsed.data.nombre;
      if (parsed.data.convencionSigno) rubro.convencionSigno = parsed.data.convencionSigno;
      if (parsed.data.aliases) rubro.aliases = parsed.data.aliases;
      if (parsed.data.notaMargen !== undefined) rubro.notaMargen = parsed.data.notaMargen;
      await rubro.save();

      await registrarPlanHistorial({
        planCuentasVersionId: id,
        accion: "rubro_actualizado",
        actorId: request.user.id,
        motivo: parsed.data.motivo,
        payload: { rubroId: rid, cambios: parsed.data },
      });

      return mapRubro(rubro);
    }
  );

  app.get(
    "/plan-cuentas/versions/:id/historial",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const { id } = request.params as { id: string };
      const rows = await PlanCuentasHistorialModel.find({ planCuentasVersionId: id })
        .sort({ at: -1 })
        .limit(100);
      return rows.map((h) => ({
        id: h._id.toString(),
        planCuentasVersionId: id,
        accion: h.accion,
        actorId: h.actorId?.toString(),
        motivo: h.motivo ?? undefined,
        payload: h.payload as Record<string, unknown> | undefined,
        at: h.at.toISOString(),
      }));
    }
  );

  app.post(
    "/plan-cuentas/versions/:id/import-csv",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { csv?: string };
      if (!body?.csv?.trim()) {
        return reply.code(400).send({ error: "Campo csv requerido" });
      }

      const version = await PlanCuentasVersionModel.findById(id);
      if (!version) return reply.code(404).send({ error: "Versión no encontrada" });
      if (version.estado === PlanCuentasEstado.APROBADO) {
        return reply.code(400).send({ error: "Versión aprobada no admite importación" });
      }

      let rows;
      try {
        rows = parsePlanCuentasCsv(body.csv);
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : "CSV inválido" });
      }

      await RubroInstitucionalModel.deleteMany({ planCuentasVersionId: id });

      const codigoToId = new Map<string, string>();
      for (const row of rows) {
        const doc = await RubroInstitucionalModel.create({
          planCuentasVersionId: id,
          codigo: row.codigo,
          nombre: row.nombre,
          estadoFinanciero: row.estadoFinanciero,
          corriente: row.corriente,
          convencionSigno: row.convencionSigno,
          orden: row.orden,
          aliases: row.aliases,
          notaMargen: row.notaMargen,
        });
        codigoToId.set(row.codigo, doc._id.toString());
      }

      for (const row of rows) {
        if (!row.padreCodigo) continue;
        const childId = codigoToId.get(row.codigo);
        const padreId = codigoToId.get(row.padreCodigo);
        if (childId && padreId) {
          await RubroInstitucionalModel.findByIdAndUpdate(childId, { padreId });
        }
      }

      await registrarPlanHistorial({
        planCuentasVersionId: id,
        accion: "csv_importado",
        actorId: request.user.id,
        payload: { imported: rows.length },
      });

      return { imported: rows.length };
    }
  );

  app.post(
    "/plan-cuentas/versions/:id/solicitar-aprobacion",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const version = await PlanCuentasVersionModel.findById(id);
      if (!version) return reply.code(404).send({ error: "Versión no encontrada" });

      const rubrosCount = await RubroInstitucionalModel.countDocuments({ planCuentasVersionId: id });
      if (rubrosCount === 0) {
        return reply.code(400).send({ error: "La versión debe tener al menos un rubro" });
      }

      const estructura = validatePlanStructure(await rubrosToRefs(id));
      if (!estructura.ok) {
        return reply.code(400).send({ error: estructura.errores.join("; ") });
      }

      version.estado = PlanCuentasEstado.PENDIENTE_APROBACION;
      await version.save();

      await registrarPlanHistorial({
        planCuentasVersionId: id,
        accion: "solicitud_aprobacion",
        actorId: request.user.id,
      });

      await AprobacionConfigModel.create({
        tipo: "plan_cuentas",
        versionId: version._id,
        estado: AprobacionConfigEstado.PENDIENTE,
        solicitadoPor: new Types.ObjectId(request.user.id),
      });

      return mapVersion(version);
    }
  );

  app.post(
    "/plan-cuentas/versions/:id/aprobar",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { comentario?: string };
      const version = await PlanCuentasVersionModel.findById(id);
      if (!version) return reply.code(404).send({ error: "Versión no encontrada" });

      if (
        version.estado !== PlanCuentasEstado.PENDIENTE_APROBACION &&
        version.estado !== PlanCuentasEstado.BORRADOR
      ) {
        return reply.code(400).send({ error: "Estado no permite aprobación" });
      }

      await PlanCuentasVersionModel.updateMany(
        { _id: { $ne: id }, estado: PlanCuentasEstado.APROBADO },
        { estado: PlanCuentasEstado.OBSOLETO }
      );

      version.estado = PlanCuentasEstado.APROBADO;
      version.aprobacion = {
        by: new Types.ObjectId(request.user.id),
        at: new Date(),
        comentario: body.comentario,
      };
      await version.save();

      await AprobacionConfigModel.findOneAndUpdate(
        { tipo: "plan_cuentas", versionId: version._id, estado: AprobacionConfigEstado.PENDIENTE },
        {
          estado: AprobacionConfigEstado.APROBADO,
          aprobadoPor: request.user.id,
          comentarios: body.comentario,
          at: new Date(),
        }
      );

      await ConfiguracionSistemaModel.findByIdAndUpdate(CONFIG_SISTEMA_ID, {
        planCuentasVigenteId: version._id,
      });

      await registrarPlanHistorial({
        planCuentasVersionId: id,
        accion: "version_aprobada",
        actorId: request.user.id,
        motivo: body.comentario,
      });

      return mapVersion(version);
    }
  );

  app.patch(
    "/plan-cuentas/versions/:id/responsable",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { responsableId?: string | null };
      const version = await PlanCuentasVersionModel.findById(id);
      if (!version) return reply.code(404).send({ error: "Versión no encontrada" });

      if (body.responsableId) {
        const user = await UserModel.findById(body.responsableId);
        if (!user) return reply.code(400).send({ error: "Usuario responsable inválido" });
        version.set("responsableId", user._id);
      } else {
        version.set("responsableId", undefined);
      }
      await version.save();

      await registrarPlanHistorial({
        planCuentasVersionId: id,
        accion: "responsable_asignado",
        actorId: request.user.id,
        motivo: body.responsableId ?? "Sin responsable",
      });

      const responsableNombre = body.responsableId
        ? (await UserModel.findById(body.responsableId))?.nombre
        : undefined;
      return mapVersion(version, { responsableNombre });
    }
  );
}
