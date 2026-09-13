import { ConfiguracionSistemaModel } from "@ffa/db";
import { openAiDisponible } from "@ffa/pipeline";
import { CONFIG_SISTEMA_ID } from "@ffa/shared";

/** Si hay OPENAI_API_KEY, asegura extractionProvider=openai (no dejar mock por seed viejo). */
export async function syncExtractionProviderFromEnv(): Promise<void> {
  if (!openAiDisponible({ openaiKey: process.env.OPENAI_API_KEY })) return;

  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  if (!config) return;

  if (config.extractionProvider === "mock") {
    config.extractionProvider = "openai";
    await config.save();
    console.log("[ffa] extractionProvider actualizado a openai (OPENAI_API_KEY detectada)");
  }
}
