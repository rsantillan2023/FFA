import {
  CasoModel,
  DocumentoFuenteModel,
  registrarAuditoria,
} from "@ffa/db";
import {
  extractMetadataWithFallback,
  fechaPeriodoToDate,
  normalizarPeriodo,
  runWithIaContext,
} from "@ffa/pipeline";
import { getDocumentoBuffer } from "../lib/storage.js";
import { revalidarCaso } from "./revision.js";

export async function reextraerMetadatosCaso(casoId: string, userId: string) {
  const [caso, doc] = await Promise.all([
    CasoModel.findById(casoId),
    DocumentoFuenteModel.findOne({ casoId }).sort({ "recepcion.at": 1 }),
  ]);

  if (!caso) throw new Error("Caso no encontrado");
  if (!doc) throw new Error("Caso sin documento fuente");

  const stored = await getDocumentoBuffer(doc.storageKey);
  const metadata = await runWithIaContext(
    {
      actorTipo: "usuario",
      actorId: userId,
      casoId,
      documentoId: doc._id.toString(),
      documentoNombre: doc.nombreOriginal,
    },
    () =>
      extractMetadataWithFallback({
        documentoNombre: doc.nombreOriginal,
        mimeType: doc.mimeType,
        buffer: stored.buffer,
        tipoHint: doc.tipoDocumento !== "desconocido" ? doc.tipoDocumento : undefined,
      })
  );

  doc.extractMetadata = doc.extractMetadata ?? {};
  if (metadata.razonSocial?.trim()) doc.extractMetadata.razonSocial = metadata.razonSocial.trim();
  if (metadata.rut?.trim()) doc.extractMetadata.rut = metadata.rut.trim();
  if (metadata.moneda?.trim()) doc.extractMetadata.moneda = metadata.moneda.trim();
  if (metadata.escala) doc.extractMetadata.escala = metadata.escala;
  const periodo = normalizarPeriodo(metadata.periodo);
  if (periodo) {
    doc.extractMetadata.periodo = periodo;
  }
  await doc.save();

  if (metadata.moneda) caso.moneda = metadata.moneda;
  if (metadata.escala) caso.escala = metadata.escala;
  if (periodo) {
    const casoPeriodo: { ejercicio?: number; desde?: Date; hasta?: Date } = {};
    if (periodo.ejercicio != null) casoPeriodo.ejercicio = periodo.ejercicio;
    const desde = fechaPeriodoToDate(periodo.desde);
    const hasta = fechaPeriodoToDate(periodo.hasta);
    if (desde) casoPeriodo.desde = desde;
    if (hasta) casoPeriodo.hasta = hasta;
    if (Object.keys(casoPeriodo).length > 0) caso.periodo = casoPeriodo;
  }
  await caso.save();

  await revalidarCaso(casoId);

  await registrarAuditoria({
    actorTipo: "usuario",
    actorId: userId,
    casoId,
    entidad: "documento_fuente",
    entidadId: doc._id.toString(),
    accion: "metadatos_reextraidos_ia",
    payload: {
      razonSocial: doc.extractMetadata.razonSocial,
      rut: doc.extractMetadata.rut,
      moneda: doc.extractMetadata.moneda,
      escala: doc.extractMetadata.escala,
      ejercicio: doc.extractMetadata.periodo?.ejercicio,
    },
  });

  return {
    extractMetadata: doc.extractMetadata,
    moneda: caso.moneda,
    escala: caso.escala,
    periodo: caso.periodo,
  };
}
