import {
  AuditoriaEventoModel,
  CasoModel,
  ConfiguracionSistemaModel,
  ContribuyenteModel,
  DocumentoFuenteModel,
  LineaContableModel,
  RubroInstitucionalModel,
  UserModel,
  ValidacionResultadoModel,
  InformeComiteModel,
  crearCaso,
  registrarAuditoria,
  transicionarCaso,
  type CasoDocument,
  type DocumentoFuenteDocument,
  type LineaContableDocument,
} from "@ffa/db";
import {
  CanalRecepcion,
  CasoEstado,
  LineaEstado,
  CONFIG_SISTEMA_ID,
  type AuditoriaEventoDto,
  resolveIdentidadCaso,
  type CasoContribuyenteResumenDto,
  type CasoDto,
  type DocumentoFuenteDto,
  type IdentidadResuelta,
  type LineaContableDto,
  type ConfianzaResumenDto,
  type ValidacionResultadoDto,
} from "@ffa/shared";
import type { FastifyInstance } from "fastify";
import { Types } from "mongoose";
import { z } from "zod";
import { enqueuePreprocess } from "../lib/queues.js";
import { enviarAcuseRecepcion } from "../lib/mail.js";
import { sha256, uploadDocumento } from "../lib/storage.js";
import { calcularTiemposCaso } from "../services/caso-tiempos.js";
import { reiniciarCasoFojaCero } from "../services/reiniciar-caso.js";
import { reprocesarCaso } from "../services/reprocesar.js";
import { reclasificarValidarCaso } from "../services/reclasificar-validar.js";
import {
  consolidarCasos,
  listarCasosConsolidables,
} from "../services/consolidar-casos.js";
import { getPipelineEtapaDetalle } from "../services/pipeline-etapa-detalle.js";
import { getPipelineEtapas } from "../services/pipeline-etapas.js";
import {
  loadContribuyenteResumen,
  resolveIdentidadParaCaso,
  sanitizarIdentidadDemoEnDocumentos,
} from "../services/caso-identidad.js";
import { buildConfianzaResumen } from "../services/confianza-resumen.js";
import { metadatosVerificadosPorAnalista } from "../services/revision.js";
import { verificarAccesoCaso } from "../lib/acceso-caso.js";
import { authenticate } from "../plugins/auth.js";
import { adminOrPo, edicionEquipo, lecturaEquipo } from "../plugins/rbac.js";

const patchCasoSchema = z
  .object({
    referencia: z.string().trim().min(2).max(160).optional(),
    canal: z
      .enum([CanalRecepcion.CORREO, CanalRecepcion.PORTAL, CanalRecepcion.MANUAL_ALTERNATIVA])
      .optional(),
    observaciones: z.string().max(2000).optional().nullable(),
    prioridad: z.number().int().min(0).max(9).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "Indique al menos un campo para actualizar",
  });

const FORMATOS_PERMITIDOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

async function mapCaso(
  doc: CasoDocument,
  extras?: {
    documentosCount?: number;
    lineasCount?: number;
    asignadoNombre?: string;
    hasInforme?: boolean;
    contribuyente?: CasoContribuyenteResumenDto;
    identidadResuelta?: IdentidadResuelta;
  }
): Promise<CasoDto> {
  return {
    id: doc._id.toString(),
    numero: doc.numero,
    referencia: doc.referencia ?? undefined,
    canal: doc.canal,
    estado: doc.estado,
    contribuyenteId: doc.contribuyenteId?.toString(),
    contribuyente: extras?.contribuyente,
    identidadResuelta: extras?.identidadResuelta,
    asignadoA: doc.asignadoA?.toString(),
    asignadoNombre: extras?.asignadoNombre,
    documentosCount: extras?.documentosCount,
    lineasCount: extras?.lineasCount,
    hasInforme: extras?.hasInforme,
    semaforo: doc.semaforo ?? undefined,
    confianzaGlobal: doc.confianzaGlobal ?? undefined,
    elegibleAutoAprobacion: doc.elegibleAutoAprobacion ?? undefined,
    moneda: doc.moneda ?? undefined,
    escala: doc.escala ?? undefined,
    version: doc.version ?? undefined,
    observaciones: doc.observaciones ?? undefined,
    tiempos: calcularTiemposCaso(doc),
    procesamientoPausado: doc.procesamientoPausado ?? undefined,
    prioridad: doc.prioridad ?? undefined,
    periodoEjercicio: doc.periodo?.ejercicio ?? undefined,
    createdAt: (doc as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: (doc as { updatedAt?: Date }).updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

async function mapLinea(doc: LineaContableDocument): Promise<LineaContableDto> {
  let rubroNombre: string | undefined;
  if (doc.rubroInstitucionalId) {
    const rubro = await RubroInstitucionalModel.findById(doc.rubroInstitucionalId).select("nombre");
    rubroNombre = rubro?.nombre;
  }
  return {
    id: doc._id.toString(),
    casoId: doc.casoId.toString(),
    documentoId: doc.documentoId.toString(),
    paginaNumero: doc.paginaNumero,
    denominacionOriginal: doc.denominacionOriginal,
    denominacionNormalizada: doc.denominacionNormalizada ?? undefined,
    montoOriginal: doc.montoOriginal,
    montoNormalizado: doc.montoNormalizado ?? undefined,
    rubroCodigo: doc.rubroCodigo ?? undefined,
    rubroNombre,
    rubroInstitucionalId: doc.rubroInstitucionalId?.toString(),
    confianzaExtraccion: doc.confianzaExtraccion ?? undefined,
    confianzaClasificacion: doc.confianzaClasificacion ?? undefined,
    requiereRevision: doc.requiereRevision,
    origenClasificacion: doc.origenClasificacion ?? undefined,
    estado: doc.estado,
    bbox:
      doc.bbox?.x != null && doc.bbox?.y != null && doc.bbox?.w != null && doc.bbox?.h != null
        ? { x: doc.bbox.x, y: doc.bbox.y, w: doc.bbox.w, h: doc.bbox.h }
        : undefined,
  };
}

function mapDocumento(doc: DocumentoFuenteDocument): DocumentoFuenteDto {
  const proc = doc.procesamiento;
  return {
    id: doc._id.toString(),
    casoId: doc.casoId.toString(),
    nombreOriginal: doc.nombreOriginal,
    mimeType: doc.mimeType,
    canal: doc.canal,
    calidadOrigen: doc.calidadOrigen,
    paginaCount: doc.paginaCount,
    tamanoBytes: doc.tamanoBytes ?? undefined,
    extractMetadata: doc.extractMetadata
      ? {
          razonSocial: doc.extractMetadata.razonSocial ?? undefined,
          rut: doc.extractMetadata.rut ?? undefined,
          moneda: doc.extractMetadata.moneda ?? undefined,
          escala: doc.extractMetadata.escala ?? undefined,
          periodo: doc.extractMetadata.periodo
            ? { ejercicio: doc.extractMetadata.periodo.ejercicio ?? undefined }
            : undefined,
        }
      : undefined,
    procesamiento: proc
      ? {
          etapaActual: proc.etapaActual ?? undefined,
          progresoPct: proc.progresoPct ?? undefined,
          ultimoError: proc.ultimoError ?? undefined,
          ultimoErrorCodigo: proc.ultimoErrorCodigo ?? undefined,
        }
      : undefined,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function casosRoutes(app: FastifyInstance): Promise<void> {
  await app.register(import("@fastify/multipart"), {
    limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  });

  app.get(
    "/casos",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const query = request.query as {
        estado?: string;
        page?: string;
        limit?: string;
        contribuyenteId?: string;
        asignadoA?: string;
        semaforo?: string;
        colaRevision?: string;
        pendientesAnalista?: string;
        loteId?: string;
        desde?: string;
        hasta?: string;
      };
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
      const filter: Record<string, unknown> = {};
      if (query.pendientesAnalista === "true") {
        filter.estado = CasoEstado.EN_REVISION;
      } else if (query.estado === "sin_error") {
        filter.estado = { $ne: CasoEstado.ERROR };
      } else if (query.estado) {
        filter.estado = query.estado;
      }
      if (query.contribuyenteId) filter.contribuyenteId = query.contribuyenteId;
      if (query.loteId) filter.loteId = query.loteId;
      if (query.asignadoA) filter.asignadoA = query.asignadoA;
      if (query.semaforo) filter.semaforo = query.semaforo;
      if (query.colaRevision === "true") filter.estado = CasoEstado.EN_REVISION;
      if (query.desde || query.hasta) {
        filter.createdAt = {};
        if (query.desde) (filter.createdAt as Record<string, Date>).$gte = new Date(query.desde);
        if (query.hasta) (filter.createdAt as Record<string, Date>).$lte = new Date(query.hasta);
      }

      const sort: Record<string, 1 | -1> =
        query.colaRevision === "true" || query.pendientesAnalista === "true"
          ? { prioridad: -1, createdAt: 1 }
          : { createdAt: -1 };

      const [casos, total] = await Promise.all([
        CasoModel.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
        CasoModel.countDocuments(filter),
      ]);

      const casoIds = casos.map((c) => c._id);
      const [docCounts, lineaCounts, informeCasos] = await Promise.all([
        DocumentoFuenteModel.aggregate<{ _id: unknown; count: number }>([
          { $match: { casoId: { $in: casoIds } } },
          { $group: { _id: "$casoId", count: { $sum: 1 } } },
        ]),
        LineaContableModel.aggregate<{ _id: unknown; count: number }>([
          { $match: { casoId: { $in: casoIds } } },
          { $group: { _id: "$casoId", count: { $sum: 1 } } },
        ]),
        InformeComiteModel.distinct("casoId", {
          casoId: { $in: casoIds },
          estado: { $ne: "archivado" },
        }),
      ]);
      const docMap = new Map(docCounts.map((c) => [String(c._id), c.count]));
      const lineaMap = new Map(lineaCounts.map((c) => [String(c._id), c.count]));
      const informeSet = new Set(informeCasos.map((id) => String(id)));

      const contribuyenteIds = [
        ...new Set(
          casos
            .map((c) => c.contribuyenteId?.toString())
            .filter((id): id is string => Boolean(id))
        ),
      ];

      const [asignados, contribuyentes, documentosMeta] = await Promise.all([
        UserModel.find({
          _id: { $in: casos.map((c) => c.asignadoA).filter(Boolean) },
        }).select("nombre"),
        contribuyenteIds.length
          ? ContribuyenteModel.find({ _id: { $in: contribuyenteIds } }).select("razonSocial rut")
          : [],
        DocumentoFuenteModel.find({ casoId: { $in: casoIds } })
          .select("casoId extractMetadata")
          .sort({ "recepcion.at": 1 }),
      ]);
      const asignadoMap = new Map(asignados.map((u) => [u._id.toString(), u.nombre]));
      const contribuyenteMap = new Map<string, CasoContribuyenteResumenDto>(
        contribuyentes.map((ct) => [
          ct._id.toString(),
          {
            id: ct._id.toString(),
            razonSocial: ct.razonSocial,
            rut: ct.rut ?? undefined,
          },
        ])
      );
      const extractMetaMap = new Map<string, { razonSocial?: string; rut?: string }>();
      for (const doc of documentosMeta) {
        const casoId = doc.casoId.toString();
        if (extractMetaMap.has(casoId)) continue;
        const meta = doc.extractMetadata;
        if (meta?.razonSocial?.trim() || meta?.rut?.trim()) {
          extractMetaMap.set(casoId, {
            razonSocial: meta.razonSocial ?? undefined,
            rut: meta.rut ?? undefined,
          });
        }
      }

      return {
        items: await Promise.all(
          casos.map((c) => {
            const contribuyente = c.contribuyenteId
              ? contribuyenteMap.get(c.contribuyenteId.toString())
              : undefined;
            const extractMeta = extractMetaMap.get(c._id.toString());
            const identidadResuelta = resolveIdentidadCaso({
              extractMetadata: extractMeta,
              contribuyente,
              referencia: c.referencia,
            });
            return mapCaso(c, {
              documentosCount: docMap.get(c._id.toString()) ?? 0,
              lineasCount: lineaMap.get(c._id.toString()) ?? 0,
              hasInforme: informeSet.has(c._id.toString()),
              asignadoNombre: c.asignadoA
                ? asignadoMap.get(c.asignadoA.toString())
                : undefined,
              contribuyente,
              identidadResuelta,
            });
          })
        ),
        total,
        page,
        limit,
      };
    }
  );

  app.patch(
    "/casos/:id/asignar",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { asignadoA?: string | null };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      if (body.asignadoA) {
        const user = await UserModel.findById(body.asignadoA);
        if (!user) return reply.code(400).send({ error: "Analista inválido" });
        caso.set("asignadoA", user._id);
      } else {
        caso.set("asignadoA", undefined);
      }
      await caso.save();

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "caso",
        entidadId: id,
        accion: "caso_asignado",
        payload: { asignadoA: body.asignadoA ?? null },
      });

      return await mapCaso(caso);
    }
  );

  app.post(
    "/casos/:id/pausar",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      caso.procesamientoPausado = true;
      await caso.save();
      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "caso",
        entidadId: id,
        accion: "caso_pausado",
      });
      return await mapCaso(caso);
    }
  );

  app.post(
    "/casos/:id/reanudar",
    { preHandler: [authenticate, adminOrPo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      caso.procesamientoPausado = false;
      await caso.save();
      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "caso",
        entidadId: id,
        accion: "caso_reanudado",
      });
      return await mapCaso(caso);
    }
  );

  app.patch(
    "/casos/:id/prioridad",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { prioridad?: number };
      if (body.prioridad == null) return reply.code(400).send({ error: "prioridad requerida" });
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      caso.prioridad = body.prioridad;
      await caso.save();
      return await mapCaso(caso);
    }
  );

  app.get(
    "/casos/:id/pipeline-etapas",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      return getPipelineEtapas(id);
    }
  );

  app.get(
    "/casos/:id/pipeline-etapas/detalle",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { etapaId } = request.query as { etapaId?: string };
      if (!etapaId?.trim()) {
        return reply.code(400).send({ error: "etapaId requerido" });
      }
      if (!(await verificarAccesoCaso(request, reply, id))) return;
      const detalle = await getPipelineEtapaDetalle(id, etapaId.trim());
      if (!detalle) return reply.code(404).send({ error: "Etapa no encontrada" });
      return detalle;
    }
  );

  app.patch(
    "/casos/:id/contribuyente",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { contribuyenteId?: string };
      if (!body.contribuyenteId) {
        return reply.code(400).send({ error: "contribuyenteId requerido" });
      }
      const contrib = await ContribuyenteModel.findById(body.contribuyenteId);
      if (!contrib) return reply.code(400).send({ error: "Contribuyente inválido" });
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      caso.set("contribuyenteId", contrib._id);
      await caso.save();
      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "caso",
        entidadId: id,
        accion: "contribuyente_asignado_manual",
        payload: { contribuyenteId: body.contribuyenteId },
      });
      return await mapCaso(caso);
    }
  );

  app.post(
    "/casos/:id/cancelar",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { motivo?: string };
      try {
        const caso = await transicionarCaso(id, CasoEstado.CANCELADO, {
          by: request.user.id,
          nota: body.motivo ?? "Cancelado por analista (AC.5)",
        });
        if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
        await registrarAuditoria({
          actorTipo: "usuario",
          actorId: request.user.id,
          casoId: id,
          entidad: "caso",
          entidadId: id,
          accion: "caso_cancelado",
          payload: { motivo: body.motivo },
        });
        return await mapCaso(caso);
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : "Error" });
      }
    }
  );

  app.post(
    "/casos/:id/reabrir",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      if (caso.estado !== CasoEstado.RECHAZADO && caso.estado !== CasoEstado.CANCELADO) {
        return reply.code(400).send({ error: "Solo casos rechazados o cancelados" });
      }
      try {
        await transicionarCaso(id, CasoEstado.EN_COLA, {
          by: request.user.id,
          nota: "Reabierto para reprocesamiento (AC.6)",
        });
        const docs = await DocumentoFuenteModel.find({ casoId: id });
        for (const doc of docs) {
          await enqueuePreprocess(id, doc._id.toString());
        }
        await registrarAuditoria({
          actorTipo: "usuario",
          actorId: request.user.id,
          casoId: id,
          entidad: "caso",
          entidadId: id,
          accion: "caso_reabierto",
        });
        const updated = await CasoModel.findById(id);
        return await mapCaso(updated!);
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : "Error" });
      }
    }
  );

  app.get(
    "/casos/:id/consolidables",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request) => {
      const { id } = request.params as { id: string };
      return listarCasosConsolidables(id);
    }
  );

  app.post(
    "/casos/:id/consolidar",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { casoOrigenId?: string };
      if (!body.casoOrigenId) {
        return reply.code(400).send({ error: "casoOrigenId requerido" });
      }
      try {
        const result = await consolidarCasos(id, body.casoOrigenId, request.user.id);
        const caso = await CasoModel.findById(id);
        return { ...result, caso: caso ? await mapCaso(caso) : undefined };
      } catch (e) {
        return reply
          .code(400)
          .send({ error: e instanceof Error ? e.message : "Error al consolidar" });
      }
    }
  );

  app.post(
    "/casos/:id/reclasificar-validar",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await reclasificarValidarCaso(id, request.user.id);
        const caso = await CasoModel.findById(id);
        return caso ? await mapCaso(caso) : { ok: true };
      } catch (e) {
        return reply.code(400).send({
          error: e instanceof Error ? e.message : "No se pudo reclasificar",
        });
      }
    }
  );

  app.post(
    "/casos/:id/reiniciar-foja-cero",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { motivo?: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      try {
        const result = await reiniciarCasoFojaCero(id, request.user.id, body.motivo);
        const updated = await CasoModel.findById(id);
        return {
          ...result,
          caso: updated ? await mapCaso(updated) : undefined,
        };
      } catch (e) {
        return reply.code(400).send({
          error: e instanceof Error ? e.message : "No se pudo reiniciar el caso",
        });
      }
    }
  );

  app.post(
    "/casos/:id/devolver-reprocesamiento",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      if (
        caso.estado !== CasoEstado.EN_REVISION &&
        caso.estado !== CasoEstado.PENDIENTE_CALIDAD
      ) {
        return reply.code(400).send({ error: "Estado no permite reprocesamiento" });
      }
      try {
        await reprocesarCaso(id, request.user.id);
        const updated = await CasoModel.findById(id);
        return updated ? await mapCaso(updated) : { ok: true };
      } catch (e) {
        return reply.code(400).send({
          error: e instanceof Error ? e.message : "No se pudo reprocesar",
        });
      }
    }
  );

  app.patch(
    "/casos/:id/validaciones/:validacionId/confirmar",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id, validacionId } = request.params as { id: string; validacionId: string };
      const body = request.body as { confirmada: boolean };
      const val = await ValidacionResultadoModel.findOne({ _id: validacionId, casoId: id });
      if (!val) return reply.code(404).send({ error: "Validación no encontrada" });

      val.confirmadaPorAnalista = body.confirmada;
      await val.save();

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "validaciones_resultado",
        entidadId: validacionId,
        accion: body.confirmada ? "validacion_confirmada" : "validacion_rechazada",
        payload: { tipo: val.tipo, mensaje: val.mensaje },
      });

      return {
        id: val._id.toString(),
        confirmadaPorAnalista: val.confirmadaPorAnalista,
      };
    }
  );

  app.patch(
    "/casos/:id",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = patchCasoSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      }

      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      const payload: Record<string, unknown> = {};
      if (parsed.data.referencia !== undefined) {
        caso.referencia = parsed.data.referencia;
        payload.referencia = parsed.data.referencia;
      }
      if (parsed.data.canal !== undefined) {
        caso.canal = parsed.data.canal;
        payload.canal = parsed.data.canal;
      }
      if (parsed.data.observaciones !== undefined) {
        caso.observaciones = parsed.data.observaciones ?? undefined;
        payload.observaciones = parsed.data.observaciones;
      }
      if (parsed.data.prioridad !== undefined) {
        caso.prioridad = parsed.data.prioridad;
        payload.prioridad = parsed.data.prioridad;
      }

      await caso.save();

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: id,
        entidad: "caso",
        entidadId: id,
        accion: "caso_actualizado",
        payload,
      });

      return await mapCaso(caso);
    }
  );

  app.get(
    "/casos/:id",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await verificarAccesoCaso(request, reply, id))) return;
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      const [documentos, lineasCount, validaciones, hasInforme, metadatosVerificados] =
        await Promise.all([
          DocumentoFuenteModel.find({ casoId: id }),
          LineaContableModel.countDocuments({ casoId: id }),
          ValidacionResultadoModel.find({ casoId: id }).sort({ at: -1 }),
          InformeComiteModel.exists({ casoId: id, estado: { $ne: "archivado" } }).then(Boolean),
          metadatosVerificadosPorAnalista(id),
        ]);

      const contribuyente = await loadContribuyenteResumen(caso.contribuyenteId?.toString());
      const identidadResuelta = await resolveIdentidadParaCaso(caso);
      await sanitizarIdentidadDemoEnDocumentos(documentos, identidadResuelta);

      const base = await mapCaso(caso, {
        documentosCount: documentos.length,
        lineasCount,
        hasInforme,
      });
      return {
        ...base,
        contribuyente,
        identidadResuelta,
        metadatosVerificados,
        version: caso.version ?? 0,
        observaciones: caso.observaciones,
        estadoHistorial: caso.estadoHistorial.map((h) => ({
          estado: h.estado,
          at: h.at.toISOString(),
          nota: h.nota,
        })),
        documentos: documentos.map(mapDocumento),
        validaciones: validaciones.map((v) => ({
          id: v._id.toString(),
          casoId: v.casoId.toString(),
          tipo: v.tipo,
          severidad: v.severidad,
          passed: v.passed,
          mensaje: v.mensaje,
          at: v.at.toISOString(),
          confirmadaPorAnalista: v.confirmadaPorAnalista ?? undefined,
        })),
      };
    }
  );

  app.get(
    "/casos/:id/confianza-resumen",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await verificarAccesoCaso(request, reply, id))) return;
      const resumen = await buildConfianzaResumen(id);
      if (!resumen) return reply.code(404).send({ error: "Caso no encontrado" });
      return resumen satisfies ConfianzaResumenDto;
    }
  );

  app.get(
    "/casos/:id/lineas",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      const query = request.query as { soloRevision?: string };
      const filter: Record<string, unknown> = { casoId: id };
      if (query.soloRevision === "true") {
        filter.requiereRevision = true;
        filter.estado = { $ne: LineaEstado.APROBADA };
      }

      const lineas = await LineaContableModel.find(filter).sort({
        paginaNumero: 1,
        denominacionOriginal: 1,
      });
      return Promise.all(lineas.map(mapLinea));
    }
  );

  app.get(
    "/casos/:id/validaciones",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      const items = await ValidacionResultadoModel.find({ casoId: id }).sort({ at: -1 });
      return items.map(
        (v): ValidacionResultadoDto => ({
          id: v._id.toString(),
          casoId: v.casoId.toString(),
          tipo: v.tipo,
          severidad: v.severidad,
          passed: v.passed,
          mensaje: v.mensaje,
          at: v.at.toISOString(),
        })
      );
    }
  );

  app.get(
    "/casos/:id/validaciones/export",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = request.query as { format?: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      const items = await ValidacionResultadoModel.find({ casoId: id }).sort({ tipo: 1 });
      const rows = items.map((v) => ({
        tipo: v.tipo,
        severidad: v.severidad,
        passed: v.passed,
        mensaje: v.mensaje,
        at: v.at.toISOString(),
        metadata: v.metadata ?? {},
      }));

      if (query.format === "csv") {
        const header = "tipo,severidad,passed,mensaje,at\n";
        const body = rows
          .map(
            (r) =>
              `"${r.tipo}","${r.severidad}",${r.passed},"${r.mensaje.replace(/"/g, '""')}","${r.at}"`
          )
          .join("\n");
        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header(
          "Content-Disposition",
          `attachment; filename="validaciones-${caso.numero}.csv"`
        );
        return header + body;
      }

      reply.header("Content-Type", "application/json");
      reply.header(
        "Content-Disposition",
        `attachment; filename="validaciones-${caso.numero}.json"`
      );
      return {
        casoNumero: caso.numero,
        exportadoAt: new Date().toISOString(),
        validaciones: rows,
      };
    }
  );

  app.get(
    "/casos/:id/auditoria",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      const eventos = await AuditoriaEventoModel.find({ casoId: id }).sort({ at: -1 }).limit(100);
      return eventos.map(
        (e): AuditoriaEventoDto => ({
          id: e._id.toString(),
          at: e.at.toISOString(),
          actorTipo: e.actorTipo,
          casoId: e.casoId?.toString(),
          entidad: e.entidad,
          accion: e.accion,
          payload: (e.payload as Record<string, unknown>) ?? {},
        })
      );
    }
  );

  app.get(
    "/casos/:id/auditoria/export",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = request.query as { format?: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });

      const [eventos, lineas, validaciones, documentos] = await Promise.all([
        AuditoriaEventoModel.find({ casoId: id }).sort({ at: 1 }),
        LineaContableModel.find({ casoId: id }),
        ValidacionResultadoModel.find({ casoId: id }),
        DocumentoFuenteModel.find({ casoId: id }),
      ]);

      const bundle = {
        caso: {
          id: caso._id.toString(),
          numero: caso.numero,
          estado: caso.estado,
          canal: caso.canal,
          semaforo: caso.semaforo,
          createdAt:
            (caso as { createdAt?: Date }).createdAt?.toISOString() ?? null,
          updatedAt:
            (caso as { updatedAt?: Date }).updatedAt?.toISOString() ?? null,
        },
        documentos: documentos.map((d) => ({
          id: d._id.toString(),
          nombre: d.nombreOriginal,
          hashSha256: d.hashSha256,
          tipoDocumento: d.tipoDocumento,
        })),
        lineas: lineas.map((l) => ({
          id: l._id.toString(),
          denominacion: l.denominacionOriginal,
          monto: l.montoNormalizado ?? l.montoOriginal,
          pagina: l.paginaNumero,
          rubro: l.rubroCodigo,
          confianza: l.confianzaClasificacion,
        })),
        validaciones: validaciones.map((v) => ({
          tipo: v.tipo,
          passed: v.passed,
          mensaje: v.mensaje,
          at: v.at.toISOString(),
        })),
        auditoria: eventos.map((e) => ({
          at: e.at.toISOString(),
          actorTipo: e.actorTipo,
          actorId: e.actorId?.toString(),
          entidad: e.entidad,
          accion: e.accion,
          payload: e.payload ?? {},
          configSnapshot: e.configSnapshot ?? undefined,
        })),
        exportadoAt: new Date().toISOString(),
      };

      if (query.format === "csv") {
        const header = "at,actorTipo,entidad,accion\n";
        const body = bundle.auditoria
          .map(
            (e) =>
              `"${e.at}","${e.actorTipo}","${e.entidad}","${e.accion.replace(/"/g, '""')}"`
          )
          .join("\n");
        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header(
          "Content-Disposition",
          `attachment; filename="trazabilidad-${caso.numero}.csv"`
        );
        return header + body;
      }

      reply.header("Content-Type", "application/json");
      reply.header(
        "Content-Disposition",
        `attachment; filename="trazabilidad-${caso.numero}.json"`
      );
      return bundle;
    }
  );

  app.post(
    "/casos/:id/iniciar-carga-manual",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const caso = await CasoModel.findById(id);
      if (!caso) return reply.code(404).send({ error: "Caso no encontrado" });
      if (caso.estado !== CasoEstado.PENDIENTE_CALIDAD) {
        return reply.code(400).send({ error: "Solo casos pendiente_calidad" });
      }

      await transicionarCaso(id, CasoEstado.EN_REVISION, {
        by: request.user.id,
        nota: "Carga manual alternativa iniciada (B.16)",
      });

      const updated = await CasoModel.findById(id);
      return await mapCaso(updated ?? caso, {});
    }
  );

  app.post(
    "/casos/upload",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
      const formatos = new Set(config?.formatosPermitidos ?? [...FORMATOS_PERMITIDOS]);

      const parts = request.parts();
      let contribuyenteId: string | undefined;
      let remitenteEmail: string | undefined;
      let referenciaBase = "";
      const files: { filename: string; mimetype: string; buffer: Buffer }[] = [];

      for await (const part of parts) {
        if (part.type === "field") {
          if (part.fieldname === "contribuyenteId") contribuyenteId = String(part.value);
          if (part.fieldname === "remitenteEmail") remitenteEmail = String(part.value);
          if (part.fieldname === "referencia") referenciaBase = String(part.value).trim();
        } else if (part.type === "file") {
          const buffer = await part.toBuffer();
          files.push({
            filename: part.filename,
            mimetype: part.mimetype,
            buffer,
          });
        }
      }

      if (files.length === 0) {
        return reply.code(400).send({ error: "Se requiere al menos un archivo" });
      }
      if (!referenciaBase) {
        return reply.code(400).send({ error: "Indique un nombre de referencia para la ficha" });
      }

      const loteId = new Types.ObjectId();
      const casosCreados: CasoDto[] = [];

      const referenciaParaArchivo = (filename: string): string => {
        if (files.length === 1) return referenciaBase;
        const base = filename.replace(/\.[^.]+$/, "");
        return `${referenciaBase} · ${base}`;
      };

      for (const file of files) {
        if (!formatos.has(file.mimetype)) {
          return reply.code(400).send({
            error: `Formato no soportado: ${file.mimetype}`,
          });
        }

        const caso = await crearCaso({
          canal: CanalRecepcion.PORTAL,
          contribuyenteId,
          loteId: loteId.toString(),
          usuarioId: request.user.id,
          referencia: referenciaParaArchivo(file.filename),
        });

        const hash = sha256(file.buffer);
        const dup = await DocumentoFuenteModel.findOne({ hashSha256: hash }).limit(1);
        if (dup) {
          await transicionarCaso(caso._id.toString(), CasoEstado.ERROR, {
            nota: "Documento duplicado detectado",
          });
          casosCreados.push(await mapCaso(caso, { documentosCount: 0 }));
          continue;
        }

        const documento = await DocumentoFuenteModel.create({
          casoId: caso._id,
          nombreOriginal: file.filename,
          mimeType: file.mimetype,
          storageKey: "pending",
          hashSha256: hash,
          canal: CanalRecepcion.PORTAL,
          recepcion: {
            at: new Date(),
            usuarioId: new Types.ObjectId(request.user.id),
          },
          calidadOrigen: "pendiente",
        });

        const storageKey = await uploadDocumento(
          caso._id.toString(),
          documento._id.toString(),
          file.filename,
          file.buffer,
          file.mimetype
        );
        documento.storageKey = storageKey;
        documento.tamanoBytes = file.buffer.length;
        await documento.save();

        await transicionarCaso(caso._id.toString(), CasoEstado.EN_COLA, {
          by: request.user.id,
          nota: "Encolado para preprocesamiento",
        });

        await enqueuePreprocess(caso._id.toString(), documento._id.toString());

        if (remitenteEmail) {
          await enviarAcuseRecepcion({
            destinatario: remitenteEmail,
            casoNumero: caso.numero,
            casoId: caso._id.toString(),
            template: config?.acuseCorreoTemplate,
            documentoNombre: file.filename,
            estadoInicial: "recibido",
          });
        }

        casosCreados.push(await mapCaso(caso, { documentosCount: 1 }));
      }

      return reply.code(201).send({ casos: casosCreados, loteId: loteId.toString() });
    }
  );
}
