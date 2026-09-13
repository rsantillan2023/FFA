import { CasoModel, ContribuyenteModel } from "@ffa/db";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../plugins/auth.js";
import { lecturaEquipo } from "../plugins/rbac.js";

export async function buscarRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/buscar",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const q = (request.query as { q?: string; limit?: string }).q?.trim() ?? "";
      const limit = Math.min(30, Math.max(1, Number((request.query as { limit?: string }).limit) || 15));

      if (q.length < 2) {
        return { casos: [], contribuyentes: [] };
      }

      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      const [casos, contribuyentes] = await Promise.all([
        CasoModel.find({ $or: [{ numero: regex }, { referencia: regex }] })
          .sort({ createdAt: -1 })
          .limit(limit)
          .select("numero referencia estado semaforo contribuyenteId createdAt"),
        ContribuyenteModel.find({
          $or: [{ rut: regex }, { razonSocial: regex }, { denominacionesAlternativas: regex }],
        })
          .limit(limit)
          .select("rut razonSocial"),
      ]);

      return {
        casos: casos.map((c) => ({
          id: c._id.toString(),
          numero: c.numero,
          referencia: c.referencia ?? undefined,
          estado: c.estado,
          semaforo: c.semaforo ?? undefined,
          contribuyenteId: c.contribuyenteId?.toString(),
          createdAt: c.createdAt?.toISOString(),
        })),
        contribuyentes: contribuyentes.map((c) => ({
          id: c._id.toString(),
          rut: c.rut ?? undefined,
          razonSocial: c.razonSocial,
        })),
      };
    }
  );
}
