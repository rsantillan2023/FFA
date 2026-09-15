import {
  CasoModel,
  DocumentoFuenteModel,
  LineaContableModel,
  ValidacionResultadoModel,
  registrarAuditoria,
  setCasoPipelineRunId,
  transicionarCaso,
} from "@ffa/db";
import { newPipelineRunId } from "@ffa/queue";
import { CasoEstado } from "@ffa/shared";
import { enqueuePreprocess } from "../lib/queues.js";
import { assertFichaEditable } from "./revision.js";

export async function reprocesarCaso(casoId: string, userId: string): Promise<void> {
  const caso = await CasoModel.findById(casoId);
  if (!caso) throw new Error("Caso no encontrado");

  await assertFichaEditable(casoId);

  const docs = await DocumentoFuenteModel.find({ casoId });
  if (!docs.length) throw new Error("Caso sin documentos");

  await LineaContableModel.deleteMany({ casoId });
  await ValidacionResultadoModel.deleteMany({ casoId });

  for (const doc of docs) {
    doc.procesamiento = { etapaActual: "reprocess", progresoPct: 0 };
    await doc.save();
  }

  await transicionarCaso(casoId, CasoEstado.EN_COLA, {
    by: userId,
    nota: "Reprocesamiento forzado por administrador",
  });

  const pipelineRunId = newPipelineRunId();
  await setCasoPipelineRunId(casoId, pipelineRunId);
  for (const doc of docs) {
    await enqueuePreprocess(casoId, doc._id.toString(), pipelineRunId);
  }

  await registrarAuditoria({
    actorTipo: "usuario",
    actorId: userId,
    casoId,
    entidad: "caso",
    entidadId: casoId,
    accion: "caso_reprocesado",
    payload: { documentosCount: docs.length },
  });
}
