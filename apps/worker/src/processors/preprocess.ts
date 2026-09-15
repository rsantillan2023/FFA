import {
  CasoModel,
  ConfiguracionSistemaModel,
  DocumentoFuenteModel,
  puedeIniciarPreprocess,
  registrarAuditoria,
  transicionarCaso,
  type DocumentoFuenteDocument,
} from "@ffa/db";
import {
  analyzeDocument,
  buildPreprocessCacheSnapshot,
  getPdfNumPages,
  measureImageInkRatio,
  renderPdfForPreprocess,
} from "@ffa/pipeline";
import type { PreprocessJobData } from "@ffa/queue";
import { CONFIG_SISTEMA_ID, CasoEstado, preprocessConcurrencyLimit } from "@ffa/shared";
import type { Job } from "bullmq";
import type { HydratedDocument } from "mongoose";
import { skipSiPipelineObsoleto } from "../lib/pipeline-run.js";
import { assertCasoNoPausado } from "../lib/pausa.js";
import { enqueueExtract, enqueuePreprocess } from "../lib/enqueue.js";
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

async function detenerPorFalloPreproceso(
  casoId: string,
  doc: HydratedDocument<DocumentoFuenteDocument>,
  job: Job<PreprocessJobData>,
  nota: string
): Promise<void> {
  appendLog(doc, "calidad", nota);
  doc.calidadOrigen = "ilegible";
  doc.procesamiento = {
    etapaActual: "preprocess",
    progresoPct: 100,
    ultimoError: nota,
    ultimoErrorCodigo: "PREPROCESO_DERIVADOS",
  };
  await doc.save();

  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  const accion = config?.politicaIlegible?.accion ?? "pendiente_calidad_remitente";

  await transicionarCaso(casoId, CasoEstado.PENDIENTE_CALIDAD, {
    nota: `Preproceso fallido — ${nota}`,
  });

  const caso = await CasoModel.findById(casoId);
  if (caso) {
    await CasoModel.findByIdAndUpdate(casoId, {
      $set: { observaciones: nota, ultimoError: "PREPROCESO_DERIVADOS" },
    });

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

  await registrarAuditoria({
    actorTipo: "sistema",
    casoId,
    entidad: "documento_fuente",
    entidadId: String(doc._id),
    accion: "preprocess_fallido_calidad",
    payload: { nota },
  });

  job.log(`Preprocess → pendiente_calidad (${nota})`);
}

/** Preprocesamiento — B.2–B.3, B.7–B.8, B.10 + encola extracción. */
export async function processPreprocess(job: Job<PreprocessJobData>): Promise<void> {
  const { casoId, documentoId } = job.data;
  await assertCasoNoPausado(casoId);
  if (await skipSiPipelineObsoleto(casoId, job.data.runId, (m) => job.log(m))) return;

  if (!(await puedeIniciarPreprocess(casoId))) {
    const max = preprocessConcurrencyLimit();
    job.log(`Preproceso global lleno (${max} simultáneos) — reencolando caso ${casoId}`);
    await new Promise((r) => setTimeout(r, 4000));
    await enqueuePreprocess(casoId, documentoId, job.data.runId);
    return;
  }

  await transicionarCaso(casoId, CasoEstado.PREPROCESANDO, { nota: `Job ${job.id}` });
  await actualizarProgresoCaso(casoId, "preprocess", undefined, documentoId);

  const doc = await DocumentoFuenteModel.findById(documentoId);
  if (!doc) throw new Error(`Documento ${documentoId} no encontrado`);

  appendLog(doc, "inicio", `MIME ${doc.mimeType}, archivo ${doc.nombreOriginal}`);
  const { buffer } = await getDocumentoBuffer(doc.storageKey);

  let paginaHint = doc.paginaCount || undefined;
  if (doc.mimeType === "application/pdf" && !paginaHint) {
    try {
      paginaHint = (await getPdfNumPages(buffer)) || 1;
    } catch {
      paginaHint = 1;
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
  let preprocesoFallido = false;

  try {
    if (doc.mimeType === "application/pdf") {
      const render = await renderPdfForPreprocess(buffer, 3);

      for (const q of render.calidadPorPagina) {
        appendLog(
          doc,
          "calidad_pagina",
          `Pág. ${q.pageNum}: tinta ${q.inkRatioPct?.toFixed(2) ?? "?"}% — ${q.ok ? "OK" : q.motivo ?? "rechazada"}`
        );
      }

      if (!render.valido) {
        preprocesoFallido = true;
        const detalle = render.errores.join("; ");
        appendLog(doc, "derivados", `Preproceso rechazado: ${detalle}`);
        appendLog(
          doc,
          "derivados",
          render.metodo !== "canvas"
            ? `Fallback render (${render.metodo}) insuficiente`
            : "Render estándar insuficiente — sin derivados válidos"
        );
      } else {
        for (const p of render.pages) {
          const key = await uploadBuffer(
            casoId,
            documentoId,
            `derivados/pagina-${p.pageNum}.png`,
            p.buffer,
            "image/png"
          );
          paginasNormalizadas.push(key);
          if (!miniaturaKey) miniaturaKey = key;
        }

        appendLog(
          doc,
          "derivados",
          `${paginasNormalizadas.length} página(s) normalizada(s) — método ${render.metodo} (B.10)`
        );
      }
    } else if (doc.mimeType.startsWith("image/")) {
      const ink = await measureImageInkRatio(buffer, doc.mimeType);
      if (ink != null && ink < 0.8) {
        preprocesoFallido = true;
        appendLog(doc, "derivados", `Imagen casi en blanco (tinta ${ink.toFixed(2)}%)`);
      } else {
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
    }
  } catch (e) {
    preprocesoFallido = true;
    appendLog(
      doc,
      "derivados",
      `No se generaron derivados: ${e instanceof Error ? e.message : "error"}`
    );
  }

  if (preprocesoFallido) {
    await detenerPorFalloPreproceso(
      casoId,
      doc,
      job,
      "El preprocesamiento no produjo páginas legibles. Revisá el PDF o cargá una versión alternativa."
    );
    return;
  }

  const derivados =
    miniaturaKey || paginasNormalizadas.length
      ? { miniaturaKey, paginasNormalizadas }
      : undefined;
  if (derivados) {
    doc.set("derivados", derivados);
  }

  doc.procesamiento = { etapaActual: "preprocess", progresoPct: 100 };
  if (doc.calidadOrigen !== "ilegible") {
    doc.set(
      "preprocessCache",
      buildPreprocessCacheSnapshot({
        hashSha256: doc.hashSha256,
        mimeType: doc.mimeType,
        calidadOrigen: doc.calidadOrigen ?? "pendiente",
        tipoDocumento: doc.tipoDocumento ?? "desconocido",
        paginaCount: doc.paginaCount ?? 0,
        preprocessFlags: {
          concatenado: analysis.concatenado,
          incompleto: analysis.incompleto,
          rotacionGrados: analysis.rotacionGrados,
          unidadesDetectadas: analysis.unidadesDetectadas,
        },
        derivados,
      })
    );
  }

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
