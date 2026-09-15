import { CasoEstado, CanalRecepcion } from "@ffa/shared";
import { Types } from "mongoose";
import { CasoModel, type CasoDocument } from "../models/caso.js";
import { CasoSecuenciaModel } from "../models/caso-secuencia.js";

const VALID_TRANSITIONS: Record<string, CasoEstado[]> = {
  [CasoEstado.RECIBIDO]: [CasoEstado.EN_COLA, CasoEstado.ERROR, CasoEstado.RECHAZADO, CasoEstado.CANCELADO],
  [CasoEstado.EN_COLA]: [
    CasoEstado.PREPROCESANDO,
    CasoEstado.ERROR,
    CasoEstado.RECHAZADO,
    CasoEstado.PENDIENTE_CALIDAD,
    CasoEstado.CANCELADO,
  ],
  [CasoEstado.PREPROCESANDO]: [
    CasoEstado.EXTRAYENDO,
    CasoEstado.EN_COLA,
    CasoEstado.ERROR,
    CasoEstado.PENDIENTE_CALIDAD,
  ],
  [CasoEstado.EXTRAYENDO]: [
    CasoEstado.NORMALIZANDO,
    CasoEstado.EN_COLA,
    CasoEstado.ERROR,
    CasoEstado.PENDIENTE_CALIDAD,
  ],
  [CasoEstado.NORMALIZANDO]: [CasoEstado.CLASIFICANDO, CasoEstado.EN_COLA, CasoEstado.ERROR],
  [CasoEstado.CLASIFICANDO]: [CasoEstado.VALIDANDO, CasoEstado.EN_COLA, CasoEstado.ERROR],
  [CasoEstado.VALIDANDO]: [
    CasoEstado.EN_REVISION,
    CasoEstado.APROBADO,
    CasoEstado.EN_COLA,
    CasoEstado.ERROR,
  ],
  [CasoEstado.EN_REVISION]: [
    CasoEstado.APROBADO,
    CasoEstado.RECHAZADO,
    CasoEstado.ERROR,
    CasoEstado.EN_COLA,
    CasoEstado.CANCELADO,
    /** O.16 — reclasificar sin re-extracción desde estación de revisión */
    CasoEstado.CLASIFICANDO,
  ],
  [CasoEstado.APROBADO]: [
    CasoEstado.INFORME_GENERADO,
    CasoEstado.EN_REVISION,
    CasoEstado.EN_COLA,
  ],
  [CasoEstado.INFORME_GENERADO]: [CasoEstado.EN_COLA],
  [CasoEstado.PENDIENTE_CALIDAD]: [CasoEstado.EN_COLA, CasoEstado.RECHAZADO, CasoEstado.CANCELADO],
  [CasoEstado.ERROR]: [CasoEstado.EN_COLA, CasoEstado.RECHAZADO],
  [CasoEstado.RECHAZADO]: [CasoEstado.EN_COLA],
  [CasoEstado.CANCELADO]: [CasoEstado.EN_COLA],
  [CasoEstado.ARCHIVADO]: [CasoEstado.EN_COLA],
};

for (const key of Object.keys(VALID_TRANSITIONS)) {
  if (key === CasoEstado.ARCHIVADO) continue;
  const destinos = VALID_TRANSITIONS[key]!;
  if (!destinos.includes(CasoEstado.ARCHIVADO)) {
    destinos.push(CasoEstado.ARCHIVADO);
  }
}

export async function generarNumeroCaso(): Promise<string> {
  const year = new Date().getFullYear();
  const doc = await CasoSecuenciaModel.findOneAndUpdate(
    { _id: String(year) },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  const seq = String(doc!.seq).padStart(5, "0");
  return `FFA-${year}-${seq}`;
}

export async function crearCaso(input: {
  canal: CanalRecepcion;
  contribuyenteId?: string;
  loteId?: string;
  usuarioId?: string;
  observaciones?: string;
  referencia?: string;
}): Promise<CasoDocument> {
  const numero = await generarNumeroCaso();
  const now = new Date();
  return CasoModel.create({
    numero,
    referencia: input.referencia?.trim() || undefined,
    canal: input.canal,
    contribuyenteId: input.contribuyenteId
      ? new Types.ObjectId(input.contribuyenteId)
      : undefined,
    loteId: input.loteId ? new Types.ObjectId(input.loteId) : undefined,
    estado: CasoEstado.RECIBIDO,
    estadoHistorial: [{ estado: CasoEstado.RECIBIDO, at: now, by: input.usuarioId }],
    observaciones: input.observaciones,
  });
}

export async function transicionarCaso(
  casoId: string,
  nuevoEstado: CasoEstado,
  opts?: { by?: string; nota?: string }
): Promise<CasoDocument | null> {
  const caso = await CasoModel.findById(casoId);
  if (!caso) return null;

  const permitidos = VALID_TRANSITIONS[caso.estado] ?? [];
  if (!permitidos.includes(nuevoEstado) && caso.estado !== nuevoEstado) {
    throw new Error(`Transición inválida: ${caso.estado} → ${nuevoEstado}`);
  }

  caso.estado = nuevoEstado;
  if (nuevoEstado === CasoEstado.EN_COLA && !caso.enColaAt) {
    caso.enColaAt = new Date();
  }
  caso.estadoHistorial.push({
    estado: nuevoEstado,
    at: new Date(),
    by: opts?.by ? new Types.ObjectId(opts.by) : undefined,
    nota: opts?.nota,
  });
  await caso.save();
  return caso;
}
