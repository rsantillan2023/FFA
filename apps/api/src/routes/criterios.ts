import {
  CasoModel,
  CriterioAprobadoModel,
  LineaContableModel,
  RubroInstitucionalModel,
} from "@ffa/db";
import { normalizarDenominacion } from "@ffa/pipeline";
import { LineaEstado } from "@ffa/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../plugins/auth.js";
import { edicionEquipo, lecturaEquipo } from "../plugins/rbac.js";

export async function criteriosRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/contribuyentes/:id/criterios",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const { id } = request.params as { id: string };
      const criterios = await CriterioAprobadoModel.find({ contribuyenteId: id }).sort({
        aprobadoAt: -1,
      });
      const rubroIds = criterios.map((c) => c.rubroInstitucionalId);
      const rubros = await RubroInstitucionalModel.find({ _id: { $in: rubroIds } });
      const rubroMap = new Map(rubros.map((r) => [r._id.toString(), r.codigo]));

      return criterios.map((c) => ({
        id: c._id.toString(),
        denominacionOrigen: c.denominacionOrigen,
        rubroInstitucionalId: c.rubroInstitucionalId.toString(),
        rubroCodigo: rubroMap.get(c.rubroInstitucionalId.toString()),
        aprobadoAt: c.aprobadoAt.toISOString(),
        activo: c.activo,
        version: c.version,
      }));
    }
  );

  app.patch(
    "/criterios/:id",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = z
        .object({
          activo: z.boolean().optional(),
          rubroInstitucionalId: z.string().optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      const criterio = await CriterioAprobadoModel.findById(id);
      if (!criterio) return reply.code(404).send({ error: "Criterio no encontrado" });

      if (parsed.data.activo != null) criterio.activo = parsed.data.activo;
      if (parsed.data.rubroInstitucionalId) {
        const rubro = await RubroInstitucionalModel.findById(parsed.data.rubroInstitucionalId);
        if (!rubro) return reply.code(400).send({ error: "Rubro inválido" });
        criterio.set("rubroInstitucionalId", rubro._id);
        criterio.version = (criterio.version ?? 1) + 1;
      }
      await criterio.save();

      return {
        id: criterio._id.toString(),
        activo: criterio.activo,
        version: criterio.version,
      };
    }
  );

  app.get(
    "/casos/:id/criterios-aplicados",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      const lineas = await LineaContableModel.find({
        casoId: id,
        origenClasificacion: "criterio_contribuyente",
      });

      if (!caso.contribuyenteId) return [];

      const criterios = await CriterioAprobadoModel.find({
        contribuyenteId: caso.contribuyenteId,
        activo: true,
      });
      const critByDenom = new Map(criterios.map((c) => [c.denominacionOrigen, c._id.toString()]));

      return lineas.map((l) => ({
        lineaId: l._id.toString(),
        denominacionOriginal: l.denominacionOriginal,
        rubroCodigo: l.rubroCodigo ?? undefined,
        criterioId: critByDenom.get(
          normalizarDenominacion(l.denominacionNormalizada ?? l.denominacionOriginal)
        ),
      }));
    }
  );

  app.get(
    "/contribuyentes/:id/metricas-aprendizaje",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const { id } = request.params as { id: string };
      const casos = await CasoModel.find({ contribuyenteId: id })
        .sort({ createdAt: 1 })
        .limit(20);

      async function countRevision(casoId: string): Promise<number> {
        return LineaContableModel.countDocuments({
          casoId,
          estado: { $in: [LineaEstado.CLASIFICADA, LineaEstado.APROBADA] },
          requiereRevision: true,
        });
      }

      let primera: { casoId: string; lineasRevision: number } | null = null;
      let segunda: { casoId: string; lineasRevision: number } | null = null;

      if (casos.length >= 1) {
        const rev = await countRevision(casos[0]!._id.toString());
        primera = { casoId: casos[0]!._id.toString(), lineasRevision: rev };
      }
      if (casos.length >= 2) {
        const rev = await countRevision(casos[1]!._id.toString());
        segunda = { casoId: casos[1]!._id.toString(), lineasRevision: rev };
      }

      let reduccion: number | null = null;
      if (primera && segunda && primera.lineasRevision > 0) {
        reduccion =
          ((primera.lineasRevision - segunda.lineasRevision) / primera.lineasRevision) * 100;
      }

      const criteriosActivos = await CriterioAprobadoModel.countDocuments({
        contribuyenteId: id,
        activo: true,
      });

      return {
        contribuyenteId: id,
        casosAnalizados: casos.length,
        primeraPresentacion: primera,
        segundaPresentacion: segunda,
        reduccionLineasRevisionPct: reduccion,
        criteriosActivos,
      };
    }
  );
}
