import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const indicadorCalculadoSchema = new Schema(
  {
    fichaId: { type: Schema.Types.ObjectId, ref: "FichaCanonica", required: true, index: true },
    indicadorCodigo: { type: String, required: true },
    definicionVersionId: {
      type: Schema.Types.ObjectId,
      ref: "IndicadorDefinicionVersion",
      required: true,
    },
    valor: Number,
    calculable: { type: Boolean, required: true },
    error: String,
    lineasParticipantes: [{ type: Schema.Types.ObjectId, ref: "LineaContable" }],
    calculadoAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

indicadorCalculadoSchema.index({ fichaId: 1, indicadorCodigo: 1 });

export type IndicadorCalculadoDocument = InferSchemaType<typeof indicadorCalculadoSchema> & {
  _id: Schema.Types.ObjectId;
};

export const IndicadorCalculadoModel: Model<IndicadorCalculadoDocument> =
  model<IndicadorCalculadoDocument>("IndicadorCalculado", indicadorCalculadoSchema);
