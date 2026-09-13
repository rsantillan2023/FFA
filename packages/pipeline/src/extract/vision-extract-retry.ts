import type { ExtractResult } from "../types.js";
import {
  buildExtractPrompt,
  buildExtractPromptCompact,
  buildExtractPromptMinimal,
} from "./prompts.js";
import { parseExtractJsonContent, salvageExtractFromRaw } from "./vision-shared.js";

export interface VisionExtractAttempt {
  prompt: string;
  maxTokens: number;
  label: string;
}

export interface ExtractPageOptions {
  /** Tamaño del PDF/imagen original en bytes — ajusta estrategia de reintentos. */
  sourceFileBytes?: number;
}

type VisionCallFn = (prompt: string, maxTokens: number, attemptLabel?: string) => Promise<string>;

const LARGE_FILE_MB = 8;
const HEAVY_FILE_MB = 5;

function buildAttempts(
  tipoHint?: string,
  pageNum?: number,
  totalPages?: number,
  sourceFileBytes?: number
): VisionExtractAttempt[] {
  const full = buildExtractPrompt(tipoHint, pageNum, totalPages);
  const compact = buildExtractPromptCompact(tipoHint, pageNum, totalPages);
  const minimal = buildExtractPromptMinimal(tipoHint, pageNum, totalPages);
  const mb = (sourceFileBytes ?? 0) / (1024 * 1024);

  if (mb >= LARGE_FILE_MB) {
    return [
      { prompt: compact, maxTokens: 16384, label: "compacta" },
      { prompt: minimal, maxTokens: 16384, label: "minimal" },
      { prompt: minimal, maxTokens: 8192, label: "minimal-reducida" },
    ];
  }
  if (mb >= HEAVY_FILE_MB) {
    return [
      { prompt: compact, maxTokens: 16384, label: "compacta" },
      { prompt: minimal, maxTokens: 16384, label: "minimal" },
    ];
  }

  return [
    { prompt: compact, maxTokens: 16384, label: "compacta" },
    { prompt: full, maxTokens: 16384, label: "completa" },
    { prompt: minimal, maxTokens: 16384, label: "minimal" },
  ];
}

/** Reintenta extracción por página si la IA trunca el JSON (p. ej. transcripción muy larga). */
export async function extractPageWithRetry(
  callVision: VisionCallFn,
  tipoHint?: string,
  pageNum?: number,
  totalPages?: number,
  options?: ExtractPageOptions
): Promise<ExtractResult> {
  const attempts = buildAttempts(tipoHint, pageNum, totalPages, options?.sourceFileBytes);
  let lastError = "Error desconocido";
  let lastRaw: string | undefined;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]!;
    try {
      const raw = await callVision(attempt.prompt, attempt.maxTokens, attempt.label);
      lastRaw = raw;
      return parseExtractJsonContent(raw);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const retryable = /json|truncad|unexpected token|parse/i.test(lastError);
      if (!retryable && i === attempts.length - 1) break;
      if (i === attempts.length - 1) break;
    }
  }

  if (lastRaw) {
    const salvaged = salvageExtractFromRaw(lastRaw);
    if (salvaged && salvaged.lineas.length > 0) return salvaged;
  }

  throw new Error(lastError);
}
