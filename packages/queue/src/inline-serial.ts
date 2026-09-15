import { isInlineConcurrentBusy } from "./inline-concurrent.js";

/** Cola serial por nombre — evita N extracciones OpenAI en paralelo en modo inline. */
const tails = new Map<string, Promise<void>>();

/** Preproceso usa pool concurrente (PREPROCESS_CONCURRENCY); extract/normalize siguen en serie. */
const SERIAL_INLINE_QUEUES = new Set([
  "ffa-extract",
  "ffa-normalize",
  "ffa-classify",
  "ffa-validate",
]);

export interface InlineActiveRun {
  queueName: string;
  casoId?: string;
  startedAt: number;
}

const activeRuns = new Map<string, InlineActiveRun>();

export function shouldRunInlineSerial(queueName: string): boolean {
  return SERIAL_INLINE_QUEUES.has(queueName);
}

function activeRunKey(queueName: string, casoId?: string): string {
  return `${queueName}:${casoId ?? "_"}`;
}

export function getInlineActiveRun(): InlineActiveRun | null {
  const all = [...activeRuns.values()];
  if (!all.length) return null;
  return all.sort((a, b) => b.startedAt - a.startedAt)[0]!;
}

export function getInlineActiveRunForCaso(casoId: string): InlineActiveRun | null {
  for (const run of activeRuns.values()) {
    if (run.casoId === casoId) return run;
  }
  return null;
}

export function countInlineActiveRuns(queueName?: string): number {
  const all = [...activeRuns.values()];
  if (!queueName) return all.length;
  return all.filter((r) => r.queueName === queueName).length;
}

export function listInlineActiveRuns(queueName?: string): InlineActiveRun[] {
  const all = [...activeRuns.values()];
  if (!queueName) return all;
  return all.filter((r) => r.queueName === queueName);
}

export function isInlineQueueBusy(queueName: string): boolean {
  return tails.has(queueName) || isInlineConcurrentBusy(queueName);
}

export function setInlineActiveRun(queueName: string, casoId?: string): void {
  activeRuns.set(activeRunKey(queueName, casoId), {
    queueName,
    casoId,
    startedAt: Date.now(),
  });
}

export function clearInlineActiveRun(queueName: string, casoId?: string): void {
  activeRuns.delete(activeRunKey(queueName, casoId));
}

export function enqueueInlineSerial(queueName: string, fn: () => Promise<void>): void {
  const prev = tails.get(queueName) ?? Promise.resolve();
  const next = prev
    .then(fn)
    .catch((err: unknown) => {
      console.error(
        `[inline:${queueName}]`,
        err instanceof Error ? err.message : err
      );
    })
    .finally(() => {
      if (tails.get(queueName) === next) tails.delete(queueName);
    });
  tails.set(queueName, next);
}
