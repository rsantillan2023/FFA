import { ConfiguracionSistemaModel } from "@ffa/db";
import { anthropicDisponible, openAiDisponible } from "@ffa/pipeline";
import { CONFIG_SISTEMA_ID } from "@ffa/shared";

/** Alinea extractionProvider con API keys disponibles (Anthropic primero). */
export async function syncExtractionProviderFromEnv(): Promise<void> {
  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  if (!config) return;

  const preferAnthropic = anthropicDisponible({ anthropicKey: process.env.ANTHROPIC_API_KEY });
  const preferOpenAi = openAiDisponible({ openaiKey: process.env.OPENAI_API_KEY });

  if (config.extractionProvider === "mock") {
    if (preferAnthropic) {
      config.extractionProvider = "anthropic";
      await config.save();
      console.log("[ffa] extractionProvider actualizado a anthropic (ANTHROPIC_API_KEY detectada)");
    } else if (preferOpenAi) {
      config.extractionProvider = "openai";
      await config.save();
      console.log("[ffa] extractionProvider actualizado a openai (OPENAI_API_KEY detectada)");
    }
    return;
  }

  if (config.extractionProvider === "openai" && preferAnthropic && !preferOpenAi) {
    config.extractionProvider = "anthropic";
    await config.save();
    console.log("[ffa] extractionProvider actualizado a anthropic (solo ANTHROPIC_API_KEY)");
  }
}
