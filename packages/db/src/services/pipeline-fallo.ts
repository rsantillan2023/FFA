import { CasoEstado } from "@ffa/shared";
import { CasoModel } from "../models/caso.js";
import { DocumentoFuenteModel } from "../models/documento-fuente.js";
import { transicionarCaso } from "./caso-service.js";

const ESTADOS_TERMINALES = new Set<string>([
  CasoEstado.EN_REVISION,
  CasoEstado.APROBADO,
  CasoEstado.INFORME_GENERADO,
  CasoEstado.ERROR,
  CasoEstado.CANCELADO,
]);

/** Marca fallo de pipeline y mueve el caso a error (o pendiente calidad si no aplica). */
export async function marcarCasoPipelineFallido(
  casoId: string,
  etapa: string,
  error: string
): Promise<void> {
  const msg = error.slice(0, 500);
  await DocumentoFuenteModel.updateMany(
    { casoId },
    {
      $set: {
        "procesamiento.etapaActual": etapa,
        "procesamiento.progresoPct": 0,
        "procesamiento.ultimoError": msg,
      },
    }
  );

  const caso = await CasoModel.findById(casoId);
  if (!caso || ESTADOS_TERMINALES.has(caso.estado)) return;

  const nota = `${etapa} falló: ${msg.slice(0, 240)}`;
  try {
    await transicionarCaso(casoId, CasoEstado.ERROR, { nota });
  } catch {
    try {
      await transicionarCaso(casoId, CasoEstado.PENDIENTE_CALIDAD, { nota });
    } catch {
      /* transición no permitida — ya quedó ultimoError en documento */
    }
  }
}
