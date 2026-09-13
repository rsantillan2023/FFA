import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const casoSecuenciaSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export type CasoSecuenciaDocument = InferSchemaType<typeof casoSecuenciaSchema>;

export const CasoSecuenciaModel: Model<CasoSecuenciaDocument> = model<CasoSecuenciaDocument>(
  "CasoSecuencia",
  casoSecuenciaSchema
);
