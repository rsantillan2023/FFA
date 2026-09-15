import { randomUUID } from "node:crypto";

/** Id único por corrida de pipeline — evita colisión entre casos reiniciados a la vez. */
export function newPipelineRunId(): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`;
}
