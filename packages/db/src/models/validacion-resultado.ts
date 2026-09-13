import { ValidacionSeveridad, ValidacionTipo } from "@ffa/shared";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const validacionResultadoSchema = new Schema(
  {
    casoId: { type: Schema.Types.ObjectId, ref: "Caso", required: true, index: true },
    tipo: { type: String, enum: Object.values(ValidacionTipo), required: true },
    severidad: {
      type: String,
      enum: Object.values(ValidacionSeveridad),
      required: true,
    },
    passed: { type: Boolean, required: true },
    mensaje: { type: String, required: true },
    lineasInvolucradas: [{ type: Schema.Types.ObjectId, ref: "LineaContable" }],
    metadata: Schema.Types.Mixed,
    confirmadaPorAnalista: Boolean,
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export type ValidacionResultadoDocument = InferSchemaType<typeof validacionResultadoSchema> & {
  _id: Schema.Types.ObjectId;
};

export const ValidacionResultadoModel: Model<ValidacionResultadoDocument> =
  model<ValidacionResultadoDocument>("ValidacionResultado", validacionResultadoSchema);
