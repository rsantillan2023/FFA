import {
  CasoModel,
  ConfiguracionSistemaModel,
  ContribuyenteModel,
  DocumentoFuenteModel,
  LineaContableModel,
  registrarAuditoria,
  transicionarCaso,
  type DocumentoFuenteDocument,
  type LineaContableDocument,
} from "@ffa/db";
import { fechaPeriodoToDate, normalizeExtractResult, type ExtractResult } from "@ffa/pipeline";
import type { NormalizeJobData } from "@ffa/queue";
import { CONFIG_SISTEMA_ID, CasoEstado, LineaEstado, isDemoExtractIdentity } from "@ffa/shared";
import type { Job } from "bullmq";
import type { HydratedDocument } from "mongoose";
import { enqueueClassify } from "../lib/enqueue.js";
import { skipSiPipelineObsoleto } from "../lib/pipeline-run.js";
import { assertCasoNoPausado } from "../lib/pausa.js";
import { actualizarProgresoCaso } from "../lib/progreso.js";

function buildExtractFromDoc(
  doc: HydratedDocument<DocumentoFuenteDocument>,
  lineasDb: HydratedDocument<LineaContableDocument>[]
): ExtractResult {
  return {
    tipoDocumento: doc.tipoDocumento ?? "desconocido",
    metadata: {
      razonSocial: doc.extractMetadata?.razonSocial ?? undefined,
      rut: doc.extractMetadata?.rut ?? undefined,
      moneda: doc.extractMetadata?.moneda ?? undefined,
      escala: doc.extractMetadata?.escala ?? "indeterminada",
      periodo: doc.extractMetadata?.periodo
        ? {
            ejercicio: doc.extractMetadata.periodo.ejercicio ?? undefined,
            desde: doc.extractMetadata.periodo.desde ?? undefined,
            hasta: doc.extractMetadata.periodo.hasta ?? undefined,
          }
        : undefined,
    },
    notas: doc.extractNotas?.map((n) => ({
      rubroRef: n.rubroRef ?? undefined,
      texto: n.texto ?? "",
    })),
    lineas: lineasDb.map((l) => ({
      denominacionOriginal: l.denominacionOriginal,
      codigoOrigen: l.codigoOrigen ?? undefined,
      columnaOrigen: l.columnaOrigen ?? undefined,
      montoOriginal: l.montoOriginal,
      paginaNumero: l.paginaNumero,
      confianzaExtraccion: l.confianzaExtraccion ?? undefined,
      bbox:
        l.bbox?.x != null && l.bbox?.y != null && l.bbox?.w != null && l.bbox?.h != null
          ? { x: l.bbox.x, y: l.bbox.y, w: l.bbox.w, h: l.bbox.h }
          : undefined,
    })),
  };
}

export async function processNormalize(job: Job<NormalizeJobData>): Promise<void> {
  const { casoId, documentoId } = job.data;

  await assertCasoNoPausado(casoId);
  if (await skipSiPipelineObsoleto(casoId, job.data.runId, (m) => job.log(m))) return;
  await transicionarCaso(casoId, CasoEstado.NORMALIZANDO, { nota: `Job ${job.id}` });
  await actualizarProgresoCaso(casoId, "normalize", undefined, documentoId);

  const doc = await DocumentoFuenteModel.findById(documentoId);
  if (!doc) throw new Error(`Documento ${documentoId} no encontrado`);

  const lineasDb = await LineaContableModel.find({ casoId, documentoId }).sort({ paginaNumero: 1 });
  const normalizeLog: { at: Date; etapa: string; mensaje: string }[] = [];

  const extracted = buildExtractFromDoc(doc, lineasDb);
  const normalized = normalizeExtractResult(extracted, {
    normalizeLog,
    añoVigente: new Date().getFullYear(),
  });

  const escalaIndeterminada = normalized.metadata.escala === "indeterminada";

  for (let i = 0; i < lineasDb.length && i < normalized.lineas.length; i++) {
    const src = normalized.lineas[i];
    lineasDb[i].denominacionNormalizada = src.denominacionNormalizada;
    lineasDb[i].montoNormalizado = src.montoNormalizado;
    lineasDb[i].signoAplicado = src.signoAplicado;
    lineasDb[i].estado = LineaEstado.NORMALIZADA;
    if (escalaIndeterminada) {
      lineasDb[i].requiereRevision = true;
    }
    await lineasDb[i].save();
  }

  doc.normalizeLog.splice(0, doc.normalizeLog.length);
  for (const entry of normalizeLog) {
    doc.normalizeLog.push(entry);
  }
  doc.procesamiento = { etapaActual: "normalize", progresoPct: 100 };
  await doc.save();

  const caso = await CasoModel.findById(casoId);
  if (caso) {
    const meta = normalized.metadata;
    caso.moneda = meta.moneda ?? caso.moneda;
    caso.escala = meta.escala ?? caso.escala;
    if (meta.periodo) {
      const periodo: { ejercicio?: number; desde?: Date; hasta?: Date } = {};
      if (meta.periodo.ejercicio != null) periodo.ejercicio = meta.periodo.ejercicio;
      const desde = fechaPeriodoToDate(meta.periodo.desde);
      const hasta = fechaPeriodoToDate(meta.periodo.hasta);
      if (desde) periodo.desde = desde;
      if (hasta) periodo.hasta = hasta;
      if (Object.keys(periodo).length > 0) {
        caso.periodo = periodo;
      }
    }
    let autoVinculado: string | undefined;
    const metaEsDemo = isDemoExtractIdentity(meta);
    if (!caso.contribuyenteId && !metaEsDemo) {
      if (meta.rut) {
        const contrib = await ContribuyenteModel.findOne({ rut: meta.rut });
        if (contrib) {
          caso.set("contribuyenteId", contrib._id);
          autoVinculado = contrib._id.toString();
        }
      }
      if (!autoVinculado && meta.razonSocial) {
        const regex = new RegExp(
          meta.razonSocial.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        );
        const contrib = await ContribuyenteModel.findOne({
          $or: [{ razonSocial: regex }, { denominacionesAlternativas: regex }],
        });
        if (contrib) {
          caso.set("contribuyenteId", contrib._id);
          autoVinculado = contrib._id.toString();
        }
      }
    }
    await caso.save();
    if (autoVinculado) {
      await registrarAuditoria({
        actorTipo: "sistema",
        casoId,
        entidad: "caso",
        entidadId: casoId,
        accion: "contribuyente_auto_vinculado",
        payload: { contribuyenteId: autoVinculado, rut: meta.rut, razonSocial: meta.razonSocial },
      });
    }
  }

  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);

  await registrarAuditoria({
    actorTipo: "sistema",
    casoId,
    entidad: "caso",
    accion: "normalizacion_completada",
    payload: {
      moneda: normalized.metadata.moneda,
      escala: normalized.metadata.escala,
      periodo: normalized.metadata.periodo,
      normalizeLogCount: normalizeLog.length,
    },
    configSnapshot: { umbral: config?.umbralConfianza },
  });

  await enqueueClassify(casoId, job.data.runId);
  job.log(`Normalize OK → classify (${normalizeLog.length} log entries)`);
}
