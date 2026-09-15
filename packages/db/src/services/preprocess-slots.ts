import { CasoEstado, preprocessConcurrencyLimit } from "@ffa/shared";
import { Types } from "mongoose";
import { CasoModel } from "../models/caso.js";
import { DocumentoFuenteModel } from "../models/documento-fuente.js";
import { transicionarCaso } from "./caso-service.js";

/** Cuántos casos están en estado preprocesando (excluye opcionalmente el caso actual). */
export async function countCasosPreprocessando(excluirCasoId?: string): Promise<number> {
  const filter: Record<string, unknown> = { estado: CasoEstado.PREPROCESANDO };
  if (excluirCasoId) {
    filter._id = { $ne: new Types.ObjectId(excluirCasoId) };
  }
  return CasoModel.countDocuments(filter);
}

/** ¿Hay slot libre para pasar este caso a preprocesando? */
export async function puedeIniciarPreprocess(casoId: string): Promise<boolean> {
  const ocupados = await countCasosPreprocessando(casoId);
  return ocupados < preprocessConcurrencyLimit();
}

/**
 * Casos marcados preprocesando sin job activo (p. ej. tras reinicio de API).
 * Los devuelve a cola y reencola el preproceso.
 */
export async function reconciliarPreprocessHuerfanos(
  activeCasoIds: ReadonlySet<string>,
  enqueue: (casoId: string, documentoId: string) => Promise<void>
): Promise<number> {
  const casos = await CasoModel.find({ estado: CasoEstado.PREPROCESANDO }).select("_id");
  let reencolados = 0;

  for (const c of casos) {
    const id = c._id.toString();
    if (activeCasoIds.has(id)) continue;

    await transicionarCaso(id, CasoEstado.EN_COLA, {
      nota: "Reencolado — preproceso interrumpido (sin job activo)",
    });

    const doc = await DocumentoFuenteModel.findOne({ casoId: id })
      .sort({ "recepcion.at": 1 })
      .select("_id");
    if (doc) {
      await enqueue(id, doc._id.toString());
    }
    reencolados += 1;
  }

  return reencolados;
}
