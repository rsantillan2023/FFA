import { CasoModel } from "@ffa/db";
import { CasoEstado } from "@ffa/shared";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../plugins/auth.js";
import { lecturaEquipo } from "../plugins/rbac.js";
import { buildProgreso } from "../services/caso-procesamiento-status.js";

export async function casosProgresoRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/casos/:id/progreso",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = await buildProgreso(id);
      if (!data) return reply.code(404).send({ error: "Caso no encontrado" });
      return data;
    }
  );

  app.get(
    "/casos/:id/progreso/stream",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const terminalEstados = new Set<string>([
        CasoEstado.EN_REVISION,
        CasoEstado.APROBADO,
        CasoEstado.INFORME_GENERADO,
        CasoEstado.ERROR,
        CasoEstado.RECHAZADO,
      ]);

      const send = async (): Promise<boolean> => {
        const data = await buildProgreso(id);
        if (!data) return true;
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        return terminalEstados.has(data.estado);
      };

      const doneInitial = await send();
      if (doneInitial) {
        reply.raw.end();
        return;
      }

      const interval = setInterval(async () => {
        const finished = await send();
        if (finished) {
          clearInterval(interval);
          reply.raw.end();
        }
      }, 2000);

      request.raw.on("close", () => {
        clearInterval(interval);
      });
    }
  );
}
