import { AuditoriaEventoModel, ConfiguracionSistemaModel, registrarAuditoria } from "@ffa/db";
import { CONFIG_SISTEMA_ID, type ConfiguracionSistemaDto, type UmbralHistorialDto } from "@ffa/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../plugins/auth.js";
import { adminOrPo, lecturaEquipo } from "../plugins/rbac.js";

const patchConfigSchema = z.object({
  umbralConfianza: z.number().min(0).max(100).optional(),
  extractionProvider: z.enum(["mock", "openai", "anthropic"]).optional(),
  acuseCorreoTemplate: z.string().optional(),
  notificacionFalloTemplate: z.string().optional(),
  notificacionRevisionTemplate: z.string().optional(),
  notificacionAnalistas: z.array(z.string().email()).optional(),
  notificacionAdmin: z.array(z.string().email()).optional(),
  retencionDias: z.number().int().min(30).optional(),
  reintentosMaxPorEtapa: z.record(z.string(), z.number().int().min(0).max(10)).optional(),
  politicaIlegible: z
    .object({
      accion: z.enum(["pendiente_calidad_remitente", "escalar_analista"]),
      maxIntentosCalidad: z.number().int().min(1).max(5).optional(),
    })
    .optional(),
});

function mapConfig(config: {
  umbralConfianza: number;
  formatosPermitidos: string[];
  extractionProvider: "openai" | "anthropic" | "mock";
  planCuentasVigenteId?: { toString(): string } | null;
  reglasVigenteId?: { toString(): string } | null;
  reintentosMaxPorEtapa?: Map<string, number>;
  acuseCorreoTemplate?: string | null;
  notificacionFalloTemplate?: string | null;
  notificacionRevisionTemplate?: string | null;
  notificacionAnalistas?: string[] | null;
  notificacionAdmin?: string[] | null;
  retencionDias?: number | null;
  politicaIlegible?: {
    accion?: "pendiente_calidad_remitente" | "escalar_analista";
    maxIntentosCalidad?: number;
  } | null;
}): ConfiguracionSistemaDto {
  const reintentos: Record<string, number> = {};
  if (config.reintentosMaxPorEtapa) {
    for (const [k, v] of config.reintentosMaxPorEtapa.entries()) {
      reintentos[k] = v;
    }
  }
  return {
    umbralConfianza: config.umbralConfianza,
    formatosPermitidos: config.formatosPermitidos,
    extractionProvider: config.extractionProvider,
    planCuentasVigenteId: config.planCuentasVigenteId?.toString(),
    reglasVigenteId: config.reglasVigenteId?.toString(),
    reintentosMaxPorEtapa: Object.keys(reintentos).length ? reintentos : undefined,
    acuseCorreoTemplate: config.acuseCorreoTemplate ?? undefined,
    notificacionFalloTemplate: config.notificacionFalloTemplate ?? undefined,
    notificacionRevisionTemplate: config.notificacionRevisionTemplate ?? undefined,
    notificacionAnalistas: config.notificacionAnalistas ?? undefined,
    notificacionAdmin: config.notificacionAdmin ?? undefined,
    retencionDias: config.retencionDias ?? undefined,
    politicaIlegible: config.politicaIlegible?.accion
      ? {
          accion: config.politicaIlegible.accion,
          maxIntentosCalidad: config.politicaIlegible.maxIntentosCalidad ?? 1,
        }
      : undefined,
  };
}

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/config",
    { preHandler: [authenticate, lecturaEquipo] },
    async (): Promise<ConfiguracionSistemaDto> => {
      const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
      if (!config) {
        return {
          umbralConfianza: 85,
          formatosPermitidos: ["application/pdf"],
          extractionProvider: "mock",
        };
      }
      return mapConfig(config);
    }
  );

  app.patch(
    "/config",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const parsed = patchConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Config inválida" });
      }

      const update: Record<string, unknown> = { ...parsed.data };
      if (parsed.data.reintentosMaxPorEtapa) {
        update.reintentosMaxPorEtapa = new Map(
          Object.entries(parsed.data.reintentosMaxPorEtapa)
        );
      }

      const config = await ConfiguracionSistemaModel.findByIdAndUpdate(
        CONFIG_SISTEMA_ID,
        update,
        { new: true, upsert: true }
      );

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        entidad: "configuracion_sistema",
        entidadId: CONFIG_SISTEMA_ID,
        accion: "config_actualizada",
        payload: parsed.data as Record<string, unknown>,
      });

      return mapConfig(config!);
    }
  );

  app.get(
    "/config/umbral/historial",
    { preHandler: [authenticate, adminOrPo] },
    async (): Promise<UmbralHistorialDto[]> => {
      const eventos = await AuditoriaEventoModel.find({
        accion: "config_actualizada",
        "payload.umbralConfianza": { $exists: true },
      })
        .sort({ at: -1 })
        .limit(50);

      return eventos.map((e) => ({
        umbralConfianza: Number((e.payload as Record<string, unknown>)?.umbralConfianza ?? 0),
        at: e.at.toISOString(),
        actorId: e.actorId?.toString(),
      }));
    }
  );
}
