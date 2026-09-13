import type { FastifyInstance } from "fastify";
import {
  compararCartera,
  compararEjercicios,
  criteriosHistoricosContribuyente,
  historialContribuyente,
} from "../services/comparacion.js";
import { authenticate } from "../plugins/auth.js";
import { lecturaEquipo } from "../plugins/rbac.js";

export async function comparacionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/contribuyentes/:id/historial-fichas",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const { id } = request.params as { id: string };
      return historialContribuyente(id);
    }
  );

  app.get(
    "/contribuyentes/:id/criterios-historicos",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const { id } = request.params as { id: string };
      return criteriosHistoricosContribuyente(id);
    }
  );

  app.get(
    "/comparacion/ejercicios",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const q = request.query as {
        contribuyenteId?: string;
        fichaActualId?: string;
        fichaAnteriorId?: string;
      };
      if (!q.contribuyenteId || !q.fichaActualId) {
        return reply.code(400).send({ error: "contribuyenteId y fichaActualId requeridos" });
      }
      try {
        return await compararEjercicios(
          q.contribuyenteId,
          q.fichaActualId,
          q.fichaAnteriorId
        );
      } catch (e) {
        return reply.code(400).send({
          error: e instanceof Error ? e.message : "Error en comparación",
        });
      }
    }
  );

  app.get(
    "/comparacion/cartera",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const q = request.query as { fichaIds?: string };
      if (!q.fichaIds?.trim()) {
        return reply.code(400).send({ error: "fichaIds requerido (comma-separated)" });
      }
      const ids = q.fichaIds.split(",").map((s) => s.trim()).filter(Boolean);
      try {
        return await compararCartera(ids);
      } catch (e) {
        return reply.code(400).send({
          error: e instanceof Error ? e.message : "Error en comparación de cartera",
        });
      }
    }
  );
}
