import type { InfraConfig } from "@ffa/infra";
import { readEnvTimeoutMs, withTimeout } from "@ffa/shared";
import { Queue } from "bullmq";
import { enqueueInlineConcurrent, preprocessInlineConcurrency } from "./inline-concurrent.js";
import { QUEUE_NAMES, getRedisConnection } from "./index.js";
import {
  clearInlineActiveRun,
  enqueueInlineSerial,
  setInlineActiveRun,
  shouldRunInlineSerial,
} from "./inline-serial.js";

export interface JobAddOptions {
  jobId?: string;
  attempts?: number;
  backoff?: { type: "exponential"; delay: number };
  removeOnComplete?: number;
  removeOnFail?: number;
}

type InlineHandler = (data: unknown) => Promise<void>;

function inlineHandlerTimeoutMs(queueName: string): number {
  switch (queueName) {
    case "ffa-extract":
      return readEnvTimeoutMs("EXTRACT_JOB_TIMEOUT_MS", 600_000) + 15_000;
    case "ffa-preprocess":
      return readEnvTimeoutMs("PREPROCESS_JOB_TIMEOUT_MS", 180_000);
    default:
      return readEnvTimeoutMs("INLINE_JOB_TIMEOUT_MS", 900_000);
  }
}

let queueBackend: "inline" | "redis" = "redis";
let redisUrl = "redis://localhost:6379";
const redisQueues = new Map<string, Queue>();
const inlineHandlers = new Map<string, InlineHandler>();

export function initQueueDispatch(config: Pick<InfraConfig, "queueBackend" | "redisUrl">): void {
  queueBackend = config.queueBackend;
  redisUrl = config.redisUrl;
}

export function getQueueBackend(): "inline" | "redis" {
  return queueBackend;
}

export function registerInlineHandler(queueName: string, handler: InlineHandler): void {
  inlineHandlers.set(queueName, handler);
}

function getRedisQueue<T>(name: string): Queue<T> {
  let q = redisQueues.get(name) as Queue<T> | undefined;
  if (!q) {
    q = new Queue<T>(name, { connection: getRedisConnection(redisUrl) });
    redisQueues.set(name, q);
  }
  return q;
}

export async function dispatchJob<T>(
  queueName: string,
  jobName: string,
  data: T,
  options: JobAddOptions = {}
): Promise<void> {
  if (queueBackend === "inline") {
    const handler = inlineHandlers.get(queueName);
    if (!handler) {
      throw new Error(
        `QUEUE_BACKEND=inline sin handler registrado para "${queueName}". ` +
          `¿Iniciaste inline-workers en la API?`
      );
    }
    const casoId = (data as { casoId?: string })?.casoId;

    const run = async () => {
      setInlineActiveRun(queueName, casoId);
      const timeoutMs = inlineHandlerTimeoutMs(queueName);
      try {
        await withTimeout(
          handler(data),
          timeoutMs,
          `[inline:${queueName}] tiempo máximo agotado (${Math.round(timeoutMs / 60_000)} min)`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[inline:${queueName}] caso=${casoId ?? "?"} ${msg}`);
      } finally {
        clearInlineActiveRun(queueName, casoId);
      }
    };

    if (shouldRunInlineSerial(queueName)) {
      enqueueInlineSerial(queueName, run);
    } else if (queueName === QUEUE_NAMES.PREPROCESS) {
      enqueueInlineConcurrent(queueName, preprocessInlineConcurrency(), run);
    } else {
      setImmediate(() => {
        void run();
      });
    }
    return;
  }

  await getRedisQueue(queueName).add(jobName, data as never, {
    removeOnComplete: options.removeOnComplete ?? 100,
    removeOnFail: options.removeOnFail ?? 200,
    attempts: options.attempts ?? 3,
    backoff: options.backoff ?? { type: "exponential", delay: 2000 },
    jobId: options.jobId,
  });
}

export async function closeQueueDispatch(): Promise<void> {
  for (const q of redisQueues.values()) {
    await q.close();
  }
  redisQueues.clear();
}
