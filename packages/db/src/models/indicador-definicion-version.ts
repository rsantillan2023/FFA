import { PlanCuentasEstado } from "@ffa/shared";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const indicadorSchema = new Schema(
  {
    codigo: { type: String, required: true },
    nombre: { type: String, required: true },
    categoria: {
      type: String,
      enum: ["liquidez", "endeudamiento", "rentabilidad", "capital_trabajo", "factoring"],
      required: true,
    },
    formula: { type: String, required: true },
    rubrosRequeridos: [String],
    obligatorio: { type: Boolean, default: false },
  },
  { _id: false }
);

const indicadorDefinicionVersionSchema = new Schema(
  {
    version: { type: String, required: true },
    estado: {
      type: String,
      enum: Object.values(PlanCuentasEstado),
      default: PlanCuentasEstado.BORRADOR,
    },
    indicadores: [indicadorSchema],
    aprobacion: {
      by: { type: Schema.Types.ObjectId, ref: "User" },
      at: Date,
      comentario: String,
    },
  },
  { timestamps: true }
);

export type IndicadorDefinicionVersionDocument = InferSchemaType<
  typeof indicadorDefinicionVersionSchema
> & { _id: Schema.Types.ObjectId };

export const IndicadorDefinicionVersionModel: Model<IndicadorDefinicionVersionDocument> =
  model<IndicadorDefinicionVersionDocument>(
    "IndicadorDefinicionVersion",
    indicadorDefinicionVersionSchema
  );
