import {
  ConfiguracionSistemaModel,
  ReglasClasificacionVersionModel,
  RubroInstitucionalModel,
} from "@ffa/db";
import { CONFIG_SISTEMA_ID, PlanCuentasEstado, type ReglasVersionDto } from "@ffa/shared";
import type { FastifyInstance } from "fastify";
import { Types } from "mongoose";
import { z } from "zod";
import { authenticate } from "../plugins/auth.js";
import { adminOrPo, lecturaEquipo } from "../plugins/rbac.js";

const createVersionSchema = z.object({ version: z.string().min(1) });

const addReglaSchema = z.object({
  id: z.string().min(1),
  prioridad: z.number().int(),
  tipo: z.enum(["patron_denominacion", "codigo_origen", "regex", "contribuyente"]),
  patron: z.string().min(1),
  rubroInstitucionalId: z.string(),
  activa: z.boolean().optional(),
});

export async function reglasRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/reglas/versions",
    { preHandler: [authenticate, lecturaEquipo] },
    async (): Promise<ReglasVersionDto[]> => {
      const versions = await ReglasClasificacionVersionModel.find().sort({ createdAt: -1 });
      return versions.map((v) => ({
        id: v._id.toString(),
        version: v.version,
        estado: v.estado,
        reglasCount: v.reglas?.length ?? 0,
        createdAt: v.createdAt.toISOString(),
      }));
    }
  );

  app.get(
    "/reglas/versions/:id",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const doc = await ReglasClasificacionVersionModel.findById(id);
      if (!doc) return reply.code(404).send({ error: "Versión no encontrada" });

      const rubroIds = (doc.reglas ?? []).map((r) => r.rubroInstitucionalId);
      const rubros = await RubroInstitucionalModel.find({ _id: { $in: rubroIds } });
      const rubroMap = new Map(rubros.map((r) => [r._id.toString(), r.codigo]));

      return {
        id: doc._id.toString(),
        version: doc.version,
        estado: doc.estado,
        reglas: (doc.reglas ?? []).map((r) => ({
          id: r.id,
          prioridad: r.prioridad,
          tipo: r.tipo,
          patron: r.patron,
          rubroInstitucionalId: r.rubroInstitucionalId.toString(),
          rubroCodigo: rubroMap.get(r.rubroInstitucionalId.toString()),
          activa: r.activa,
        })),
      };
    }
  );

  app.post(
    "/reglas/versions",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const parsed = createVersionSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      const doc = await ReglasClasificacionVersionModel.create({
        version: parsed.data.version,
        estado: PlanCuentasEstado.BORRADOR,
        reglas: [],
      });

      return reply.code(201).send({
        id: doc._id.toString(),
        version: doc.version,
        estado: doc.estado,
        reglasCount: 0,
        createdAt: doc.createdAt.toISOString(),
      });
    }
  );

  app.post(
    "/reglas/versions/:id/reglas",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = addReglaSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      const doc = await ReglasClasificacionVersionModel.findById(id);
      if (!doc) return reply.code(404).send({ error: "Versión no encontrada" });
      if (doc.estado === PlanCuentasEstado.APROBADO) {
        return reply.code(400).send({ error: "Versión aprobada — cree una nueva versión" });
      }

      const rubro = await RubroInstitucionalModel.findById(parsed.data.rubroInstitucionalId);
      if (!rubro) return reply.code(400).send({ error: "Rubro inválido" });

      doc.reglas.push({
        id: parsed.data.id,
        prioridad: parsed.data.prioridad,
        tipo: parsed.data.tipo,
        patron: parsed.data.patron,
        rubroInstitucionalId: rubro._id,
        activa: parsed.data.activa ?? true,
      });
      await doc.save();

      return reply.code(201).send({ reglasCount: doc.reglas.length });
    }
  );

  app.post(
    "/reglas/versions/:id/aprobar",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const doc = await ReglasClasificacionVersionModel.findById(id);
      if (!doc) return reply.code(404).send({ error: "Versión no encontrada" });

      doc.estado = PlanCuentasEstado.APROBADO;
      doc.aprobacion = {
        by: new Types.ObjectId(request.user.id),
        at: new Date(),
      };
      await doc.save();

      await ConfiguracionSistemaModel.findByIdAndUpdate(CONFIG_SISTEMA_ID, {
        reglasVigenteId: doc._id,
      });

      return { id: doc._id.toString(), estado: doc.estado };
    }
  );
}
