import {

  CasoModel,

  DocumentoFuenteModel,

  LineaContableModel,

  registrarAuditoria,

  transicionarCaso,

} from "@ffa/db";

import { CasoEstado } from "@ffa/shared";

import { enqueuePreprocess } from "../lib/queues.js";

import { assertFichaEditable } from "./revision.js";



const ESTADOS_CONSOLIDABLES = new Set<string>([

  CasoEstado.RECIBIDO,

  CasoEstado.EN_COLA,

  CasoEstado.PREPROCESANDO,

  CasoEstado.EXTRAYENDO,

  CasoEstado.NORMALIZANDO,

  CasoEstado.CLASIFICANDO,

  CasoEstado.VALIDANDO,

  CasoEstado.EN_REVISION,

  CasoEstado.PENDIENTE_CALIDAD,

]);



export async function listarCasosConsolidables(casoId: string): Promise<

  Array<{ id: string; numero: string; estado: string; documentosCount: number }>

> {

  const caso = await CasoModel.findById(casoId);

  if (!caso?.contribuyenteId) return [];



  const ejercicio = caso.periodo?.ejercicio;

  const filter: Record<string, unknown> = {

    _id: { $ne: caso._id },

    contribuyenteId: caso.contribuyenteId,

    estado: { $in: [...ESTADOS_CONSOLIDABLES] },

  };

  if (ejercicio != null) {

    filter["periodo.ejercicio"] = ejercicio;

  }



  const casos = await CasoModel.find(filter).sort({ createdAt: -1 }).limit(20);

  const counts = await DocumentoFuenteModel.aggregate<{ _id: unknown; count: number }>([

    { $match: { casoId: { $in: casos.map((c) => c._id) } } },

    { $group: { _id: "$casoId", count: { $sum: 1 } } },

  ]);

  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));



  return casos.map((c) => ({

    id: c._id.toString(),

    numero: c.numero,

    estado: c.estado,

    documentosCount: countMap.get(c._id.toString()) ?? 0,

  }));

}



export async function consolidarCasos(

  destinoId: string,

  origenId: string,

  userId: string

): Promise<{ documentosMovidos: number; lineasMovidas: number }> {

  if (destinoId === origenId) {

    throw new Error("No puede consolidar un caso consigo mismo");

  }



  const [destino, origen] = await Promise.all([

    CasoModel.findById(destinoId),

    CasoModel.findById(origenId),

  ]);

  if (!destino) throw new Error("Caso destino no encontrado");

  if (!origen) throw new Error("Caso origen no encontrado");



  if (destino.contribuyenteId?.toString() !== origen.contribuyenteId?.toString()) {

    throw new Error("Los casos deben ser del mismo contribuyente");

  }

  const ejDest = destino.periodo?.ejercicio;

  const ejOrig = origen.periodo?.ejercicio;

  if (ejDest != null && ejOrig != null && ejDest !== ejOrig) {

    throw new Error("Los casos deben corresponder al mismo ejercicio");

  }



  await assertFichaEditable(destinoId);



  const docsOrigen = await DocumentoFuenteModel.find({ casoId: origenId });

  if (!docsOrigen.length) {

    throw new Error("El caso origen no tiene documentos");

  }



  const docRes = await DocumentoFuenteModel.updateMany(

    { casoId: origenId },

    { $set: { casoId: destino._id } }

  );

  const lineaRes = await LineaContableModel.updateMany(

    { casoId: origenId },

    { $set: { casoId: destino._id } }

  );



  await transicionarCaso(origenId, CasoEstado.RECHAZADO, {

    by: userId,

    nota: `Consolidado en caso ${destino.numero} (K.13)`,

  });



  destino.observaciones = [

    destino.observaciones,

    `Consolidados ${docsOrigen.length} documento(s) del caso ${origen.numero}`,

  ]

    .filter(Boolean)

    .join(" · ");

  await destino.save();



  const docsDestino = await DocumentoFuenteModel.find({ casoId: destinoId });

  for (const doc of docsDestino) {

    doc.procesamiento = { etapaActual: "consolidar", progresoPct: 0 };

    await doc.save();

    await enqueuePreprocess(destinoId, doc._id.toString());

  }



  await transicionarCaso(destinoId, CasoEstado.EN_COLA, {

    by: userId,

    nota: `Consolidación desde caso ${origen.numero}`,

  });



  await registrarAuditoria({

    actorTipo: "usuario",

    actorId: userId,

    casoId: destinoId,

    entidad: "caso",

    entidadId: destinoId,

    accion: "documentos_consolidados",

    payload: {

      casoOrigenId: origenId,

      casoOrigenNumero: origen.numero,

      documentosMovidos: docRes.modifiedCount,

      lineasMovidas: lineaRes.modifiedCount,

    },

  });



  return {

    documentosMovidos: docRes.modifiedCount,

    lineasMovidas: lineaRes.modifiedCount,

  };

}


