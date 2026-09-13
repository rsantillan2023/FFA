import {
  AccesoFallidoModel,
  AuditoriaEventoModel,
  CasoModel,
  ConfiguracionSistemaModel,
  ReglasClasificacionVersionModel,
  RubroInstitucionalModel,
  ejecutarPurgaRetencion,
  listarIaLlamadas,
  resumenIaLlamadas,
} from "@ffa/db";
import {
  calcularConfianzaGlobal,
  classifyLines,
  normalizarDenominacion,
  type RubroRef,
} from "@ffa/pipeline";
import { reprocesarCaso } from "../services/reprocesar.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getQueuesStatus } from "../lib/admin-queues.js";
import { resolveCasoId } from "../lib/caso-ref.js";
import { authenticate } from "../plugins/auth.js";
import { adminOrPo } from "../plugins/rbac.js";
import { CONFIG_SISTEMA_ID, type ClasificacionPruebaResultDto } from "@ffa/shared";

const pruebaClasificacionSchema = z.object({
  lineas: z
    .array(
      z.object({
        denominacionOriginal: z.string().min(1),
        montoOriginal: z.number().default(0),
      })
    )
    .min(1)
    .max(50),
  umbralConfianza: z.number().min(0).max(100).optional(),
});



export async function adminRoutes(app: FastifyInstance): Promise<void> {

  app.get(

    "/admin/auditoria",

    { preHandler: [authenticate, adminOrPo] },

    async (request, reply) => {

      const q = request.query as {

        limit?: string;

        casoId?: string;

        actorId?: string;

        contribuyenteId?: string;

        desde?: string;

        hasta?: string;

        accion?: string;

        format?: string;

      };

      const limit = Math.min(500, Math.max(1, Number(q.limit) || 50));

      const filter: Record<string, unknown> = {};



      if (q.casoId) filter.casoId = q.casoId;

      if (q.actorId) filter.actorId = q.actorId;

      if (q.accion) filter.accion = q.accion;

      if (q.desde || q.hasta) {

        filter.at = {};

        if (q.desde) (filter.at as Record<string, Date>).$gte = new Date(q.desde);

        if (q.hasta) (filter.at as Record<string, Date>).$lte = new Date(q.hasta);

      }

      if (q.contribuyenteId) {

        const casos = await CasoModel.find({ contribuyenteId: q.contribuyenteId }).select("_id");

        filter.casoId = { $in: casos.map((c) => c._id) };

      }



      const events = await AuditoriaEventoModel.find(filter).sort({ at: -1 }).limit(limit);



      if (q.format === "csv") {

        const header = "at,actorTipo,actorId,casoId,entidad,accion\n";

        const body = events

          .map(

            (e) =>

              `"${e.at.toISOString()}","${e.actorTipo}","${e.actorId?.toString() ?? ""}","${e.casoId?.toString() ?? ""}","${e.entidad}","${e.accion}"`

          )

          .join("\n");

        reply.header("Content-Type", "text/csv; charset=utf-8");

        reply.header("Content-Disposition", 'attachment; filename="auditoria-admin.csv"');

        return header + body;

      }



      return events.map((e) => ({

        id: e._id.toString(),

        at: e.at.toISOString(),

        actorTipo: e.actorTipo,

        actorId: e.actorId?.toString(),

        casoId: e.casoId?.toString(),

        entidad: e.entidad,

        accion: e.accion,

        payload: e.payload ?? {},

        configSnapshot: e.configSnapshot

          ? {

              planCuentasVersionId: e.configSnapshot.planCuentasVersionId?.toString(),

              umbral: e.configSnapshot.umbral,

            }

          : undefined,

      }));

    }

  );



  app.get(

    "/admin/colas",

    { preHandler: [authenticate, adminOrPo] },

    async () => getQueuesStatus()

  );



  app.post(

    "/admin/casos/:id/reprocesar",

    { preHandler: [authenticate, adminOrPo] },

    async (request, reply) => {

      const { id } = request.params as { id: string };

      try {
        const casoId = await resolveCasoId(id);
        await reprocesarCaso(casoId, request.user.id);
        return { ok: true, casoId };

      } catch (e) {

        return reply.code(400).send({

          error: e instanceof Error ? e.message : "No se pudo reprocesar",

        });

      }

    }

  );



  app.post(
    "/admin/clasificacion/prueba",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply): Promise<ClasificacionPruebaResultDto | { error: string }> => {
      const parsed = pruebaClasificacionSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
      if (!config?.planCuentasVigenteId) {
        return reply.code(400).send({ error: "No hay plan de cuentas vigente" });
      }

      const rubrosDocs = await RubroInstitucionalModel.find({
        planCuentasVersionId: config.planCuentasVigenteId,
        activo: true,
      });
      const rubros: RubroRef[] = rubrosDocs.map((r) => ({
        id: r._id.toString(),
        codigo: r.codigo,
        nombre: r.nombre,
        estadoFinanciero: r.estadoFinanciero,
        convencionSigno: r.convencionSigno,
        corriente: r.corriente ?? undefined,
        padreId: r.padreId?.toString(),
        aliases: r.aliases?.length ? [...r.aliases] : undefined,
      }));
      const rubrosById = new Map(rubros.map((r) => [r.id, r]));

      let reglas: Parameters<typeof classifyLines>[0]["reglas"] = [];
      if (config.reglasVigenteId) {
        const reglasDoc = await ReglasClasificacionVersionModel.findById(config.reglasVigenteId);
        reglas = (reglasDoc?.reglas ?? []).map((r) => ({
          id: r.id,
          prioridad: r.prioridad,
          tipo: r.tipo,
          patron: r.patron,
          rubroInstitucionalId: r.rubroInstitucionalId.toString(),
          activa: r.activa,
        }));
      }

      const umbral = parsed.data.umbralConfianza ?? config.umbralConfianza;
      const normalized = parsed.data.lineas.map((l) => ({
        denominacionOriginal: l.denominacionOriginal,
        montoOriginal: l.montoOriginal,
        montoNormalizado: l.montoOriginal,
        denominacionNormalizada: normalizarDenominacion(l.denominacionOriginal),
        paginaNumero: 1,
        signoAplicado: "positivo" as const,
      }));

      const classified = classifyLines({
        lineas: normalized,
        rubros,
        reglas,
        umbralConfianza: umbral,
      });

      return {
        lineas: classified.map((c) => ({
          denominacionOriginal: c.denominacionOriginal,
          rubroCodigo: c.rubroCodigo,
          rubroNombre: c.rubroInstitucionalId
            ? rubrosById.get(c.rubroInstitucionalId)?.nombre
            : undefined,
          confianzaClasificacion: c.confianzaClasificacion,
          origenClasificacion: c.origenClasificacion,
          requiereRevision: c.requiereRevision,
          candidatosAsistidos: c.candidatosAsistidos,
        })),
        confianzaGlobal: calcularConfianzaGlobal(classified),
      };
    }
  );

  app.post(
    "/admin/purga-retencion",
    { preHandler: [authenticate, adminOrPo] },
    async () => ejecutarPurgaRetencion()
  );

  app.get(

    "/admin/accesos-fallidos",

    { preHandler: [authenticate, adminOrPo] },

    async (request) => {

      const q = request.query as { limit?: string };

      const limit = Math.min(100, Math.max(1, Number(q.limit) || 30));

      const rows = await AccesoFallidoModel.find().sort({ at: -1 }).limit(limit);

      return rows.map((r) => ({

        id: r._id.toString(),

        email: r.email,

        ip: r.ip,

        motivo: r.motivo,

        at: r.at.toISOString(),

      }));

    }

  );

  app.get(
    "/admin/ia-llamadas/resumen",
    { preHandler: [authenticate, adminOrPo] },
    async (request) => {
      const q = request.query as {
        actorId?: string;
        casoId?: string;
        proveedor?: string;
        funcion?: string;
        desde?: string;
        hasta?: string;
      };

      return resumenIaLlamadas({
        actorId: q.actorId,
        casoId: q.casoId,
        proveedor: q.proveedor,
        funcion: q.funcion,
        desde: q.desde ? new Date(q.desde) : undefined,
        hasta: q.hasta ? new Date(q.hasta) : undefined,
      });
    }
  );

  app.get(
    "/admin/ia-llamadas",
    { preHandler: [authenticate, adminOrPo] },
    async (request) => {
      const q = request.query as {
        limit?: string;
        actorId?: string;
        casoId?: string;
        proveedor?: string;
        funcion?: string;
        desde?: string;
        hasta?: string;
      };

      const rows = await listarIaLlamadas({
        limit: Number(q.limit) || 100,
        actorId: q.actorId,
        casoId: q.casoId,
        proveedor: q.proveedor,
        funcion: q.funcion,
        desde: q.desde ? new Date(q.desde) : undefined,
        hasta: q.hasta ? new Date(q.hasta) : undefined,
      });

      return rows.map((r) => {
        const actor = r.actorId as { _id?: { toString(): string }; nombre?: string; email?: string } | null;
        return {
          id: r._id.toString(),
          at: r.at.toISOString(),
          actorTipo: r.actorTipo,
          actorId: actor?._id?.toString?.() ?? (typeof r.actorId === "object" && r.actorId ? String(r.actorId) : undefined),
          actorNombre: actor?.nombre,
          actorEmail: actor?.email,
          casoId: r.casoId?.toString(),
          documentoId: r.documentoId?.toString(),
          proveedor: r.proveedor,
          modelo: r.modelo,
          funcion: r.funcion,
          tokensEntrada: r.tokensEntrada,
          tokensSalida: r.tokensSalida,
          costeUsdEstimado: r.costeUsdEstimado,
          duracionMs: r.duracionMs,
          exito: r.exito,
          error: r.error,
          detalle: r.detalle ?? {},
        };
      });
    }
  );

}

