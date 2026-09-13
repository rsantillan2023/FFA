import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  consolidarGrupo,
  getConsolidacionById,
  listConsolidaciones,
} from "../services/consolidacion.js";
import { authenticate } from "../plugins/auth.js";
import { lecturaEquipo } from "../plugins/rbac.js";

const consolidarSchema = z.object({
  nombre: z.string().min(1),
  fichaIds: z.array(z.string()).min(2).max(12),
});

export async function consolidacionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/consolidacion/grupos",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const q = request.query as { page?: string; limit?: string };
      const page = Number(q.page) || 1;
      const limit = Number(q.limit) || 20;
      return listConsolidaciones(page, limit);
    }
  );

  app.get(
    "/consolidacion/grupos/:id",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const grupo = await getConsolidacionById(id);
      if (!grupo) return reply.code(404).send({ error: "Grupo consolidado no encontrado" });
      return grupo;
    }
  );

  app.post(
    "/consolidacion/grupo",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const parsed = consolidarSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      try {
        return await consolidarGrupo(parsed.data.nombre, parsed.data.fichaIds, request.user.id);
      } catch (e) {
        return reply.code(400).send({
          error: e instanceof Error ? e.message : "No se pudo consolidar",
        });
      }
    }
  );
}
