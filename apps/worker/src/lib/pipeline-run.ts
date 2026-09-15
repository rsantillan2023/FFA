import { assertPipelineRunVigente as assertDb } from "@ffa/db";

export async function skipSiPipelineObsoleto(
  casoId: string,
  runId: string | undefined,
  log: (msg: string) => unknown
): Promise<boolean> {
  if (await assertDb(casoId, runId)) return false;
  void log(`Job obsoleto — corrida anterior (runId=${runId ?? "?"})`);
  return true;
}
