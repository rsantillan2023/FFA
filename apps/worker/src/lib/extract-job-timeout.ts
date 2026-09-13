import { readEnvTimeoutMs } from "@ffa/shared";

/** Tope de duración de un job extract completo (libera la cola inline). */
export function extractJobTimeoutMs(): number {
  return readEnvTimeoutMs("EXTRACT_JOB_TIMEOUT_MS", 600_000);
}
