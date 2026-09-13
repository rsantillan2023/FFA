import {

  CasoModel,
  ConfiguracionSistemaModel,
  DocumentoFuenteModel,
  registrarAuditoria,
  transicionarCaso,
  type DocumentoFuenteDocument,
} from "@ffa/db";

import { analyzeDocument, renderPdfToPngPages } from "@ffa/pipeline";

import type { PreprocessJobData } from "@ffa/queue";

import { CONFIG_SISTEMA_ID, CasoEstado } from "@ffa/shared";

import type { Job } from "bullmq";

import type { HydratedDocument } from "mongoose";

import { assertCasoNoPausado } from "../lib/pausa.js";
import { enqueueExtract } from "../lib/enqueue.js";

import { notificarFalloCalidad, notificarRevisionAnalista } from "../lib/notificaciones.js";

import { actualizarProgresoCaso } from "../lib/progreso.js";

import { getDocumentoBuffer, uploadBuffer } from "../lib/storage.js";



function appendLog(

  doc: HydratedDocument<DocumentoFuenteDocument>,

  etapa: string,

  mensaje: string

): void {

  doc.preprocessLog.push({ at: new Date(), etapa, mensaje });

}



/** Preprocesamiento — B.2–B.3, B.7–B.8, B.10 + encola extracción. */

export async function processPreprocess(job: Job<PreprocessJobData>): Promise<void> {

  const { casoId, documentoId } = job.data;
  await assertCasoNoPausado(casoId);

  await transicionarCaso(casoId, CasoEstado.PREPROCESANDO, { nota: `Job ${job.id}` });

  await actualizarProgresoCaso(casoId, "preprocess", undefined, documentoId);



  const doc = await DocumentoFuenteModel.findById(documentoId);

  if (!doc) throw new Error(`Documento ${documentoId} no encontrado`);



  appendLog(doc, "inicio", `MIME ${doc.mimeType}, archivo ${doc.nombreOriginal}`);



  let paginaHint = doc.paginaCount || undefined;

  if (doc.mimeType === "application/pdf" && !paginaHint) {

    try {

      const { buffer } = await getDocumentoBuffer(doc.storageKey);

      const pages = await renderPdfToPngPages(buffer, 1);

      paginaHint = pages.length || 2;

    } catch {

      paginaHint = 2;

    }

  }



  const analysis = analyzeDocument({

    nombreOriginal: doc.nombreOriginal,

    mimeType: doc.mimeType,

    paginaCount: paginaHint,

  });



  for (const entry of analysis.log) {

    appendLog(doc, entry.etapa, entry.mensaje);

  }



  doc.calidadOrigen = analysis.calidadOrigen;

  doc.tipoDocumento = analysis.tipoDocumento as DocumentoFuenteDocument["tipoDocumento"];

  doc.paginaCount = analysis.paginaCount;

  doc.set("preprocessFlags", {

    concatenado: analysis.concatenado,

    incompleto: analysis.incompleto,

    rotacionGrados: analysis.rotacionGrados,

    unidadesDetectadas: analysis.unidadesDetectadas,

  });



  const paginasNormalizadas: string[] = [];

  let miniaturaKey: string | undefined;



  try {

    const { buffer } = await getDocumentoBuffer(doc.storageKey);

    if (doc.mimeType === "application/pdf") {

      const pages = await renderPdfToPngPages(buffer, 3);

      for (const p of pages) {

        const key = await uploadBuffer(

          casoId,

          documentoId,

          `derivados/pagina-${p.pageNum}.png`,

          p.buffer,

          p.mimeType

        );

        paginasNormalizadas.push(key);

        if (!miniaturaKey) miniaturaKey = key;

      }

      appendLog(

        doc,

        "derivados",

        `${paginasNormalizadas.length} página(s) normalizada(s) generadas (B.10)`

      );

    } else if (doc.mimeType.startsWith("image/")) {

      miniaturaKey = await uploadBuffer(

        casoId,

        documentoId,

        "derivados/miniatura.png",

        buffer,

        doc.mimeType

      );

      paginasNormalizadas.push(miniaturaKey);

      appendLog(doc, "derivados", "Miniatura imagen generada (B.10)");

    }

  } catch (e) {

    appendLog(

      doc,

      "derivados",

      `No se generaron derivados: ${e instanceof Error ? e.message : "error"}`

    );

  }



  if (miniaturaKey || paginasNormalizadas.length) {

    doc.set("derivados", { miniaturaKey, paginasNormalizadas });

  }



  doc.procesamiento = { etapaActual: "preprocess", progresoPct: 100 };

  await doc.save();



  await registrarAuditoria({

    actorTipo: "sistema",

    casoId,

    entidad: "documento_fuente",

    entidadId: documentoId,

    accion: "preprocess_completado",

    payload: {

      calidadOrigen: doc.calidadOrigen,

      tipoDocumento: doc.tipoDocumento,

      preprocessFlags: analysis,

      derivadosCount: paginasNormalizadas.length,

      warnings: analysis.warnings,

    },

  });



  if (doc.calidadOrigen === "ilegible") {
    const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
    const accion = config?.politicaIlegible?.accion ?? "pendiente_calidad_remitente";

    await transicionarCaso(casoId, CasoEstado.PENDIENTE_CALIDAD, {
      nota:
        accion === "escalar_analista"
          ? "Documento ilegible — escalado a analista (R.10)"
          : "Documento ilegible — requiere carga manual alternativa",
    });

    const caso = await CasoModel.findById(casoId);
    if (caso) {
      if (accion === "escalar_analista") {
        await notificarRevisionAnalista({
          casoNumero: caso.numero,
          casoId,
          semaforo: "rojo",
        });
      } else if (doc.recepcion?.remitente) {
        await notificarFalloCalidad({
          destinatario: doc.recepcion.remitente,
          casoNumero: caso.numero,
          casoId,
        });
      }
    }

    job.log(`Preprocess → pendiente_calidad (ilegible, ${accion})`);
    return;
  }



  if (analysis.incompleto) {

    await CasoModel.findByIdAndUpdate(casoId, {

      $set: { observaciones: "Documento posiblemente incompleto — revisar en estación (B.7)" },

    });

  }



  await enqueueExtract(casoId, documentoId, job.data.runId);

  job.log(`Preprocess OK → extract caso=${casoId}`);

}


