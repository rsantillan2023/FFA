import {
  QUEUE_NAMES,
  registerInlineHandler,
  type ClassifyJobData,
  type ExtractJobData,
  type NormalizeJobData,
  type PreprocessJobData,
  type ValidateJobData,
} from "@ffa/queue";
import type { Job } from "bullmq";

type ProcessorFn = (job: Job<never>) => Promise<void>;

function wrap<T extends { casoId?: string }>(fn: ProcessorFn): (data: unknown) => Promise<void> {
  return async (data: unknown) => {
    const payload = data as T;
    const job = {
      data: payload,
      id: `inline-${Date.now()}`,
      attemptsMade: 0,
      log: async (msg: string) => console.log(`[inline] ${msg}`),
    } as unknown as Job<T>;
    try {
      await fn(job as unknown as Job<never>);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (payload.casoId) {
        const { marcarCasoPipelineFallido } = await import("@ffa/db");
        await marcarCasoPipelineFallido(payload.casoId, "inline", msg).catch(() => undefined);
      }
      throw e;
    }
  };
}

export async function registerInlinePipelineHandlers(): Promise<void> {
  const base = new URL("../../../worker/dist/processors/", import.meta.url);
  const [
    { processPreprocess },
    { processExtract },
    { processNormalize },
    { processClassify },
    { processValidate },
  ] = await Promise.all([
    import(new URL("preprocess.js", base).href),
    import(new URL("extract.js", base).href),
    import(new URL("normalize.js", base).href),
    import(new URL("classify.js", base).href),
    import(new URL("validate.js", base).href),
  ]);

  registerInlineHandler(QUEUE_NAMES.PREPROCESS, wrap<PreprocessJobData>(processPreprocess));
  registerInlineHandler(QUEUE_NAMES.EXTRACT, wrap<ExtractJobData>(processExtract));
  registerInlineHandler(QUEUE_NAMES.NORMALIZE, wrap<NormalizeJobData>(processNormalize));
  registerInlineHandler(QUEUE_NAMES.CLASSIFY, wrap<ClassifyJobData>(processClassify));
  registerInlineHandler(QUEUE_NAMES.VALIDATE, wrap<ValidateJobData>(processValidate));
  console.log("[api] Pipeline inline registrado (sin Redis/worker)");
}
