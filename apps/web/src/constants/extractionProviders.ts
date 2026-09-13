export const EXTRACTION_PROVIDER_LABELS: Record<string, string> = {
  mock: "Simulado (datos de prueba)",
  openai: "OpenAI (principal)",
  anthropic: "Anthropic (Claude)",
};

export const EXTRACTION_FALLBACK_NOTE =
  "Proveedor principal OpenAI. Si falla la lectura o la API no responde, el sistema usa Anthropic (Claude) como respaldo automático.";

export function extractionProviderLabel(provider?: string | null): string {
  if (!provider) return EXTRACTION_PROVIDER_LABELS.mock;
  return EXTRACTION_PROVIDER_LABELS[provider] ?? provider;
}

export function showAnthropicFallbackNote(provider?: string | null): boolean {
  return provider === "openai" || provider == null;
}
