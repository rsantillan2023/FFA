import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const contribuyenteSchema = new Schema(
  {
    rut: { type: String, trim: true, sparse: true, unique: true },
    razonSocial: { type: String, required: true, trim: true },
    denominacionesAlternativas: [{ type: String, trim: true }],
    metadata: { type: Schema.Types.Mixed },
    mergedIntoId: { type: Schema.Types.ObjectId, ref: "Contribuyente" },
  },
  { timestamps: true }
);

contribuyenteSchema.index({ razonSocial: "text", denominacionesAlternativas: "text" });

export type ContribuyenteDocument = InferSchemaType<typeof contribuyenteSchema> & {
  _id: Schema.Types.ObjectId;
};

export const ContribuyenteModel: Model<ContribuyenteDocument> = model<ContribuyenteDocument>(
  "Contribuyente",
  contribuyenteSchema
);
