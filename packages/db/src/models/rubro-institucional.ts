import { EstadoFinanciero } from "@ffa/shared";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const rubroInstitucionalSchema = new Schema(
  {
    planCuentasVersionId: {
      type: Schema.Types.ObjectId,
      ref: "PlanCuentasVersion",
      required: true,
      index: true,
    },
    codigo: { type: String, required: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    estadoFinanciero: {
      type: String,
      enum: Object.values(EstadoFinanciero),
      required: true,
    },
    corriente: { type: Boolean },
    convencionSigno: {
      type: String,
      enum: ["normal", "invertido"],
      default: "normal",
    },
    padreId: { type: Schema.Types.ObjectId, ref: "RubroInstitucional" },
    orden: { type: Number, default: 0 },
    activo: { type: Boolean, default: true },
    aliases: [{ type: String, trim: true }],
    notaMargen: { type: String },
  },
  { timestamps: true }
);

rubroInstitucionalSchema.index({ planCuentasVersionId: 1, codigo: 1 }, { unique: true });

export type RubroInstitucionalDocument = InferSchemaType<typeof rubroInstitucionalSchema> & {
  _id: Schema.Types.ObjectId;
};

export const RubroInstitucionalModel: Model<RubroInstitucionalDocument> =
  model<RubroInstitucionalDocument>("RubroInstitucional", rubroInstitucionalSchema);
