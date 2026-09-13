import { isDatabaseConnected } from "@ffa/db";
import type { HealthResponse } from "@ffa/shared";
import type { FastifyInstance } from "fastify";
import { appConfig } from "../config.js";
import { isRedisReady } from "../lib/redis-health.js";
import { isStorageReady } from "../lib/storage.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (): Promise<HealthResponse> => {
    const mongodb = isDatabaseConnected();
    return {
      status: mongodb ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: { mongodb },
    };
  });

  app.get("/health/ready", async (_req, reply) => {
    const mongodb = isDatabaseConnected();
    const redis = await isRedisReady();
    const storage = await isStorageReady();

    const ready = mongodb && redis && storage;
    if (!ready) {
      return reply.code(503).send({
        ready: false,
        profile: appConfig.infra.profile,
        mongodb,
        redis,
        storage,
        storageBackend: appConfig.infra.storageBackend,
        queueBackend: appConfig.infra.queueBackend,
      });
    }
    return {
      ready: true,
      profile: appConfig.infra.profile,
      mongodb,
      redis,
      storage,
      storageBackend: appConfig.infra.storageBackend,
      queueBackend: appConfig.infra.queueBackend,
    };
  });

  app.get("/health/infra", async () => ({
    profile: appConfig.infra.profile,
    storageBackend: appConfig.infra.storageBackend,
    queueBackend: appConfig.infra.queueBackend,
    mailBackend: appConfig.infra.mailBackend,
    mongodbBackend: appConfig.infra.mongodbBackend,
    redisRequired: appConfig.infra.redisRequired,
  }));
}
