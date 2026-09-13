import { PlanCuentasEstado } from "@ffa/shared";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const aprobacionSchema = new Schema(
  {
    by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, required: true },
    comentario: { type: String },
  },
  { _id: false }
);

const planCuentasVersionSchema = new Schema(
  {
    version: { type: String, required: true, trim: true },
    estado: {
      type: String,
      enum: Object.values(PlanCuentasEstado),
      default: PlanCuentasEstado.BORRADOR,
    },
    aprobacion: aprobacionSchema,
    notas: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    responsableId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

planCuentasVersionSchema.index({ version: 1 }, { unique: true });

export type PlanCuentasVersionDocument = InferSchemaType<typeof planCuentasVersionSchema> & {
  _id: Schema.Types.ObjectId;
};

export const PlanCuentasVersionModel: Model<PlanCuentasVersionDocument> =
  model<PlanCuentasVersionDocument>("PlanCuentasVersion", planCuentasVersionSchema);
