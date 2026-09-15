import { CanalRecepcion } from "@ffa/shared";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const documentoFuenteSchema = new Schema(
  {
    casoId: { type: Schema.Types.ObjectId, ref: "Caso", required: true, index: true },
    nombreOriginal: { type: String, required: true },
    mimeType: { type: String, required: true },
    storageKey: { type: String, required: true },
    hashSha256: { type: String, required: true, index: true },
    canal: { type: String, enum: Object.values(CanalRecepcion), required: true },
    recepcion: {
      at: { type: Date, default: Date.now },
      remitente: String,
      usuarioId: { type: Schema.Types.ObjectId, ref: "User" },
      asunto: String,
      messageId: String,
    },
    calidadOrigen: {
      type: String,
      enum: ["nativo", "escaneado_legible", "degradado", "ilegible", "pendiente"],
      default: "pendiente",
    },
    paginaCount: { type: Number, default: 0 },
    tamanoBytes: { type: Number, default: 0 },
    preprocessFlags: {
      concatenado: { type: Boolean, default: false },
      incompleto: { type: Boolean, default: false },
      rotacionGrados: { type: Number, default: 0 },
      unidadesDetectadas: { type: Number, default: 1 },
    },
    derivados: {
      miniaturaKey: String,
      paginasNormalizadas: [String],
    },
    /** Snapshot del último preproceso OK — reutilizable en foja cero sin re-renderizar. */
    preprocessCache: {
      hashSha256: String,
      guardadoEn: Date,
      mimeType: String,
      calidadOrigen: String,
      tipoDocumento: String,
      paginaCount: Number,
      preprocessFlags: {
        concatenado: { type: Boolean, default: false },
        incompleto: { type: Boolean, default: false },
        rotacionGrados: { type: Number, default: 0 },
        unidadesDetectadas: { type: Number, default: 1 },
      },
      derivados: {
        miniaturaKey: String,
        paginasNormalizadas: [String],
      },
    },
    tipoDocumento: {
      type: String,
      enum: [
        "balance_8col",
        "balance_clasificado",
        "estado_resultados",
        "ifrs",
        "mixto",
        "desconocido",
      ],
      default: "desconocido",
    },
    procesamiento: {
      etapaActual: String,
      progresoPct: { type: Number, default: 0 },
      ultimoError: String,
      ultimoErrorCodigo: String,
    },
    preprocessLog: [
      {
        at: { type: Date, default: Date.now },
        etapa: String,
        mensaje: String,
      },
    ],
    extractMetadata: {
      razonSocial: String,
      rut: String,
      moneda: String,
      escala: {
        type: String,
        enum: ["unidades", "miles", "millones", "indeterminada"],
      },
      periodo: {
        ejercicio: Number,
        desde: String,
        hasta: String,
      },
    },
    extractNotas: [
      {
        rubroRef: String,
        texto: String,
      },
    ],
    /** Respuesta completa del motor de extracción (IA o mock) para auditoría y revisión. */
    extractPayload: { type: Schema.Types.Mixed },
    /** Transcripción literal por página (texto visible del documento). */
    extractTranscripcion: [
      {
        pagina: { type: Number, required: true },
        texto: { type: String, required: true },
      },
    ],
    normalizeLog: [
      {
        at: { type: Date, default: Date.now },
        etapa: String,
        mensaje: String,
      },
    ],
  },
  { timestamps: true }
);

export type DocumentoFuenteDocument = InferSchemaType<typeof documentoFuenteSchema> & {
  _id: Schema.Types.ObjectId;
};

export const DocumentoFuenteModel: Model<DocumentoFuenteDocument> =
  model<DocumentoFuenteDocument>("DocumentoFuente", documentoFuenteSchema);
