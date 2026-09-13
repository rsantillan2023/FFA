import { AprobacionConfigEstado } from "@ffa/shared";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const aprobacionConfigSchema = new Schema(
  {
    tipo: {
      type: String,
      enum: ["plan_cuentas", "plantilla_informe", "indicadores", "reglas"],
      required: true,
    },
    versionId: { type: Schema.Types.ObjectId, required: true },
    estado: {
      type: String,
      enum: Object.values(AprobacionConfigEstado),
      default: AprobacionConfigEstado.PENDIENTE,
    },
    solicitadoPor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    aprobadoPor: { type: Schema.Types.ObjectId, ref: "User" },
    comentarios: { type: String },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export type AprobacionConfigDocument = InferSchemaType<typeof aprobacionConfigSchema> & {
  _id: Schema.Types.ObjectId;
};

export const AprobacionConfigModel: Model<AprobacionConfigDocument> =
  model<AprobacionConfigDocument>("AprobacionConfig", aprobacionConfigSchema);
