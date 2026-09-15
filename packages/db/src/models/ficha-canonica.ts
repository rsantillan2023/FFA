import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const detalleRubroSchema = new Schema(
  {
    rubroId: { type: Schema.Types.ObjectId, ref: "RubroInstitucional", required: true },
    codigo: { type: String, required: true },
    monto: { type: Number, required: true },
    lineasIds: [{ type: Schema.Types.ObjectId, ref: "LineaContable" }],
  },
  { _id: false }
);

const fichaCanonicaSchema = new Schema(
  {
    casoId: { type: Schema.Types.ObjectId, ref: "Caso", required: true, unique: true },
    contribuyenteId: { type: Schema.Types.ObjectId, ref: "Contribuyente" },
    version: { type: Number, default: 1 },
    estado: {
      type: String,
      enum: ["borrador", "en_revision", "aprobada", "rechazada"],
      default: "borrador",
    },
    planCuentasVersionId: {
      type: Schema.Types.ObjectId,
      ref: "PlanCuentasVersion",
      required: true,
    },
    balance: {
      activoCorriente: Number,
      activoNoCorriente: Number,
      pasivoCorriente: Number,
      pasivoNoCorriente: Number,
      patrimonio: Number,
      detalle: [detalleRubroSchema],
    },
    estadoResultados: {
      utilidad: Number,
      detalle: [detalleRubroSchema],
    },
    validacionesResumen: {
      cuadraturaOk: Boolean,
      semaforo: { type: String, enum: ["verde", "amarillo", "rojo"] },
      trazabilidadCompleta: Boolean,
    },
    aprobadaPor: { type: Schema.Types.ObjectId, ref: "User" },
    aprobadaAt: Date,
    observaciones: String,
    cierreParcial: { type: Boolean, default: false },
    motivoCierreParcial: String,
  },
  { timestamps: true }
);

export type FichaCanonicaDocument = InferSchemaType<typeof fichaCanonicaSchema> & {
  _id: Schema.Types.ObjectId;
};

export const FichaCanonicaModel: Model<FichaCanonicaDocument> = model<FichaCanonicaDocument>(
  "FichaCanonica",
  fichaCanonicaSchema
);
