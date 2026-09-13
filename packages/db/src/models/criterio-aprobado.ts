import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const criterioAprobadoSchema = new Schema(
  {
    contribuyenteId: { type: Schema.Types.ObjectId, ref: "Contribuyente", required: true },
    denominacionOrigen: { type: String, required: true, index: true },
    rubroInstitucionalId: {
      type: Schema.Types.ObjectId,
      ref: "RubroInstitucional",
      required: true,
    },
    aprobadoPor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    aprobadoAt: { type: Date, default: Date.now },
    casoOrigenId: { type: Schema.Types.ObjectId, ref: "Caso" },
    activo: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

criterioAprobadoSchema.index({ contribuyenteId: 1, denominacionOrigen: 1 });

export type CriterioAprobadoDocument = InferSchemaType<typeof criterioAprobadoSchema> & {
  _id: Schema.Types.ObjectId;
};

export const CriterioAprobadoModel: Model<CriterioAprobadoDocument> =
  model<CriterioAprobadoDocument>("CriterioAprobado", criterioAprobadoSchema);
