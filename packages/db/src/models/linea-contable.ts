import { LineaEstado } from "@ffa/shared";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const lineaContableSchema = new Schema(
  {
    casoId: { type: Schema.Types.ObjectId, ref: "Caso", required: true, index: true },
    documentoId: { type: Schema.Types.ObjectId, ref: "DocumentoFuente", required: true },
    paginaNumero: { type: Number, required: true, default: 1 },
    bbox: {
      x: Number,
      y: Number,
      w: Number,
      h: Number,
    },
    lineaEnPagina: Number,
    codigoOrigen: String,
    denominacionOriginal: { type: String, required: true },
    denominacionNormalizada: String,
    columnaOrigen: String,
    montoOriginal: { type: Number, required: true },
    montoNormalizado: Number,
    signoAplicado: { type: String, enum: ["positivo", "negativo"] },
    rubroInstitucionalId: { type: Schema.Types.ObjectId, ref: "RubroInstitucional" },
    rubroCodigo: String,
    clasificacionPropuesta: { type: Schema.Types.ObjectId, ref: "RubroInstitucional" },
    clasificacionFinal: { type: Schema.Types.ObjectId, ref: "RubroInstitucional" },
    confianzaExtraccion: { type: Number, min: 0, max: 100 },
    confianzaClasificacion: { type: Number, min: 0, max: 100 },
    requiereRevision: { type: Boolean, default: false },
    origenClasificacion: {
      type: String,
      enum: ["regla", "semantica", "asistida", "criterio_contribuyente", "manual", "ia_revision"],
    },
    candidatosAsistidos: [
      {
        rubroInstitucionalId: { type: Schema.Types.ObjectId, ref: "RubroInstitucional" },
        codigo: String,
        nombre: String,
        score: Number,
      },
    ],
    estado: {
      type: String,
      enum: Object.values(LineaEstado),
      default: LineaEstado.CRUDA,
    },
  },
  { timestamps: true }
);

lineaContableSchema.index({ casoId: 1, requiereRevision: 1 });
lineaContableSchema.index({ documentoId: 1, paginaNumero: 1 });

export type LineaContableDocument = InferSchemaType<typeof lineaContableSchema> & {
  _id: Schema.Types.ObjectId;
};

export const LineaContableModel: Model<LineaContableDocument> = model<LineaContableDocument>(
  "LineaContable",
  lineaContableSchema
);
