import type { ExtractResult } from "../types.js";
import { runWithIaContext } from "../ia/ia-context.js";
import { extractMetadataAnthropic, type AnthropicExtractInput } from "./anthropic-provider.js";
import { extractMetadataOpenAI, type OpenAIExtractInput } from "./openai-provider.js";
import { anthropicDisponible, openAiDisponible } from "./resolve-provider.js";

export type MetadataExtractInput = OpenAIExtractInput;

export async function extractMetadataWithFallback(
  input: MetadataExtractInput
): Promise<ExtractResult["metadata"]> {
  if (!openAiDisponible() && !anthropicDisponible()) {
    throw new Error(
      "Extracción con IA no disponible. Configure OPENAI_API_KEY o ANTHROPIC_API_KEY."
    );
  }

  if (openAiDisponible()) {
    try {
      return await extractMetadataOpenAI(input);
    } catch (openAiErr) {
      if (!anthropicDisponible()) throw openAiErr;
    }
  }

  return runWithIaContext({ actorTipo: "sistema", esRespaldoAnthropic: true }, () =>
    extractMetadataAnthropic(input as AnthropicExtractInput)
  );
}
