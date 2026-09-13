import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const informeComiteSchema = new Schema(
  {
    fichaId: { type: Schema.Types.ObjectId, ref: "FichaCanonica", required: true, index: true },
    casoId: { type: Schema.Types.ObjectId, ref: "Caso", required: true, index: true },
    plantillaVersionId: {
      type: Schema.Types.ObjectId,
      ref: "PlantillaInformeVersion",
      required: true,
    },
    estado: {
      type: String,
      enum: ["borrador", "preliminar", "final", "archivado"],
      default: "borrador",
    },
    archivadoAt: Date,
    archivadoMotivo: String,
    storageKeyHtml: String,
    storageKeyPdf: String,
    storageKeyDocx: String,
    apartadosManuales: { type: Map, of: String, default: () => new Map() },
    generadoPor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    generadoAt: { type: Date, default: Date.now },
    finalizadoAt: Date,
    fichaVersion: Number,
  },
  { timestamps: true }
);

export type InformeComiteDocument = InferSchemaType<typeof informeComiteSchema> & {
  _id: Schema.Types.ObjectId;
};

export const InformeComiteModel: Model<InformeComiteDocument> = model<InformeComiteDocument>(
  "InformeComite",
  informeComiteSchema
);
