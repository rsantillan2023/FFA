import { QUEUE_NAMES, getQueueBackend, getRedisConnection } from "@ffa/queue";
import type { QueueStatusDto } from "@ffa/shared";
import { Queue } from "bullmq";
import { appConfig } from "../config.js";

const queueNames = Object.values(QUEUE_NAMES).filter((name) => name !== QUEUE_NAMES.MAIL_INGEST);

export async function getQueuesStatus(): Promise<QueueStatusDto[]> {
  if (getQueueBackend() === "inline") {
    return queueNames.map((name) => ({
      name,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    }));
  }

  const connection = getRedisConnection(appConfig.redisUrl);
  const results: QueueStatusDto[] = [];

  for (const name of queueNames) {
    const queue = new Queue(name, { connection });
    try {
      const counts = await queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed"
      );
      results.push({
        name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      });
    } finally {
      await queue.close();
    }
  }

  return results;
}
