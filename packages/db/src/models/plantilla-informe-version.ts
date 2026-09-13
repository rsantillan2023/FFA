import { PlanCuentasEstado } from "@ffa/shared";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const seccionSchema = new Schema(
  {
    id: { type: String, required: true },
    nombre: { type: String, required: true },
    tipo: { type: String, enum: ["fija", "variable", "auto"], required: true },
    placeholder: String,
    obligatorio: { type: Boolean, default: false },
  },
  { _id: false }
);

const plantillaInformeVersionSchema = new Schema(
  {
    version: { type: String, required: true },
    estado: {
      type: String,
      enum: Object.values(PlanCuentasEstado),
      default: PlanCuentasEstado.BORRADOR,
    },
    storageKey: String,
    htmlTemplate: { type: String, required: true },
    secciones: [seccionSchema],
    aprobacion: {
      by: { type: Schema.Types.ObjectId, ref: "User" },
      at: Date,
      comentario: String,
    },
  },
  { timestamps: true }
);

export type PlantillaInformeVersionDocument = InferSchemaType<
  typeof plantillaInformeVersionSchema
> & { _id: Schema.Types.ObjectId };

export const PlantillaInformeVersionModel: Model<PlantillaInformeVersionDocument> =
  model<PlantillaInformeVersionDocument>(
    "PlantillaInformeVersion",
    plantillaInformeVersionSchema
  );
