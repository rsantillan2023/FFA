import { CasoModel, ContribuyenteModel } from "@ffa/db";
import type { ExtractResult } from "@ffa/pipeline";
import { isDemoExtractIdentity, resolveIdentidadCaso } from "@ffa/shared";

/** Aplica identidad real (referencia/contribuyente) y descarta placeholders demo del fixture. */
export async function aplicarIdentidadCasoExtract(
  casoId: string,
  result: ExtractResult
): Promise<ExtractResult> {
  const caso = await CasoModel.findById(casoId);
  if (!caso) return result;

  const contrib = caso.contribuyenteId
    ? await ContribuyenteModel.findById(caso.contribuyenteId)
    : null;

  const resolved = resolveIdentidadCaso({
    extractMetadata: result.metadata,
    contribuyente: contrib
      ? { razonSocial: contrib.razonSocial, rut: contrib.rut ?? undefined }
      : null,
    referencia: caso.referencia,
  });

  const metadata = { ...result.metadata };

  if (isDemoExtractIdentity(metadata) || !metadata.razonSocial?.trim()) {
    metadata.razonSocial = resolved.razonSocial || undefined;
  }
  if (isDemoExtractIdentity({ rut: metadata.rut }) || !metadata.rut?.trim()) {
    metadata.rut = resolved.rut !== "—" ? resolved.rut : undefined;
  }

  return { ...result, metadata };
}
