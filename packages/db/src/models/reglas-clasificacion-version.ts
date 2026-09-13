import { PlanCuentasEstado } from "@ffa/shared";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const reglaClasificacionSchema = new Schema(
  {
    id: { type: String, required: true },
    prioridad: { type: Number, required: true },
    tipo: {
      type: String,
      enum: ["patron_denominacion", "codigo_origen", "regex", "contribuyente"],
      required: true,
    },
    contribuyenteId: { type: Schema.Types.ObjectId, ref: "Contribuyente" },
    patron: { type: String, required: true },
    rubroInstitucionalId: {
      type: Schema.Types.ObjectId,
      ref: "RubroInstitucional",
      required: true,
    },
    activa: { type: Boolean, default: true },
  },
  { _id: false }
);

const reglasClasificacionVersionSchema = new Schema(
  {
    version: { type: String, required: true },
    estado: {
      type: String,
      enum: Object.values(PlanCuentasEstado),
      default: PlanCuentasEstado.BORRADOR,
    },
    aprobacion: {
      by: { type: Schema.Types.ObjectId, ref: "User" },
      at: Date,
      comentario: String,
    },
    reglas: [reglaClasificacionSchema],
  },
  { timestamps: true }
);

export type ReglasClasificacionVersionDocument = InferSchemaType<
  typeof reglasClasificacionVersionSchema
> & { _id: Schema.Types.ObjectId };

export const ReglasClasificacionVersionModel: Model<ReglasClasificacionVersionDocument> =
  model<ReglasClasificacionVersionDocument>(
    "ReglasClasificacionVersion",
    reglasClasificacionVersionSchema
  );
