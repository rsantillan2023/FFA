import { DocumentoFuenteModel } from "@ffa/db";

const ETAPA_PCT: Record<string, number> = {
  preprocess: 15,
  extract: 35,
  normalize: 55,
  classify: 75,
  validate: 88,
  pre_revision: 95,
  en_revision: 100,
};

export async function actualizarProgresoCaso(
  casoId: string,
  etapa: string,
  progresoPct?: number,
  documentoId?: string
): Promise<void> {
  const pct = progresoPct ?? ETAPA_PCT[etapa] ?? 0;
  const filter = documentoId ? { _id: documentoId } : { casoId };
  await DocumentoFuenteModel.updateMany(
    filter,
    { $set: { "procesamiento.etapaActual": etapa, "procesamiento.progresoPct": pct } }
  );
}
