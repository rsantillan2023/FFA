import { CasoModel } from "../models/caso.js";

/** Registra la corrida vigente del pipeline (foja cero / carga nueva). */
export async function setCasoPipelineRunId(casoId: string, runId: string): Promise<void> {
  await CasoModel.findByIdAndUpdate(casoId, { $set: { pipelineRunId: runId } });
}

/**
 * ¿Sigue vigente este job? Evita que colas inline obsoletas pisen un caso en validación/reinicio.
 * - Sin runId en el job: solo válido si el caso tampoco tiene pipelineRunId (legacy).
 * - Con pipelineRunId en caso: el job debe coincidir.
 */
export async function assertPipelineRunVigente(
  casoId: string,
  runId?: string
): Promise<boolean> {
  const caso = await CasoModel.findById(casoId).select("pipelineRunId numero");
  if (!caso) return false;

  const vigente = (caso as { pipelineRunId?: string }).pipelineRunId;
  if (!vigente) return true;
  if (!runId) return false;
  return vigente === runId;
}
