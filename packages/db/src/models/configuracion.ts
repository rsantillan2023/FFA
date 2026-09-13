import { CONFIG_SISTEMA_ID } from "@ffa/shared";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const configuracionSchema = new Schema(
  {
    _id: { type: String, default: CONFIG_SISTEMA_ID },
    umbralConfianza: { type: Number, default: 85, min: 0, max: 100 },
    reintentosMaxPorEtapa: {
      type: Map,
      of: Number,
      default: () =>
        new Map([
          ["preprocess", 3],
          ["extract", 3],
          ["normalize", 2],
          ["classify", 2],
          ["validate", 2],
        ]),
    },
    acuseCorreoTemplate: {
      type: String,
      default:
        "Estimado/a cliente,\n\nConfirmamos la recepción de su documentación financiera.\n\nCaso: {{numero}}\nDocumento: {{documento}}\nEstado inicial: {{estado}}\n\nSaludos cordiales,\nEquipo Factoring — ECR Salud",
    },
    notificacionFalloTemplate: {
      type: String,
      default:
        "Estimado/a cliente,\n\nNo fue posible procesar automáticamente su documento (caso {{numero}}) por calidad insuficiente.\n\nPor favor reenvíe una versión legible o contacte al área.\n\nEquipo Factoring — ECR Salud",
    },
    notificacionRevisionTemplate: {
      type: String,
      default: "Caso {{numero}} requiere revisión del analista. Semáforo: {{semaforo}}.",
    },
    notificacionAnalistas: { type: [String], default: [] },
    notificacionAdmin: { type: [String], default: [] },
    formatosPermitidos: {
      type: [String],
      default: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    },
    retencionDias: { type: Number, default: 2555 },
    extractionProvider: {
      type: String,
      enum: ["openai", "anthropic", "mock"],
      default: "mock",
    },
    planCuentasVigenteId: { type: Schema.Types.ObjectId, ref: "PlanCuentasVersion" },
    reglasVigenteId: { type: Schema.Types.ObjectId, ref: "ReglasClasificacionVersion" },
    indicadoresVigenteId: { type: Schema.Types.ObjectId, ref: "IndicadorDefinicionVersion" },
    plantillaVigenteId: { type: Schema.Types.ObjectId, ref: "PlantillaInformeVersion" },
    emailIngesta: {
      host: String,
      port: Number,
      user: String,
      encryptedPassword: String,
      carpeta: { type: String, default: "INBOX" },
    },
    politicaIlegible: {
      accion: {
        type: String,
        enum: ["pendiente_calidad_remitente", "escalar_analista"],
        default: "pendiente_calidad_remitente",
      },
      maxIntentosCalidad: { type: Number, default: 1, min: 1, max: 5 },
    },
  },
  { timestamps: true }
);

export type ConfiguracionSistemaDocument = InferSchemaType<typeof configuracionSchema>;

export const ConfiguracionSistemaModel: Model<ConfiguracionSistemaDocument> =
  model<ConfiguracionSistemaDocument>("ConfiguracionSistema", configuracionSchema);
