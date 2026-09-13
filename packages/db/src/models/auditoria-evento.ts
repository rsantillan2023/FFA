import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const auditoriaEventoSchema = new Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    actorTipo: { type: String, enum: ["sistema", "usuario"], required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    casoId: { type: Schema.Types.ObjectId, ref: "Caso", index: true },
    entidad: { type: String, required: true },
    entidadId: Schema.Types.ObjectId,
    accion: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    configSnapshot: {
      planCuentasVersionId: Schema.Types.ObjectId,
      reglasVersionId: Schema.Types.ObjectId,
      umbral: Number,
    },
  },
  { timestamps: false }
);

auditoriaEventoSchema.index({ casoId: 1, at: -1 });

export type AuditoriaEventoDocument = InferSchemaType<typeof auditoriaEventoSchema> & {
  _id: Schema.Types.ObjectId;
};

export const AuditoriaEventoModel: Model<AuditoriaEventoDocument> = model<AuditoriaEventoDocument>(
  "AuditoriaEvento",
  auditoriaEventoSchema
);
