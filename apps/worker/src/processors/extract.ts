import {
  CasoModel,
  ConfiguracionSistemaModel,
  DocumentoFuenteModel,
  type DocumentoFuenteDocument,
  LineaContableModel,
  marcarCasoPipelineFallido,
  registrarAuditoria,
  transicionarCaso,
} from "@ffa/db";
import {
  ExtractValidationError,
  enrichExtractResult,
  extractDocument,
  normalizarPeriodo,
  resolveExtractionProvider,
  runWithIaContext,
  type ExtractionProviderName,
} from "@ffa/pipeline";
import type { ExtractJobData } from "@ffa/queue";
import {
  CONFIG_SISTEMA_ID,
  CasoEstado,
  LineaEstado,
  diagnoseExtractFailure,
  withTimeout,
} from "@ffa/shared";
import { extractJobTimeoutMs } from "../lib/extract-job-timeout.js";
import type { Job } from "bullmq";
import type { HydratedDocument } from "mongoose";
import { enqueueNormalize } from "../lib/enqueue.js";
import { aplicarIdentidadCasoExtract } from "../lib/identidad-caso.js";
import { notificarFalloCalidad } from "../lib/notificaciones.js";
import { actualizarProgresoCaso } from "../lib/progreso.js";
import { assertCasoNoPausado } from "../lib/pausa.js";
import { getDocumentoBuffer } from "../lib/storage.js";

function getMaxRetries(map: Map<string, number> | undefined, etapa: string): number {
  if (!map) return 3;
  return map.get(etapa) ?? 3;
}

function isExtractJobTimeout(msg: string): boolean {
  return /tiempo máximo del job|tiempo máximo agotado|timed out|timeout/i.test(msg);
}

async function derivarExtraccionAPendienteCalidad(
  job: Job<ExtractJobData>,
  doc: HydratedDocument<DocumentoFuenteDocument>,
  buffer: Buffer | undefined,
  lastError: string,
  intentos: number
): Promise<void> {
  const { casoId, documentoId } = job.data;

  if (!doc.tamanoBytes && buffer?.length) {
    doc.tamanoBytes = buffer.length;
  }
  const maxPaginas = Number(
    process.env.ANTHROPIC_PDF_MAX_PAGES ?? process.env.OPENAI_PDF_MAX_PAGES ?? 6
  );
  const diagnosis = diagnoseExtractFailure(lastError, {
    tamanoBytes: buffer?.length ?? doc.tamanoBytes,
    paginaCount: doc.paginaCount,
    maxPaginasExtraccion: maxPaginas,
    nombreArchivo: doc.nombreOriginal,
  });
  doc.procesamiento = {
    etapaActual: "extract",
    progresoPct: 0,
    ultimoError: diagnosis.mensaje,
    ultimoErrorCodigo: diagnosis.codigo,
  };
  await doc.save();

  await transicionarCaso(casoId, CasoEstado.PENDIENTE_CALIDAD, {
    nota: `Extracción fallida tras ${intentos} intentos: ${diagnosis.mensaje}`,
  });

  await registrarAuditoria({
    actorTipo: "sistema",
    casoId,
    entidad: "documento_fuente",
    entidadId: documentoId,
    accion: "extraccion_derivada_revision",
    payload: {
      motivo: diagnosis.mensaje,
      errorTecnico: lastError,
      intentos,
      codigo: diagnosis.codigo,
      tamanoBytes: doc.tamanoBytes,
      paginaCount: doc.paginaCount,
    },
  });

  if (doc.recepcion?.remitente) {
    const casoDoc = await CasoModel.findById(casoId);
    if (casoDoc) {
      await notificarFalloCalidad({
        destinatario: doc.recepcion.remitente,
        casoNumero: casoDoc.numero,
        casoId,
      });
    }
  }

  job.log(`Extract FAIL → pendiente_calidad (${lastError})`);
}

export async function processExtract(job: Job<ExtractJobData>): Promise<void> {
  const { casoId, documentoId } = job.data;

  try {
    await withTimeout(
      runExtract(job),
      extractJobTimeoutMs(),
      "Extracción IA: tiempo máximo del job agotado"
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    job.log(`Extract UNHANDLED: ${msg}`);

    if (isExtractJobTimeout(msg)) {
      const doc = await DocumentoFuenteModel.findById(documentoId);
      if (doc) {
        await derivarExtraccionAPendienteCalidad(job, doc, undefined, msg, 0);
        return;
      }
    }

    await marcarCasoPipelineFallido(casoId, "extract", msg);
    throw e;
  }
}

async function runExtract(job: Job<ExtractJobData>): Promise<void> {
  const { casoId, documentoId } = job.data;

  await assertCasoNoPausado(casoId);
  await transicionarCaso(casoId, CasoEstado.EXTRAYENDO, { nota: `Job ${job.id}` });
  await actualizarProgresoCaso(casoId, "extract", undefined, documentoId);
  job.log(`Extract iniciado caso=${casoId} doc=${documentoId}`);

  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  const provider = resolveExtractionProvider(
    config?.extractionProvider as ExtractionProviderName | undefined,
    { openaiKey: process.env.OPENAI_API_KEY }
  );
  const maxRetries = getMaxRetries(
    config?.reintentosMaxPorEtapa as Map<string, number> | undefined,
    "extract"
  );

  const doc = await DocumentoFuenteModel.findById(documentoId);
  if (!doc) throw new Error(`Documento ${documentoId} no encontrado`);

  let buffer: Buffer | undefined;
  try {
    const stored = await getDocumentoBuffer(doc.storageKey);
    buffer = stored.buffer;
  } catch (storageErr) {
    const storageMsg =
      storageErr instanceof Error ? storageErr.message : String(storageErr);
    job.log(`Extract: no se pudo leer el archivo (${storageMsg})`);
    throw new Error(`No se pudo leer el documento fuente: ${storageMsg}`);
  }

  if (!buffer?.length) {
    throw new Error("Documento fuente vacío o no disponible en almacenamiento");
  }

  let result = null;
  let lastError = "Error desconocido";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      result = await runWithIaContext(
        {
          actorTipo: "sistema",
          casoId,
          documentoId,
          documentoNombre: doc.nombreOriginal,
        },
        async () =>
          aplicarIdentidadCasoExtract(
            casoId,
            enrichExtractResult(
              await extractDocument({
                provider,
                documentoNombre: doc.nombreOriginal,
                mimeType: doc.mimeType,
                buffer,
                tipoHint: doc.tipoDocumento !== "desconocido" ? doc.tipoDocumento : undefined,
              })
            )
          )
      );

      await registrarAuditoria({
        actorTipo: "sistema",
        casoId,
        entidad: "documento_fuente",
        entidadId: documentoId,
        accion: "extraccion_intento",
        payload: { attempt, provider, lineasCount: result.lineas.length, ok: true },
      });
      break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      const isTransient =
        e instanceof ExtractValidationError ? false : /fetch|network|timeout|503|429/i.test(lastError);

      await registrarAuditoria({
        actorTipo: "sistema",
        casoId,
        entidad: "documento_fuente",
        entidadId: documentoId,
        accion: "extraccion_intento",
        payload: { attempt, provider, ok: false, error: lastError, reintentable: isTransient },
      });

      if (!isTransient && e instanceof ExtractValidationError) break;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
    }
  }

  if (!result) {
    await derivarExtraccionAPendienteCalidad(job, doc, buffer, lastError, maxRetries);
    return;
  }

  doc.tipoDocumento = result.tipoDocumento as typeof doc.tipoDocumento;
  doc.extractMetadata = {
    ...result.metadata,
    periodo: normalizarPeriodo(result.metadata.periodo),
  };
  doc.extractPayload = result;
  if (result.transcripcionPaginas?.length) {
    doc.extractTranscripcion.splice(0, doc.extractTranscripcion.length);
    for (const t of result.transcripcionPaginas) {
      if (t.texto?.trim()) {
        doc.extractTranscripcion.push({ pagina: t.pagina, texto: t.texto.trim() });
      }
    }
  }
  const paginasLeidas =
    result.transcripcionPaginas?.length ?? (result.lineas.length > 0 ? 1 : 0);
  if (doc.paginaCount && doc.paginaCount > paginasLeidas) {
    doc.preprocessFlags = {
      concatenado: doc.preprocessFlags?.concatenado ?? false,
      incompleto: true,
      rotacionGrados: doc.preprocessFlags?.rotacionGrados ?? 0,
      unidadesDetectadas: doc.preprocessFlags?.unidadesDetectadas ?? 1,
    };
  }
  if (result.notas?.length) {
    doc.extractNotas.splice(0, doc.extractNotas.length);
    for (const n of result.notas) {
      doc.extractNotas.push({ rubroRef: n.rubroRef, texto: n.texto });
    }
  }
  doc.procesamiento = { etapaActual: "extract", progresoPct: 100 };
  await doc.save();

  await LineaContableModel.deleteMany({ casoId, documentoId });

  await LineaContableModel.insertMany(
    result.lineas.map((linea) => ({
      casoId,
      documentoId,
      paginaNumero: linea.paginaNumero,
      bbox: linea.bbox,
      codigoOrigen: linea.codigoOrigen,
      denominacionOriginal: linea.denominacionOriginal,
      columnaOrigen: linea.columnaOrigen,
      montoOriginal: linea.montoOriginal,
      confianzaExtraccion: linea.confianzaExtraccion ?? 80,
      estado: LineaEstado.CRUDA,
      requiereRevision: false,
    }))
  );

  await registrarAuditoria({
    actorTipo: "sistema",
    casoId,
    entidad: "lineas_contables",
    accion: "extraccion_completada",
    payload: {
      documentoId,
      lineasCount: result.lineas.length,
      provider,
      metadata: result.metadata,
    },
  });

  await enqueueNormalize(casoId, documentoId, job.data.runId);
  job.log(`Extract OK ${result.lineas.length} líneas (${provider}) → normalize`);
}
