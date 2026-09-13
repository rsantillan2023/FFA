export const QUEUE_NAMES = {
  PREPROCESS: "ffa-preprocess",
  EXTRACT: "ffa-extract",
  NORMALIZE: "ffa-normalize",
  CLASSIFY: "ffa-classify",
  VALIDATE: "ffa-validate",
  MAIL_INGEST: "ffa-mail-ingest",
} as const;

export interface PipelineJobData {
  casoId: string;
  documentoId: string;
  /** Corrida del pipeline (foja cero) — jobIds únicos en BullMQ. */
  runId?: string;
}

export type PreprocessJobData = PipelineJobData;
export type ExtractJobData = PipelineJobData;
export type NormalizeJobData = PipelineJobData;
export type ClassifyJobData = { casoId: string; runId?: string };
export type ValidateJobData = { casoId: string; runId?: string };

export interface MailIngestJobData {
  mailhogId: string;
}

export function getRedisConnection(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

export {
  initQueueDispatch,
  getQueueBackend,
  registerInlineHandler,
  dispatchJob,
  closeQueueDispatch,
  type JobAddOptions,
} from "./dispatch.js";

export { pipelineJobId } from "./job-id.js";

export {
  getInlineActiveRun,
  isInlineQueueBusy,
  setInlineActiveRun,
  clearInlineActiveRun,
  shouldRunInlineSerial,
  type InlineActiveRun,
} from "./inline-serial.js";
