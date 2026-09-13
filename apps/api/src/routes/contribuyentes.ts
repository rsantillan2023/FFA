import { CasoModel, ContribuyenteModel } from "@ffa/db";
import type { ContribuyenteDto, PaginatedResponse } from "@ffa/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../plugins/auth.js";
import { edicionEquipo, lecturaEquipo } from "../plugins/rbac.js";

function mapContribuyente(doc: {
  _id: { toString(): string };
  rut?: string | null;
  razonSocial: string;
  denominacionesAlternativas?: string[] | null;
  createdAt?: Date;
  updatedAt?: Date;
}): ContribuyenteDto {
  return {
    id: doc._id.toString(),
    rut: doc.rut ?? undefined,
    razonSocial: doc.razonSocial,
    denominacionesAlternativas: doc.denominacionesAlternativas ?? [],
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function normalizeRut(rut?: string): string | undefined {
  if (!rut?.trim()) return undefined;
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

const createSchema = z.object({
  rut: z.string().optional(),
  razonSocial: z.string().min(1),
  denominacionesAlternativas: z.array(z.string()).optional(),
});

const updateSchema = createSchema.partial();

export async function contribuyentesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/contribuyentes",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request): Promise<PaginatedResponse<ContribuyenteDto>> => {
      const query = request.query as { q?: string; page?: string; limit?: string };
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
      const filter: Record<string, unknown> = { mergedIntoId: { $exists: false } };

      if (query.q?.trim()) {
        const q = query.q.trim();
        filter.$or = [
          { razonSocial: { $regex: q, $options: "i" } },
          { rut: { $regex: q, $options: "i" } },
          { denominacionesAlternativas: { $regex: q, $options: "i" } },
        ];
      }

      const [items, total] = await Promise.all([
        ContribuyenteModel.find(filter)
          .sort({ razonSocial: 1 })
          .skip((page - 1) * limit)
          .limit(limit),
        ContribuyenteModel.countDocuments(filter),
      ]);

      return {
        items: items.map(mapContribuyente),
        total,
        page,
        limit,
      };
    }
  );

  app.get(
    "/contribuyentes/:id",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const doc = await ContribuyenteModel.findById(id);
      if (!doc || doc.mergedIntoId) {
        return reply.code(404).send({ error: "Contribuyente no encontrado" });
      }
      return mapContribuyente(doc);
    }
  );

  app.get(
    "/contribuyentes/:id/historial",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const doc = await ContribuyenteModel.findById(id);
      if (!doc) return reply.code(404).send({ error: "Contribuyente no encontrado" });

      const casos = await CasoModel.find({ contribuyenteId: id })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("numero estado createdAt canal");

      return {
        contribuyente: mapContribuyente(doc),
        casos: casos.map((c) => ({
          id: c._id.toString(),
          numero: c.numero,
          estado: c.estado,
          canal: c.canal,
          createdAt: c.createdAt?.toISOString(),
        })),
      };
    }
  );

  app.post(
    "/contribuyentes",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Datos inválidos" });
      }

      const rut = normalizeRut(parsed.data.rut);
      if (rut) {
        const dup = await ContribuyenteModel.findOne({ rut });
        if (dup) return reply.code(409).send({ error: "RUT ya registrado" });
      }

      const doc = await ContribuyenteModel.create({
        rut,
        razonSocial: parsed.data.razonSocial,
        denominacionesAlternativas: parsed.data.denominacionesAlternativas ?? [],
      });
      return reply.code(201).send(mapContribuyente(doc));
    }
  );

  app.patch(
    "/contribuyentes/:id",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Datos inválidos" });
      }

      const doc = await ContribuyenteModel.findById(id);
      if (!doc || doc.mergedIntoId) {
        return reply.code(404).send({ error: "Contribuyente no encontrado" });
      }

      if (parsed.data.rut !== undefined) {
        const rut = normalizeRut(parsed.data.rut);
        if (rut) {
          const dup = await ContribuyenteModel.findOne({ rut, _id: { $ne: id } });
          if (dup) return reply.code(409).send({ error: "RUT ya registrado" });
        }
        doc.rut = rut;
      }
      if (parsed.data.razonSocial) doc.razonSocial = parsed.data.razonSocial;
      if (parsed.data.denominacionesAlternativas) {
        doc.denominacionesAlternativas = parsed.data.denominacionesAlternativas;
      }
      await doc.save();
      return mapContribuyente(doc);
    }
  );

  app.post(
    "/contribuyentes/:id/merge",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { targetId?: string };
      if (!body.targetId) {
        return reply.code(400).send({ error: "targetId requerido" });
      }
      if (id === body.targetId) {
        return reply.code(400).send({ error: "No se puede fusionar consigo mismo" });
      }

      const [source, target] = await Promise.all([
        ContribuyenteModel.findById(id),
        ContribuyenteModel.findById(body.targetId),
      ]);
      if (!source || !target) {
        return reply.code(404).send({ error: "Contribuyente no encontrado" });
      }

      const alt = new Set([
        ...(target.denominacionesAlternativas ?? []),
        source.razonSocial,
        ...(source.denominacionesAlternativas ?? []),
      ]);
      if (source.rut && source.rut !== target.rut) alt.add(source.rut);
      target.denominacionesAlternativas = [...alt];
      await target.save();

      source.set("mergedIntoId", target._id);
      await source.save();

      await CasoModel.updateMany({ contribuyenteId: source._id }, { contribuyenteId: target._id });

      return {
        merged: mapContribuyente(source),
        target: mapContribuyente(target),
      };
    }
  );
}
