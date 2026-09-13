import {

  AprobacionConfigModel,

  ConfiguracionSistemaModel,

  PlantillaInformeVersionModel,

  type PlantillaInformeVersionDocument,

} from "@ffa/db";

import {

  AprobacionConfigEstado,

  CONFIG_SISTEMA_ID,

  PlanCuentasEstado,

} from "@ffa/shared";

import type { FastifyInstance } from "fastify";

import { Types } from "mongoose";

import { authenticate } from "../plugins/auth.js";

import { adminOrPo, lecturaEquipo } from "../plugins/rbac.js";



function mapPlantilla(doc: PlantillaInformeVersionDocument) {

  return {

    id: doc._id.toString(),

    version: doc.version,

    estado: doc.estado,

    seccionesCount: doc.secciones?.length ?? 0,

    aprobacion: doc.aprobacion

      ? {

          by: doc.aprobacion.by?.toString(),

          at: doc.aprobacion.at?.toISOString(),

          comentario: doc.aprobacion.comentario ?? undefined,

        }

      : undefined,

    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),

  };

}



export async function plantillasRoutes(app: FastifyInstance): Promise<void> {

  app.get(

    "/plantillas/versions",

    { preHandler: [authenticate, lecturaEquipo] },

    async () => {

      const versions = await PlantillaInformeVersionModel.find().sort({ createdAt: -1 });

      return versions.map(mapPlantilla);

    }

  );



  app.post(

    "/plantillas/versions/:id/solicitar-aprobacion",

    { preHandler: [authenticate, adminOrPo] },

    async (request, reply) => {

      const { id } = request.params as { id: string };

      const version = await PlantillaInformeVersionModel.findById(id);

      if (!version) return reply.code(404).send({ error: "Versión no encontrada" });

      if (!version.htmlTemplate?.trim()) {

        return reply.code(400).send({ error: "Plantilla HTML vacía" });

      }



      version.estado = PlanCuentasEstado.PENDIENTE_APROBACION;

      await version.save();



      await AprobacionConfigModel.create({

        tipo: "plantilla_informe",

        versionId: version._id,

        estado: AprobacionConfigEstado.PENDIENTE,

        solicitadoPor: new Types.ObjectId(request.user.id),

      });



      return mapPlantilla(version);

    }

  );



  app.post(

    "/plantillas/versions/:id/aprobar",

    { preHandler: [authenticate, adminOrPo] },

    async (request, reply) => {

      const { id } = request.params as { id: string };

      const body = (request.body ?? {}) as { comentario?: string };

      const version = await PlantillaInformeVersionModel.findById(id);

      if (!version) return reply.code(404).send({ error: "Versión no encontrada" });



      await PlantillaInformeVersionModel.updateMany(

        { _id: { $ne: id }, estado: PlanCuentasEstado.APROBADO },

        { estado: PlanCuentasEstado.OBSOLETO }

      );



      version.estado = PlanCuentasEstado.APROBADO;

      version.aprobacion = {

        by: new Types.ObjectId(request.user.id),

        at: new Date(),

        comentario: body.comentario,

      };

      await version.save();



      await ConfiguracionSistemaModel.findByIdAndUpdate(CONFIG_SISTEMA_ID, {

        plantillaVigenteId: version._id,

      });



      await AprobacionConfigModel.findOneAndUpdate(

        { tipo: "plantilla_informe", versionId: version._id, estado: AprobacionConfigEstado.PENDIENTE },

        {

          estado: AprobacionConfigEstado.APROBADO,

          aprobadoPor: request.user.id,

          at: new Date(),

        }

      );



      return mapPlantilla(version);

    }

  );

}


