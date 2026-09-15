import { preprocessConcurrencyLimit } from "@ffa/shared";

/** Pool con tope de concurrencia para jobs inline (p. ej. preproceso). */

interface ConcurrentPool {
  max: number;
  running: number;
  queue: Array<() => Promise<void>>;
}

const pools = new Map<string, ConcurrentPool>();

export function preprocessInlineConcurrency(): number {
  return preprocessConcurrencyLimit();
}

function getPool(queueName: string, max: number): ConcurrentPool {
  let pool = pools.get(queueName);
  if (!pool) {
    pool = { max, running: 0, queue: [] };
    pools.set(queueName, pool);
  } else {
    pool.max = max;
  }
  return pool;
}

function drainPool(pool: ConcurrentPool): void {
  while (pool.running < pool.max && pool.queue.length > 0) {
    const fn = pool.queue.shift()!;
    pool.running += 1;
    void fn().finally(() => {
      pool.running -= 1;
      drainPool(pool);
    });
  }
}

export function enqueueInlineConcurrent(
  queueName: string,
  max: number,
  fn: () => Promise<void>
): void {
  const pool = getPool(queueName, max);
  pool.queue.push(fn);
  drainPool(pool);
}

export function isInlineConcurrentBusy(queueName: string): boolean {
  const pool = pools.get(queueName);
  if (!pool) return false;
  return pool.running > 0 || pool.queue.length > 0;
}

export function inlineConcurrentStats(queueName: string): {
  running: number;
  queued: number;
  max: number;
} | null {
  const pool = pools.get(queueName);
  if (!pool) return null;
  return { running: pool.running, queued: pool.queue.length, max: pool.max };
}
