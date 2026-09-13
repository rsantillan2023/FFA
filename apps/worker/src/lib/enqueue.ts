import { ConfiguracionSistemaModel } from "@ffa/db";
import {
  QUEUE_NAMES,
  dispatchJob,
  pipelineJobId,
  type ClassifyJobData,
  type ExtractJobData,
  type NormalizeJobData,
  type PreprocessJobData,
  type ValidateJobData,
} from "@ffa/queue";
import { CONFIG_SISTEMA_ID } from "@ffa/shared";

async function getAttempts(etapa: string): Promise<number> {
  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  const map = config?.reintentosMaxPorEtapa as Map<string, number> | undefined;
  return map?.get(etapa) ?? 3;
}

async function jobOpts(etapa: string) {
  const attempts = await getAttempts(etapa);
  return {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts,
    backoff: { type: "exponential" as const, delay: 2000 },
  };
}

export async function enqueuePreprocess(
  casoId: string,
  documentoId: string,
  runId?: string
): Promise<void> {
  await dispatchJob<PreprocessJobData>(
    QUEUE_NAMES.PREPROCESS,
    "preprocess-document",
    { casoId, documentoId, runId },
    { ...(await jobOpts("preprocess")), jobId: pipelineJobId("preprocess", documentoId, runId) }
  );
}

export async function enqueueExtract(
  casoId: string,
  documentoId: string,
  runId?: string
): Promise<void> {
  await dispatchJob<ExtractJobData>(
    QUEUE_NAMES.EXTRACT,
    "extract-document",
    { casoId, documentoId, runId },
    { ...(await jobOpts("extract")), jobId: pipelineJobId("extract", documentoId, runId) }
  );
}

export async function enqueueNormalize(
  casoId: string,
  documentoId: string,
  runId?: string
): Promise<void> {
  await dispatchJob<NormalizeJobData>(
    QUEUE_NAMES.NORMALIZE,
    "normalize-document",
    { casoId, documentoId, runId },
    { ...(await jobOpts("normalize")), jobId: pipelineJobId("normalize", documentoId, runId) }
  );
}

export async function enqueueClassify(casoId: string, runId?: string): Promise<void> {
  await dispatchJob<ClassifyJobData>(
    QUEUE_NAMES.CLASSIFY,
    "classify-case",
    { casoId, runId },
    { ...(await jobOpts("classify")), jobId: pipelineJobId("classify", casoId, runId) }
  );
}

export async function enqueueValidate(casoId: string, runId?: string): Promise<void> {
  await dispatchJob<ValidateJobData>(
    QUEUE_NAMES.VALIDATE,
    "validate-case",
    { casoId, runId },
    { ...(await jobOpts("validate")), jobId: pipelineJobId("validate", casoId, runId) }
  );
}
