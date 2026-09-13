import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const notificacionLogSchema = new Schema(
  {
    tipo: {
      type: String,
      enum: ["acuse", "fallo_calidad", "revision_requerida", "aprobacion_auto", "error_critico"],
      required: true,
    },
    destinatario: { type: String, required: true },
    casoId: { type: Schema.Types.ObjectId, ref: "Caso" },
    enviadoAt: { type: Date, default: Date.now },
    estado: { type: String, enum: ["enviado", "fallido"], default: "enviado" },
    error: String,
    asunto: String,
  },
  { timestamps: true }
);

export type NotificacionLogDocument = InferSchemaType<typeof notificacionLogSchema> & {
  _id: Schema.Types.ObjectId;
};

export const NotificacionLogModel: Model<NotificacionLogDocument> = model<NotificacionLogDocument>(
  "NotificacionLog",
  notificacionLogSchema
);
