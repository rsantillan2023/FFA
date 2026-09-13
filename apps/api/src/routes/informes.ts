import { FichaCanonicaModel, InformeComiteModel, registrarAuditoria } from "@ffa/db";
import type { InformeComiteDto } from "@ffa/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDocumentoBuffer, uploadInformeDocx } from "../lib/storage.js";
import { buildInformeDocx } from "../services/informe-docx.js";
import { finalizarInforme, generarInforme } from "../services/informe.js";
import { authenticate } from "../plugins/auth.js";
import { edicionEquipo, lecturaEquipo } from "../plugins/rbac.js";

const apartadosSchema = z.object({
  apartados: z.record(z.string()),
});

export async function informesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/fichas/:fichaId/informes",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { fichaId } = request.params as { fichaId: string };
      const ficha = await FichaCanonicaModel.findById(fichaId);
      if (!ficha) return reply.code(404).send({ error: "Ficha no encontrada" });

      const result = await generarInforme(fichaId, request.user.id);
      const informe = await InformeComiteModel.findById(result.informeId);
      return reply.code(201).send(mapInforme(informe!));
    }
  );

  app.get(
    "/informes/caso/:casoId",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { casoId } = request.params as { casoId: string };
      const informe = await InformeComiteModel.findOne({
        casoId,
        estado: { $ne: "archivado" },
      }).sort({ createdAt: -1 });
      if (!informe) return reply.code(404).send({ error: "Sin informe" });
      return mapInforme(informe);
    }
  );

  app.patch(
    "/informes/:id/apartados",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = apartadosSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

      const informe = await InformeComiteModel.findById(id);
      if (!informe) return reply.code(404).send({ error: "Informe no encontrado" });

      for (const [key, val] of Object.entries(parsed.data.apartados)) {
        informe.apartadosManuales.set(key, val);
      }
      await informe.save();

      await registrarAuditoria({
        actorTipo: "usuario",
        actorId: request.user.id,
        casoId: informe.casoId.toString(),
        entidad: "informe_comite",
        entidadId: id,
        accion: "informe_apartados_manuales",
        payload: {
          secciones: Object.keys(parsed.data.apartados),
          intervencionHumanaFocalizada: true,
        },
      });

      return mapInforme(informe);
    }
  );

  app.post(
    "/informes/:id/finalizar",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await finalizarInforme(id, request.user.id);
        const informe = await InformeComiteModel.findById(id);
        return mapInforme(informe!);
      } catch (e) {
        return reply.code(400).send({
          error: e instanceof Error ? e.message : "No se pudo finalizar",
        });
      }
    }
  );

  app.get(
    "/informes/:id/download",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const informe = await InformeComiteModel.findById(id);
      if (!informe?.storageKeyHtml) {
        return reply.code(404).send({ error: "Informe sin archivo" });
      }
      const { buffer, contentType } = await getDocumentoBuffer(informe.storageKeyHtml);
      return reply
        .header("Content-Type", contentType)
        .header("Content-Disposition", `inline; filename="informe-${id}.html"`)
        .send(buffer);
    }
  );

  app.post(
    "/informes/:id/export/docx",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const informe = await InformeComiteModel.findById(id);
      if (!informe) return reply.code(404).send({ error: "Informe no encontrado" });

      try {
        const buffer = await buildInformeDocx(id);
        const storageKey = await uploadInformeDocx(
          informe.casoId.toString(),
          id,
          buffer
        );
        informe.storageKeyDocx = storageKey;
        await informe.save();
        return { storageKey, downloadUrl: `/api/v1/informes/${id}/download/docx` };
      } catch (e) {
        return reply.code(400).send({
          error: e instanceof Error ? e.message : "No se pudo exportar Word",
        });
      }
    }
  );

  app.get(
    "/informes/:id/download/docx",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const informe = await InformeComiteModel.findById(id);
      if (!informe?.storageKeyDocx) {
        return reply.code(404).send({ error: "Informe sin archivo Word — genere export primero" });
      }
      const { buffer } = await getDocumentoBuffer(informe.storageKeyDocx);
      return reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        .header("Content-Disposition", `attachment; filename="informe-${id}.docx"`)
        .send(buffer);
    }
  );
}

function mapInforme(informe: {
  _id: { toString(): string };
  fichaId: { toString(): string };
  casoId: { toString(): string };
  estado: string;
  fichaVersion?: number | null;
  generadoAt: Date;
  finalizadoAt?: Date | null;
  apartadosManuales?: Map<string, string>;
  storageKeyDocx?: string | null;
}): InformeComiteDto {
  const apartados: Record<string, string> = {};
  if (informe.apartadosManuales) {
    for (const [k, v] of informe.apartadosManuales.entries()) apartados[k] = v;
  }
  return {
    id: informe._id.toString(),
    fichaId: informe.fichaId.toString(),
    casoId: informe.casoId.toString(),
    estado: informe.estado,
    fichaVersion: informe.fichaVersion ?? 1,
    generadoAt: informe.generadoAt.toISOString(),
    finalizadoAt: informe.finalizadoAt?.toISOString(),
    apartadosManuales: apartados,
    tieneDocx: Boolean(informe.storageKeyDocx),
  };
}
