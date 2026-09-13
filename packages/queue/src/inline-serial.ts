/** Cola serial por nombre — evita N extracciones OpenAI en paralelo en modo inline. */
const tails = new Map<string, Promise<void>>();

const SERIAL_INLINE_QUEUES = new Set([
  "ffa-preprocess",
  "ffa-extract",
  "ffa-normalize",
]);

export interface InlineActiveRun {
  queueName: string;
  casoId?: string;
  startedAt: number;
}

let activeRun: InlineActiveRun | null = null;

export function shouldRunInlineSerial(queueName: string): boolean {
  return SERIAL_INLINE_QUEUES.has(queueName);
}

export function getInlineActiveRun(): InlineActiveRun | null {
  return activeRun;
}

export function isInlineQueueBusy(queueName: string): boolean {
  return tails.has(queueName);
}

export function setInlineActiveRun(queueName: string, casoId?: string): void {
  activeRun = { queueName, casoId, startedAt: Date.now() };
}

export function clearInlineActiveRun(queueName: string, casoId?: string): void {
  if (
    activeRun &&
    activeRun.queueName === queueName &&
    (casoId == null || activeRun.casoId === casoId)
  ) {
    activeRun = null;
  }
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
