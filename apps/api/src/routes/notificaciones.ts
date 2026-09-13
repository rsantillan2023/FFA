import { NotificacionLogModel } from "@ffa/db";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../plugins/auth.js";
import { adminOrPo, lecturaEquipo } from "../plugins/rbac.js";

export async function notificacionesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/notificaciones",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const q = request.query as { casoId?: string; limit?: string };
      const limit = Math.min(100, Math.max(1, Number(q.limit) || 30));
      const filter: Record<string, unknown> = {};
      if (q.casoId) filter.casoId = q.casoId;

      const rows = await NotificacionLogModel.find(filter).sort({ enviadoAt: -1 }).limit(limit);
      return rows.map((r) => ({
        id: r._id.toString(),
        tipo: r.tipo,
        destinatario: r.destinatario,
        casoId: r.casoId?.toString(),
        estado: r.estado,
        asunto: r.asunto,
        error: r.error,
        enviadoAt: r.enviadoAt.toISOString(),
      }));
    }
  );

  app.get(
    "/admin/notificaciones",
    { preHandler: [authenticate, adminOrPo] },
    async (request) => {
      const q = request.query as { limit?: string };
      const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
      const rows = await NotificacionLogModel.find().sort({ enviadoAt: -1 }).limit(limit);
      return rows.map((r) => ({
        id: r._id.toString(),
        tipo: r.tipo,
        destinatario: r.destinatario,
        casoId: r.casoId?.toString(),
        estado: r.estado,
        asunto: r.asunto,
        error: r.error,
        enviadoAt: r.enviadoAt.toISOString(),
      }));
    }
  );
}
