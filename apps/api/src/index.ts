import { UserModel, connectDatabase } from "@ffa/db";
import fastifyCors from "@fastify/cors";
import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import { appConfig } from "./config.js";
import { bootstrapInfra, reconciliarPreprocessInlineAlArranque } from "./lib/bootstrap.js";
import { registerAuth } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { configRoutes } from "./routes/config.js";
import { contribuyentesRoutes } from "./routes/contribuyentes.js";
import { healthRoutes } from "./routes/health.js";
import { casosRoutes } from "./routes/casos.js";
import { casosRevisionRoutes } from "./routes/casos-revision.js";
import { fichasRoutes } from "./routes/fichas.js";
import { informesRoutes } from "./routes/informes.js";
import { kpisRoutes } from "./routes/kpis.js";
import { buscarRoutes } from "./routes/buscar.js";
import { ingestaRoutes } from "./routes/ingesta.js";
import { repositorioRoutes } from "./routes/repositorio.js";
import { comparacionRoutes } from "./routes/comparacion.js";
import { consolidacionRoutes } from "./routes/consolidacion.js";
import { criteriosRoutes } from "./routes/criterios.js";
import { casosProgresoRoutes } from "./routes/casos-progreso.js";
import { adminRoutes } from "./routes/admin.js";
import { usersRoutes } from "./routes/users.js";
import { reglasRoutes } from "./routes/reglas.js";
import { notificacionesRoutes } from "./routes/notificaciones.js";
import { planCuentasRoutes } from "./routes/plan-cuentas.js";
import { plantillasRoutes } from "./routes/plantillas.js";
import { indicadoresAdminRoutes } from "./routes/indicadores-admin.js";
import { complianceRoutes } from "./routes/compliance.js";
import { runSeed } from "./seed.js";
import { initIaLlamadaLogging } from "./lib/ia-log.js";
import { syncExtractionProviderFromEnv } from "./services/sync-extraction-config.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    if (appConfig.nodeEnv === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  });

  await app.register(fastifyCors, {
    origin: appConfig.corsOrigin,
    credentials: true,
  });

  await registerAuth(app, appConfig.jwtSecret);

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/api/v1" });
  await app.register(configRoutes, { prefix: "/api/v1" });
  await app.register(planCuentasRoutes, { prefix: "/api/v1" });
  await app.register(plantillasRoutes, { prefix: "/api/v1" });
  await app.register(indicadoresAdminRoutes, { prefix: "/api/v1" });
  await app.register(contribuyentesRoutes, { prefix: "/api/v1" });
  await app.register(casosRoutes, { prefix: "/api/v1" });
  await app.register(casosRevisionRoutes, { prefix: "/api/v1" });
  await app.register(fichasRoutes, { prefix: "/api/v1" });
  await app.register(informesRoutes, { prefix: "/api/v1" });
  await app.register(repositorioRoutes, { prefix: "/api/v1" });
  await app.register(comparacionRoutes, { prefix: "/api/v1" });
  await app.register(consolidacionRoutes, { prefix: "/api/v1" });
  await app.register(criteriosRoutes, { prefix: "/api/v1" });
  await app.register(casosProgresoRoutes, { prefix: "/api/v1" });
  await app.register(adminRoutes, { prefix: "/api/v1" });
  await app.register(usersRoutes, { prefix: "/api/v1" });
  await app.register(reglasRoutes, { prefix: "/api/v1" });
  await app.register(notificacionesRoutes, { prefix: "/api/v1" });
  await app.register(kpisRoutes, { prefix: "/api/v1" });
  await app.register(buscarRoutes, { prefix: "/api/v1" });
  await app.register(ingestaRoutes, { prefix: "/api/v1" });
  await app.register(complianceRoutes, { prefix: "/api/v1" });

  app.get("/", async () => ({ name: "SOOFT FINYX API", version: "0.1.0" }));

  return app;
}

async function main(): Promise<void> {
  const mongoUri = await bootstrapInfra();
  await connectDatabase(mongoUri);
  await reconciliarPreprocessInlineAlArranque();
  initIaLlamadaLogging();
  await syncExtractionProviderFromEnv();

  if (appConfig.infra.mongodbBackend === "memory") {
    const users = await UserModel.countDocuments();
    if (users === 0) {
      console.log("[ffa] Mongo en memoria vacío — seed automático");
      await runSeed({ skipBootstrap: true, teardown: false });
    }
  }

  const app = await buildApp();
  await app.listen({ host: appConfig.host, port: appConfig.port });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
