import { ConfiguracionSistemaModel } from "@ffa/db";
import {
  QUEUE_NAMES,
  dispatchJob,
  pipelineJobId,
  type ClassifyJobData,
  type ExtractJobData,
  type PreprocessJobData,
} from "@ffa/queue";
import { CONFIG_SISTEMA_ID } from "@ffa/shared";
import { appConfig } from "../config.js";

async function getAttempts(etapa: string): Promise<number> {
  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  const map = config?.reintentosMaxPorEtapa as Map<string, number> | undefined;
  return map?.get(etapa) ?? 3;
}

export async function enqueuePreprocess(
  casoId: string,
  documentoId: string,
  runId?: string
): Promise<void> {
  const attempts = await getAttempts("preprocess");
  await dispatchJob<PreprocessJobData>(
    QUEUE_NAMES.PREPROCESS,
    "preprocess-document",
    { casoId, documentoId, runId },
    {
      jobId: pipelineJobId("preprocess", documentoId, runId),
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts,
      backoff: { type: "exponential", delay: 2000 },
    }
  );
}

export async function enqueueExtract(
  casoId: string,
  documentoId: string,
  runId?: string
): Promise<void> {
  const attempts = await getAttempts("extract");
  await dispatchJob<ExtractJobData>(
    QUEUE_NAMES.EXTRACT,
    "extract-document",
    { casoId, documentoId, runId },
    {
      jobId: pipelineJobId("extract", documentoId, runId),
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts,
      backoff: { type: "exponential", delay: 2000 },
    }
  );
}

export async function enqueueClassify(casoId: string): Promise<void> {
  const attempts = await getAttempts("classify");
  await dispatchJob<ClassifyJobData>(
    QUEUE_NAMES.CLASSIFY,
    "classify-case",
    { casoId },
    {
      jobId: `classify:${casoId}:${Date.now()}`,
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts,
      backoff: { type: "exponential", delay: 2000 },
    }
  );
}

export function isQueueInline(): boolean {
  return appConfig.infra.queueBackend === "inline";
}
