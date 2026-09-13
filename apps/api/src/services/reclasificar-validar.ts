import {
  CasoModel,
  LineaContableModel,
  ValidacionResultadoModel,
  registrarAuditoria,
  transicionarCaso,
} from "@ffa/db";
import { CasoEstado, LineaEstado } from "@ffa/shared";
import { enqueueClassify } from "../lib/queues.js";

/** O.16 — reclasifica y valida sin repetir extracción. */
export async function reclasificarValidarCaso(casoId: string, userId: string): Promise<void> {
  const caso = await CasoModel.findById(casoId);
  if (!caso) throw new Error("Caso no encontrado");

  const lineas = await LineaContableModel.find({ casoId });
  if (!lineas.length) throw new Error("Caso sin líneas normalizadas");

  for (const linea of lineas) {
    linea.set("rubroInstitucionalId", undefined);
    linea.rubroCodigo = undefined;
    linea.set("clasificacionPropuesta", undefined);
    linea.set("clasificacionFinal", undefined);
    linea.confianzaClasificacion = 0;
    linea.requiereRevision = true;
    linea.origenClasificacion = undefined;
    linea.estado = LineaEstado.NORMALIZADA;
    await linea.save();
  }

  await ValidacionResultadoModel.deleteMany({ casoId });

  await transicionarCaso(casoId, CasoEstado.CLASIFICANDO, {
    by: userId,
    nota: "Reclasificación sin re-extracción (O.16)",
  });

  await enqueueClassify(casoId);

  await registrarAuditoria({
    actorTipo: "usuario",
    actorId: userId,
    casoId,
    entidad: "caso",
    entidadId: casoId,
    accion: "caso_reclasificado_sin_extract",
    payload: { lineasCount: lineas.length },
  });
}
