/** Id único de job BullMQ; con runId evita colisión al reiniciar a foja cero. */
export function pipelineJobId(kind: string, entityId: string, runId?: string): string {
  return runId ? `${kind}:${entityId}:${runId}` : `${kind}:${entityId}`;
}
