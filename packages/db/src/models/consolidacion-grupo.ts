import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const consolidacionItemSchema = new Schema(
  {
    fichaId: { type: Schema.Types.ObjectId, required: true },
    casoId: { type: Schema.Types.ObjectId, required: true },
    contribuyenteId: Schema.Types.ObjectId,
    contribuyenteNombre: String,
    ejercicio: Number,
    activoCorriente: Number,
    pasivoCorriente: Number,
    patrimonio: Number,
    utilidad: Number,
    indicadores: { type: Map, of: Number, default: () => new Map() },
  },
  { _id: false }
);

const consolidacionGrupoSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    fichaIds: [{ type: Schema.Types.ObjectId, ref: "FichaCanonica", required: true }],
    planCuentasVersionId: { type: Schema.Types.ObjectId, ref: "PlanCuentasVersion", required: true },
    periodosCount: { type: Number, required: true },
    empresasCount: { type: Number, required: true },
    totales: {
      activoCorriente: { type: Number, default: 0 },
      pasivoCorriente: { type: Number, default: 0 },
      patrimonio: { type: Number, default: 0 },
      utilidad: { type: Number, default: 0 },
    },
    indicadoresAgregados: { type: Map, of: Number, default: () => new Map() },
    items: { type: [consolidacionItemSchema], default: [] },
    creadoPor: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

consolidacionGrupoSchema.index({ createdAt: -1 });
consolidacionGrupoSchema.index({ nombre: 1 });

export type ConsolidacionGrupoDocument = InferSchemaType<typeof consolidacionGrupoSchema> & {
  _id: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ConsolidacionGrupoModel: Model<ConsolidacionGrupoDocument> =
  model<ConsolidacionGrupoDocument>("ConsolidacionGrupo", consolidacionGrupoSchema);
