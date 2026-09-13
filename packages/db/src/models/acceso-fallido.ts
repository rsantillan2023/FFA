import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const accesoFallidoSchema = new Schema(
  {
    email: { type: String, required: true, index: true },
    ip: String,
    userAgent: String,
    motivo: { type: String, default: "credenciales_invalidas" },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

export type AccesoFallidoDocument = InferSchemaType<typeof accesoFallidoSchema> & {
  _id: Schema.Types.ObjectId;
};

export const AccesoFallidoModel: Model<AccesoFallidoDocument> = model<AccesoFallidoDocument>(
  "AccesoFallido",
  accesoFallidoSchema
);
