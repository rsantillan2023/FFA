import { reconciliarPreprocessHuerfanos } from "@ffa/db";
import { QUEUE_NAMES, initQueueDispatch, listInlineActiveRuns } from "@ffa/queue";
import { initStorage } from "@ffa/storage";
import { resolveMongoUri } from "@ffa/infra";
import { registerInlinePipelineHandlers } from "./inline-workers.js";
import { initIaLlamadaLogging } from "./ia-log.js";
import { appConfig } from "../config.js";
import { enqueuePreprocess } from "./queues.js";

/** Tras conectar Mongo: limpia preprocesos huérfanos y respeta PREPROCESS_CONCURRENCY. */
export async function reconciliarPreprocessInlineAlArranque(): Promise<void> {
  if (appConfig.infra.queueBackend !== "inline") return;

  const activeIds = new Set(
    listInlineActiveRuns(QUEUE_NAMES.PREPROCESS)
      .map((r) => r.casoId)
      .filter((id): id is string => Boolean(id))
  );
  const reencolados = await reconciliarPreprocessHuerfanos(activeIds, enqueuePreprocess);
  if (reencolados > 0) {
    console.log(
      `[ffa] ${reencolados} caso(s) en preproceso huérfano — devueltos a cola (máx ${process.env.PREPROCESS_CONCURRENCY ?? 3} simultáneos)`
    );
  }
}

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
