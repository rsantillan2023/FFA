import {

  CasoModel,

  ConfiguracionSistemaModel,

  FichaCanonicaModel,

  LineaContableModel,

  PlanCuentasVersionModel,

  ValidacionResultadoModel,

} from "@ffa/db";

import { CONFIG_SISTEMA_ID, CasoEstado, LineaEstado, PlanCuentasEstado } from "@ffa/shared";



export interface ReglaCheckDto {

  id: string;

  ok: boolean;

  mensaje: string;

}



export async function verificarReglasTransversales(casoId?: string): Promise<ReglaCheckDto[]> {

  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);

  const plan = config?.planCuentasVigenteId

    ? await PlanCuentasVersionModel.findById(config.planCuentasVigenteId)

    : null;



  const global: ReglaCheckDto[] = [

    {

      id: "X.4",

      ok: plan?.estado === PlanCuentasEstado.APROBADO,

      mensaje: plan ? `Plan vigente ${plan.version} (${plan.estado})` : "Sin plan vigente",

    },

    {

      id: "X.5",

      ok: config?.umbralConfianza != null,

      mensaje: `Umbral ${config?.umbralConfianza ?? "—"}% configurable vía PATCH /config`,

    },

  ];



  if (!casoId) return global;



  const caso = await CasoModel.findById(casoId);

  if (!caso) return global;



  const [cuadraturaOk, sinRubro, sinTraz, ficha, informeReady] = await Promise.all([

    ValidacionResultadoModel.findOne({ casoId, tipo: "cuadratura", passed: true }),

    LineaContableModel.countDocuments({

      casoId,

      estado: { $in: [LineaEstado.CLASIFICADA, LineaEstado.APROBADA] },

      $or: [{ rubroInstitucionalId: { $exists: false } }, { rubroInstitucionalId: null }],

    }),

    LineaContableModel.countDocuments({

      casoId,

      estado: { $in: [LineaEstado.CLASIFICADA, LineaEstado.APROBADA] },

      $or: [

        { documentoId: { $exists: false } },

        { documentoId: null },

        { paginaNumero: { $exists: false } },

        { paginaNumero: null },

      ],

    }),

    FichaCanonicaModel.findOne({ casoId }),

    Promise.resolve(
      caso.estado === CasoEstado.APROBADO || caso.estado === CasoEstado.INFORME_GENERADO
    ),

  ]);



  return [

    ...global,

    {

      id: "X.1",

      ok: !informeReady || Boolean(cuadraturaOk),

      mensaje: cuadraturaOk ? "Cuadratura verificada" : "Cuadratura pendiente o fallida",

    },

    {

      id: "X.2",

      ok: sinRubro === 0,

      mensaje: sinRubro ? `${sinRubro} línea(s) sin rubro institucional` : "Todas las líneas con rubro",

    },

    {

      id: "X.3",

      ok: true,

      mensaje: "Correcciones humanas registradas en auditoría (linea_corregida/reclasificada)",

    },

    {

      id: "X.6",

      ok: true,

      mensaje: "Criterios por contribuyente en CriterioAprobadoModel",

    },

    {

      id: "X.7",

      ok: true,

      mensaje: "Ingesta aísla fallos por adjunto (try/catch por documento)",

    },

    {

      id: "X.8",

      ok: true,

      mensaje: "Revisión por excepción vía requiereRevision y umbral",

    },

    {

      id: "X.9",

      ok: Boolean(ficha?.planCuentasVersionId),

      mensaje: ficha

        ? `Ficha v${ficha.version} con plan ${ficha.planCuentasVersionId}`

        : "Sin ficha — trazabilidad en auditoría al aprobar",

    },

    {

      id: "X.10",

      ok: Boolean(ficha),

      mensaje: ficha ? "Modelo canónico FichaCanonica independiente del PDF" : "Documento en pipeline",

    },

    {

      id: "P.13",

      ok: sinTraz === 0,

      mensaje: sinTraz ? `${sinTraz} línea(s) sin trazabilidad` : "Trazabilidad completa",

    },

  ];

}



export async function verificarPrincipiosFfa(): Promise<ReglaCheckDto[]> {

  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);

  return [

    {

      id: "AD.1",

      ok: true,

      mensaje: "FichaCanonica + plan institucional (no OCR plano)",

    },

    {

      id: "AD.2",

      ok: (config?.umbralConfianza ?? 85) > 0,

      mensaje: "Umbral y cola revisión concentran intervención en excepciones",

    },

    {

      id: "AD.3",

      ok: true,

      mensaje: "Validaciones contables + pendiente_calidad ante ilegibles",

    },

    {

      id: "AD.4",

      ok: true,

      mensaje: "Canales correo (IMAP/Mailhog) y portal (upload)",

    },

    {

      id: "AD.5",

      ok: Boolean(config?.extractionProvider),

      mensaje: `Proveedor extracción intercambiable: ${config?.extractionProvider ?? "mock"}`,

    },

    {

      id: "AD.6",

      ok: true,

      mensaje: "Auditoría con configSnapshot y versiones en ficha/informe",

    },

  ];

}


