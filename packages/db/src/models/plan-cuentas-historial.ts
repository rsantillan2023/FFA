import { Schema, model, type InferSchemaType, type Model } from "mongoose";



const planCuentasHistorialSchema = new Schema(

  {

    planCuentasVersionId: {

      type: Schema.Types.ObjectId,

      ref: "PlanCuentasVersion",

      required: true,

      index: true,

    },

    accion: {

      type: String,

      enum: [

        "rubro_creado",

        "rubro_actualizado",

        "csv_importado",

        "solicitud_aprobacion",

        "version_aprobada",

        "responsable_asignado",

      ],

      required: true,

    },

    actorId: { type: Schema.Types.ObjectId, ref: "User" },

    motivo: { type: String },

    payload: { type: Schema.Types.Mixed },

    at: { type: Date, default: Date.now },

  },

  { timestamps: false }

);



planCuentasHistorialSchema.index({ planCuentasVersionId: 1, at: -1 });



export type PlanCuentasHistorialDocument = InferSchemaType<typeof planCuentasHistorialSchema> & {

  _id: Schema.Types.ObjectId;

};



export const PlanCuentasHistorialModel: Model<PlanCuentasHistorialDocument> =

  model<PlanCuentasHistorialDocument>("PlanCuentasHistorial", planCuentasHistorialSchema);


