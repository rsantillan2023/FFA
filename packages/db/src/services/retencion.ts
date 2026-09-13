import { CONFIG_SISTEMA_ID, CasoEstado } from "@ffa/shared";

import { CasoModel } from "../models/caso.js";

import { ConfiguracionSistemaModel } from "../models/configuracion.js";

import { ContribuyenteModel } from "../models/contribuyente.js";

import { DocumentoFuenteModel } from "../models/documento-fuente.js";

import { registrarAuditoria } from "./auditoria-service.js";



export async function ejecutarPurgaRetencion(): Promise<{ purgados: number }> {

  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);

  const dias = config?.retencionDias ?? 2555;

  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);



  const casos = await CasoModel.find({

    createdAt: { $lt: limite },

    estado: { $in: [CasoEstado.RECHAZADO, CasoEstado.CANCELADO, CasoEstado.ERROR] },

  }).limit(100);



  let purgados = 0;

  for (const caso of casos) {

    const contribId = caso.contribuyenteId?.toString();

    caso.observaciones = undefined;

    caso.set("contribuyenteId", undefined);

    await caso.save();



    await DocumentoFuenteModel.updateMany(

      { casoId: caso._id },

      { $unset: { "recepcion.remitente": "" } }

    );



    if (contribId) {

      const otros = await CasoModel.countDocuments({ contribuyenteId: contribId });

      if (otros === 0) {

        await ContribuyenteModel.findByIdAndUpdate(contribId, {

          $set: { razonSocial: "ANONIMIZADO" },

          $unset: { rut: "", denominacionesAlternativas: "" },

        });

      }

    }



    await registrarAuditoria({

      actorTipo: "sistema",

      casoId: caso._id.toString(),

      entidad: "caso",

      entidadId: caso._id.toString(),

      accion: "retencion_anonimizado",

      payload: { retencionDias: dias, limite: limite.toISOString() },

    });

    purgados++;

  }



  return { purgados };

}


