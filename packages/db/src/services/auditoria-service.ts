import { Types } from "mongoose";
import { AuditoriaEventoModel } from "../models/auditoria-evento.js";

export async function registrarAuditoria(input: {
  actorTipo: "sistema" | "usuario";
  actorId?: string;
  casoId?: string;
  entidad: string;
  entidadId?: string;
  accion: string;
  payload?: Record<string, unknown>;
  configSnapshot?: {
    planCuentasVersionId?: string;
    reglasVersionId?: string;
    umbral?: number;
  };
}): Promise<void> {
  await AuditoriaEventoModel.create({
    actorTipo: input.actorTipo,
    actorId: input.actorId ? new Types.ObjectId(input.actorId) : undefined,
    casoId: input.casoId ? new Types.ObjectId(input.casoId) : undefined,
    entidad: input.entidad,
    entidadId: input.entidadId ? new Types.ObjectId(input.entidadId) : undefined,
    accion: input.accion,
    payload: input.payload ?? {},
    configSnapshot: input.configSnapshot
      ? {
          planCuentasVersionId: input.configSnapshot.planCuentasVersionId
            ? new Types.ObjectId(input.configSnapshot.planCuentasVersionId)
            : undefined,
          reglasVersionId: input.configSnapshot.reglasVersionId
            ? new Types.ObjectId(input.configSnapshot.reglasVersionId)
            : undefined,
          umbral: input.configSnapshot.umbral,
        }
      : undefined,
  });
}
