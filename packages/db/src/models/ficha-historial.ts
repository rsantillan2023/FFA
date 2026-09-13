import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const fichaHistorialSchema = new Schema(
  {
    casoId: { type: Schema.Types.ObjectId, ref: "Caso", required: true, index: true },
    version: { type: Number, required: true },
    estado: { type: String, required: true },
    semaforo: String,
    confianzaGlobal: Number,
    aprobadaPor: { type: Schema.Types.ObjectId, ref: "User" },
    aprobadaAt: Date,
    observaciones: String,
  },
  { timestamps: true }
);

fichaHistorialSchema.index({ casoId: 1, version: -1 });

export type FichaHistorialDocument = InferSchemaType<typeof fichaHistorialSchema> & {
  _id: Schema.Types.ObjectId;
};

export const FichaHistorialModel: Model<FichaHistorialDocument> = model<FichaHistorialDocument>(
  "FichaHistorial",
  fichaHistorialSchema
);
