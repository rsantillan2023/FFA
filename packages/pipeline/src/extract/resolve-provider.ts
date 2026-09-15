import type { ExtractionProviderName } from "./extract-provider.js";

export function openAiDisponible(env: { openaiKey?: string | null } = {}): boolean {
  return Boolean((env.openaiKey ?? process.env.OPENAI_API_KEY)?.trim());
}

export function anthropicDisponible(env: { anthropicKey?: string | null } = {}): boolean {
  return Boolean((env.anthropicKey ?? process.env.ANTHROPIC_API_KEY)?.trim());
}

/** Anthropic primero si hay API key; OpenAI como alternativa explícita o fallback. */
export function resolveExtractionProvider(
  configured: ExtractionProviderName | undefined,
  env: { openaiKey?: string | null; anthropicKey?: string | null } = {}
): ExtractionProviderName {
  const hasOpenAi = openAiDisponible(env);
  const hasAnthropic = anthropicDisponible(env);

  if (configured === "anthropic") return hasAnthropic ? "anthropic" : hasOpenAi ? "openai" : "mock";
  if (configured === "openai") {
    if (hasOpenAi) return "openai";
    if (hasAnthropic) return "anthropic";
    return "mock";
  }
  if (configured === "mock") return "mock";
  if (hasAnthropic) return "anthropic";
  if (hasOpenAi) return "openai";
  return "mock";
}
