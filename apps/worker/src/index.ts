import { connectDatabase } from "@ffa/db";
import {
  QUEUE_NAMES,
  getRedisConnection,
  initQueueDispatch,
  type ClassifyJobData,
  type ExtractJobData,
  type NormalizeJobData,
  type PreprocessJobData,
  type ValidateJobData,
} from "@ffa/queue";
import { initStorage } from "@ffa/storage";
import { resolveMongoUri } from "@ffa/infra";
import { preprocessConcurrencyLimit } from "@ffa/shared";
import { Worker } from "bullmq";
import { workerConfig } from "./config.js";
import { pollMailhogIngest } from "./processors/mailhog-ingest.js";
import { pollImapIngest } from "./lib/imap-ingest.js";
import { notificarErrorCritico } from "./lib/notificaciones.js";
import { processClassify } from "./processors/classify.js";
import { processExtract } from "./processors/extract.js";
import { processNormalize } from "./processors/normalize.js";
import { processPreprocess } from "./processors/preprocess.js";
import { initIaLlamadaLogging } from "./lib/ia-log.js";
import { processValidate } from "./processors/validate.js";

async function startRedisWorkers(): Promise<void> {
  const connection = getRedisConnection(workerConfig.redisUrl);
  const sharedOpts = { connection, concurrency: 3 };
  const preprocessWorkers = preprocessConcurrencyLimit();

  const workers = [
    new Worker<PreprocessJobData>(QUEUE_NAMES.PREPROCESS, processPreprocess, {
      connection,
      concurrency: preprocessWorkers,
    }),
    new Worker<ExtractJobData>(QUEUE_NAMES.EXTRACT, processExtract, {
      connection,
      concurrency: 1,
    }),
    new Worker<NormalizeJobData>(QUEUE_NAMES.NORMALIZE, processNormalize, sharedOpts),
    new Worker<ClassifyJobData>(QUEUE_NAMES.CLASSIFY, processClassify, sharedOpts),
    new Worker<ValidateJobData>(QUEUE_NAMES.VALIDATE, processValidate, sharedOpts),
  ];

  for (const w of workers) {
    w.on("completed", (job) => console.log(`[${job.queueName}] completed ${job.id}`));
    w.on("failed", async (job, err) => {
      console.error(`[${job?.queueName}] failed ${job?.id}:`, err.message);
      const casoId =
        job?.data && typeof job.data === "object" && "casoId" in job.data
          ? String((job.data as { casoId: string }).casoId)
          : undefined;
      if (casoId) {
        const { CasoModel, transicionarCaso } = await import("@ffa/db");
        const { CasoEstado } = await import("@ffa/shared");
        const caso = await CasoModel.findById(casoId);
        if (caso) {
          await transicionarCaso(casoId, CasoEstado.ERROR, { nota: err.message });
          await notificarErrorCritico({
            casoNumero: caso.numero,
            casoId,
            error: err.message,
          });
        }
      }
    });
  }

  console.log(
    `[worker] BullMQ activo (preprocess×${preprocessWorkers}→extract×1→normalize→classify→validate)`
  );
}

function startMailPoll(): void {
  setInterval(async () => {
    let nMail = 0;
    let nImap = 0;
    if (workerConfig.infra.mailBackend === "mailhog") {
      nMail = await pollMailhogIngest();
    }
    if (workerConfig.infra.mailBackend === "imap") {
      nImap = await pollImapIngest();
    }
    const n = nMail + nImap;
    if (n > 0) console.log(`[ingesta] ${n} documento(s) (mailhog=${nMail}, imap=${nImap})`);
  }, workerConfig.mailPollIntervalMs);

  void (async () => {
    if (workerConfig.infra.mailBackend === "mailhog") await pollMailhogIngest();
    if (workerConfig.infra.mailBackend === "imap") await pollImapIngest();
  })();

  console.log(`[worker] Ingesta correo activa (${workerConfig.infra.mailBackend})`);
}

async function main(): Promise<void> {
  initStorage(workerConfig.infra);
  initQueueDispatch(workerConfig.infra);

  const mongoUri = await resolveMongoUri(workerConfig.infra);
  await connectDatabase(mongoUri);
  initIaLlamadaLogging();

  const { queueBackend, mailBackend } = workerConfig.infra;

  if (queueBackend === "redis") {
    await startRedisWorkers();
  } else {
    console.log("[worker] QUEUE_BACKEND=inline — pipeline corre en la API; worker solo ingesta/retención");
  }

  if (mailBackend === "mailhog" || mailBackend === "imap") {
    startMailPoll();
  } else if (queueBackend === "inline") {
    console.log("[worker] MAIL_BACKEND=off — no hace falta este proceso. Usá solo API + Web.");
    return;
  }

  const { ejecutarPurgaRetencion } = await import("./lib/retencion.js");
  const DAY_MS = 24 * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      const r = await ejecutarPurgaRetencion();
      if (r.purgados > 0) console.log(`[retencion] ${r.purgados} caso(s) anonimizado(s)`);
    } catch (e) {
      console.error("[retencion] error:", e instanceof Error ? e.message : e);
    }
  }, DAY_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
