import type { FastifyInstance } from "fastify";

import { appConfig } from "../config.js";

import { authenticate } from "../plugins/auth.js";

import { lecturaEquipo } from "../plugins/rbac.js";

import {

  verificarPrincipiosFfa,

  verificarReglasTransversales,

} from "../services/reglas-transversales.js";



export async function complianceRoutes(app: FastifyInstance): Promise<void> {

  app.get(

    "/compliance/principios-ffa",

    { preHandler: [authenticate, lecturaEquipo] },

    async () => verificarPrincipiosFfa()

  );



  app.get(

    "/compliance/reglas-transversales",

    { preHandler: [authenticate, lecturaEquipo] },

    async (request) => {

      const casoId = (request.query as { casoId?: string }).casoId;

      return verificarReglasTransversales(casoId);

    }

  );



  app.get(

    "/compliance/despliegue",

    { preHandler: [authenticate, lecturaEquipo] },

    async () => ({
      modo: appConfig.deploymentMode,
      perfil: appConfig.infra.profile,
      storageBackend: appConfig.infra.storageBackend,
      queueBackend: appConfig.infra.queueBackend,
      mailBackend: appConfig.infra.mailBackend,
      mongodbBackend: appConfig.infra.mongodbBackend,
      redisRequired: appConfig.infra.redisRequired,
      descripcion:
        "S.7 — FFA_PROFILE + overrides (STORAGE_BACKEND, QUEUE_BACKEND, MONGODB_BACKEND, MAIL_BACKEND)",
    })

  );

}


