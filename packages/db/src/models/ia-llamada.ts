import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const iaLlamadaSchema = new Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    actorTipo: { type: String, enum: ["sistema", "usuario"], required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    casoId: { type: Schema.Types.ObjectId, ref: "Caso", index: true },
    documentoId: { type: Schema.Types.ObjectId, ref: "DocumentoFuente" },
    proveedor: { type: String, enum: ["openai", "anthropic"], required: true, index: true },
    modelo: { type: String, required: true },
    funcion: { type: String, required: true, index: true },
    tokensEntrada: { type: Number, default: 0 },
    tokensSalida: { type: Number, default: 0 },
    costeUsdEstimado: { type: Number, default: 0 },
    duracionMs: { type: Number },
    exito: { type: Boolean, default: true },
    error: { type: String },
    detalle: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: false }
);

iaLlamadaSchema.index({ at: -1, proveedor: 1 });
iaLlamadaSchema.index({ casoId: 1, at: -1 });

export type IaLlamadaDocument = InferSchemaType<typeof iaLlamadaSchema> & {
  _id: Schema.Types.ObjectId;
};

export const IaLlamadaModel: Model<IaLlamadaDocument> = model<IaLlamadaDocument>(
  "IaLlamada",
  iaLlamadaSchema
);
