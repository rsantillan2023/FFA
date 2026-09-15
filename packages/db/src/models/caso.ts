import { CanalRecepcion, CasoEstado } from "@ffa/shared";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const estadoHistorialSchema = new Schema(
  {
    estado: { type: String, enum: Object.values(CasoEstado), required: true },
    at: { type: Date, required: true, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    nota: { type: String },
  },
  { _id: false }
);

const casoSchema = new Schema(
  {
    numero: { type: String, required: true, unique: true },
    referencia: { type: String, trim: true, maxlength: 160 },
    contribuyenteId: { type: Schema.Types.ObjectId, ref: "Contribuyente" },
    loteId: { type: Schema.Types.ObjectId },
    canal: { type: String, enum: Object.values(CanalRecepcion), required: true },
    estado: {
      type: String,
      enum: Object.values(CasoEstado),
      required: true,
      default: CasoEstado.RECIBIDO,
    },
    estadoHistorial: [estadoHistorialSchema],
    periodo: {
      desde: Date,
      hasta: Date,
      ejercicio: Number,
    },
    moneda: { type: String },
    escala: {
      type: String,
      enum: ["unidades", "miles", "millones", "indeterminada"],
    },
    semaforo: { type: String, enum: ["verde", "amarillo", "rojo"] },
    confianzaGlobal: { type: Number, min: 0, max: 100 },
    umbralAplicado: { type: Number },
    planCuentasVersionId: { type: Schema.Types.ObjectId, ref: "PlanCuentasVersion" },
    reglasVersionId: { type: Schema.Types.ObjectId, ref: "ReglasClasificacionVersion" },
    asignadoA: { type: Schema.Types.ObjectId, ref: "User" },
    observaciones: { type: String },
    rechazoMotivo: { type: String },
    version: { type: Number, default: 0 },
    /** Corrida activa del pipeline — invalida jobs encolados antes de foja cero. */
    pipelineRunId: { type: String, trim: true },
    elegibleAutoAprobacion: { type: Boolean, default: false },
    enColaAt: { type: Date },
    procesamientoPausado: { type: Boolean, default: false },
    prioridad: { type: Number, default: 0 },
  },
  { timestamps: true }
);

casoSchema.index({ asignadoA: 1, estado: 1 });

casoSchema.index({ estado: 1, createdAt: -1 });
casoSchema.index({ estado: 1, prioridad: -1, createdAt: 1 });
casoSchema.index({ contribuyenteId: 1, "periodo.ejercicio": -1 });
casoSchema.index({ referencia: 1 });

export type CasoDocument = InferSchemaType<typeof casoSchema> & { _id: Schema.Types.ObjectId };

export const CasoModel: Model<CasoDocument> = model<CasoDocument>("Caso", casoSchema);
