import { PlanCuentasHistorialModel } from "../models/plan-cuentas-historial.js";



export async function registrarPlanHistorial(input: {

  planCuentasVersionId: string;

  accion:

    | "rubro_creado"

    | "rubro_actualizado"

    | "csv_importado"

    | "solicitud_aprobacion"

    | "version_aprobada"
    | "responsable_asignado";

  actorId?: string;

  motivo?: string;

  payload?: Record<string, unknown>;

}): Promise<void> {

  await PlanCuentasHistorialModel.create({

    planCuentasVersionId: input.planCuentasVersionId,

    accion: input.accion,

    actorId: input.actorId,

    motivo: input.motivo,

    payload: input.payload,

    at: new Date(),

  });

}


