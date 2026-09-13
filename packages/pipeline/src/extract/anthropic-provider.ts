import type { ExtractResult } from "../types.js";
import { emitIaLlamada } from "../ia/registrar-llamada.js";
import { extractMock } from "./mock-provider.js";
import { extractPdfPagesSequential } from "./extract-pdf-sequential.js";
import { buildMetadataOnlyPrompt } from "./prompts.js";
import { planPdfPagesForExtraction } from "./pdf-extract-pages.js";
import { extractPageWithRetry } from "./vision-extract-retry.js";
import { firstPageImage, parseExtractJsonContent } from "./vision-shared.js";

export interface AnthropicExtractInput {
  documentoNombre: string;
  mimeType?: string;
  buffer?: Buffer;
  tipoHint?: string;
}

function anthropicTimeoutMs(): number {
  const n = Number(process.env.ANTHROPIC_REQUEST_TIMEOUT_MS ?? process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 180_000);
  return Number.isFinite(n) && n > 0 ? n : 180_000;
}

/** Modelos en orden de preferencia (el 20250514 fue retirado en 2026). */
function anthropicModelCandidates(): string[] {
  const configured = process.env.ANTHROPIC_EXTRACT_MODEL?.trim();
  const fallbacks = ["claude-sonnet-4-6", "claude-sonnet-5"];
  return [...new Set([configured, ...fallbacks].filter(Boolean))] as string[];
}

async function callAnthropicVisionRaw(
  apiKey: string,
  mimeType: string,
  buffer: Buffer,
  prompt: string,
  maxTokens: number,
  meta: { funcion: string; pagina?: number; intentoLabel?: string }
): Promise<string> {
  const b64 = buffer.toString("base64");
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType,
            data: b64,
          },
        },
        { type: "text", text: prompt },
      ],
    },
  ];

  let lastError = "Error desconocido";
  for (const model of anthropicModelCandidates()) {
    const started = Date.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(anthropicTimeoutMs()),
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
    });

    if (res.status === 404) {
      lastError = `modelo ${model} no encontrado`;
      await emitIaLlamada({
        proveedor: "anthropic",
        modelo: model,
        funcion: meta.funcion,
        tokensEntrada: 0,
        tokensSalida: 0,
        duracionMs: Date.now() - started,
        exito: false,
        error: lastError,
        detalle: { pagina: meta.pagina, intentoLabel: meta.intentoLabel },
      });
      continue;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const errMsg = `Anthropic HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
      await emitIaLlamada({
        proveedor: "anthropic",
        modelo: model,
        funcion: meta.funcion,
        tokensEntrada: 0,
        tokensSalida: 0,
        duracionMs: Date.now() - started,
        exito: false,
        error: errMsg,
        detalle: { pagina: meta.pagina, intentoLabel: meta.intentoLabel },
      });
      throw new Error(errMsg);
    }

    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    await emitIaLlamada({
      proveedor: "anthropic",
      modelo: model,
      funcion: meta.funcion,
      tokensEntrada: body.usage?.input_tokens ?? 0,
      tokensSalida: body.usage?.output_tokens ?? 0,
      duracionMs: Date.now() - started,
      exito: true,
      detalle: { pagina: meta.pagina, intentoLabel: meta.intentoLabel },
    });

    const content = body.content?.find((b) => b.type === "text")?.text;
    if (!content?.trim()) throw new Error("Respuesta Anthropic vacía");

    return content;
  }

  throw new Error(`Anthropic: ningún modelo disponible (${lastError})`);
}

async function callAnthropicVisionPage(
  apiKey: string,
  mimeType: string,
  buffer: Buffer,
  tipoHint?: string,
  pageNum?: number,
  totalPages?: number,
  sourceFileBytes?: number
): Promise<ExtractResult> {
  return extractPageWithRetry(
    async (prompt, maxTokens, attemptLabel) =>
      callAnthropicVisionRaw(apiKey, mimeType, buffer, prompt, maxTokens, {
        funcion: "extract_vision",
        pagina: pageNum,
        intentoLabel: attemptLabel,
      }),
    tipoHint,
    pageNum,
    totalPages,
    { sourceFileBytes }
  );
}

/** Proveedor Anthropic — visión Claude para imágenes y PDF multipágina. */
export async function extractAnthropic(input: AnthropicExtractInput): Promise<ExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return extractMock(input.documentoNombre);
  }

  const isImage = input.mimeType?.startsWith("image/") && input.buffer?.length;
  const isPdf = input.mimeType === "application/pdf" && input.buffer?.length;

  const sourceFileBytes = input.buffer?.length;

  if (isImage) {
    return callAnthropicVisionPage(
      apiKey,
      input.mimeType!,
      input.buffer!,
      input.tipoHint,
      undefined,
      undefined,
      sourceFileBytes
    );
  }

  if (isPdf) {
    const plan = await planPdfPagesForExtraction(input.buffer!);
    if (plan.pages.length === 0) {
      throw new Error("No se pudo renderizar el PDF — verifique @napi-rs/canvas y pdfjs-dist");
    }

    return extractPdfPagesSequential(
      plan.pages,
      (pg) =>
        callAnthropicVisionPage(
          apiKey,
          pg.mimeType,
          pg.buffer,
          input.tipoHint,
          pg.pageNum,
          plan.totalPages || plan.pages.length,
          sourceFileBytes
        ),
      { paginasClasificadas: plan.paginasClasificadas }
    );
  }

  throw new Error(`Tipo de archivo no soportado para extracción IA: ${input.mimeType ?? "desconocido"}`);
}

/** Re-lee solo metadatos del encabezado con Claude. */
export async function extractMetadataAnthropic(
  input: AnthropicExtractInput
): Promise<ExtractResult["metadata"]> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY no configurada — no se puede leer el documento con IA");
  }
  if (!input.buffer?.length) {
    throw new Error("Documento sin contenido para leer");
  }

  const page = await firstPageImage(input.buffer, input.mimeType);
  if (!page) {
    throw new Error("No se pudo renderizar la primera página del PDF para lectura con IA");
  }

  const raw = await callAnthropicVisionRaw(
    apiKey,
    page.mimeType,
    page.buffer,
    buildMetadataOnlyPrompt(),
    1024,
    { funcion: "extract_metadata", pagina: 1 }
  );
  const result = parseExtractJsonContent(raw);
  return result.metadata ?? {};
}
