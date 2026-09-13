import {
  ContribuyenteModel,
  DocumentoFuenteModel,
  type CasoDocument,
  type DocumentoFuenteDocument,
} from "@ffa/db";
import {
  isDemoExtractIdentity,
  resolveIdentidadCaso,
  type CasoContribuyenteResumenDto,
  type IdentidadResuelta,
} from "@ffa/shared";

export async function loadContribuyenteResumen(
  contribuyenteId?: string | null
): Promise<CasoContribuyenteResumenDto | undefined> {
  if (!contribuyenteId) return undefined;
  const contrib = await ContribuyenteModel.findById(contribuyenteId).select("razonSocial rut");
  if (!contrib) return undefined;
  return {
    id: contrib._id.toString(),
    razonSocial: contrib.razonSocial,
    rut: contrib.rut ?? undefined,
  };
}

export async function resolveIdentidadParaCaso(caso: CasoDocument): Promise<IdentidadResuelta> {
  const [docs, contribResumen] = await Promise.all([
    DocumentoFuenteModel.find({ casoId: caso._id }).sort({ "recepcion.at": 1 }),
    loadContribuyenteResumen(caso.contribuyenteId?.toString()),
  ]);

  let docMeta = docs[0]?.extractMetadata;
  for (const doc of docs) {
    const meta = doc.extractMetadata;
    if (meta?.razonSocial?.trim() || meta?.rut?.trim()) {
      docMeta = meta;
      break;
    }
  }

  return resolveIdentidadCaso({
    extractMetadata: docMeta,
    contribuyente: contribResumen,
    referencia: caso.referencia,
  });
}

/** Corrige metadatos demo persistidos cuando hay identidad real disponible (referencia/contribuyente). */
export async function sanitizarIdentidadDemoEnDocumentos(
  docs: DocumentoFuenteDocument[],
  identidad: IdentidadResuelta
): Promise<void> {
  if (!identidad.metadataEsDemo || !identidad.razonSocial.trim()) return;

  for (const doc of docs) {
    if (!isDemoExtractIdentity(doc.extractMetadata)) continue;
    const extractMetadata = {
      ...(doc.extractMetadata ?? {}),
      razonSocial: identidad.razonSocial,
      rut: identidad.rut !== "—" ? identidad.rut : doc.extractMetadata?.rut,
    };
    await DocumentoFuenteModel.updateOne({ _id: doc._id }, { $set: { extractMetadata } });
    doc.extractMetadata = extractMetadata;
  }
}
