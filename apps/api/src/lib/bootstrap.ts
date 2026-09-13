import { initQueueDispatch } from "@ffa/queue";
import { initStorage } from "@ffa/storage";
import { resolveMongoUri } from "@ffa/infra";
import { registerInlinePipelineHandlers } from "./inline-workers.js";
import { initIaLlamadaLogging } from "./ia-log.js";
import { appConfig } from "../config.js";

export async function bootstrapInfra(): Promise<string> {
  initStorage(appConfig.infra);
  initQueueDispatch(appConfig.infra);
  initIaLlamadaLogging();

  if (appConfig.infra.queueBackend === "inline") {
    await registerInlinePipelineHandlers();
  }

  const mongoUri = await resolveMongoUri(appConfig.infra);
  console.log(
    `[ffa] perfil=${appConfig.infra.profile} storage=${appConfig.infra.storageBackend} ` +
      `queue=${appConfig.infra.queueBackend} mail=${appConfig.infra.mailBackend} mongo=${appConfig.infra.mongodbBackend}`
  );
  return mongoUri;
}
