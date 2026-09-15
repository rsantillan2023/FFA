import type { ExtractResult } from "../types.js";
import { emitIaLlamada } from "../ia/registrar-llamada.js";
import { extractMock } from "./mock-provider.js";
import { extractPdfPagesSequential } from "./extract-pdf-sequential.js";
import { buildMetadataOnlyPrompt } from "./prompts.js";
import { attachProvenanceExtraccion, planPdfPagesForExtraction } from "./pdf-extract-pages.js";
import { extractPageWithRetry } from "./vision-extract-retry.js";
import { firstPageImage, parseExtractJsonContent } from "./vision-shared.js";

export interface OpenAIExtractInput {
  documentoNombre: string;
  mimeType?: string;
  buffer?: Buffer;
  tipoHint?: string;
}

function openAiTimeoutMs(): number {
  const n = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 180_000);
  return Number.isFinite(n) && n > 0 ? n : 180_000;
}

function openAiExtractModel(): string {
  return process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4o-mini";
}

async function callOpenAIVisionRaw(
  apiKey: string,
  mimeType: string,
  buffer: Buffer,
  prompt: string,
  maxTokens: number,
  meta: { funcion: string; pagina?: number; intentoLabel?: string }
): Promise<string> {
  const model = openAiExtractModel();
  const started = Date.now();
  try {
    const b64 = buffer.toString("base64");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(openAiTimeoutMs()),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${b64}` },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const errMsg = `OpenAI HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
      await emitIaLlamada({
        proveedor: "openai",
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
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: { message?: { content?: string | null; refusal?: string | null } }[];
    };

    await emitIaLlamada({
      proveedor: "openai",
      modelo: body.model ?? model,
      funcion: meta.funcion,
      tokensEntrada: body.usage?.prompt_tokens ?? 0,
      tokensSalida: body.usage?.completion_tokens ?? 0,
      duracionMs: Date.now() - started,
      exito: true,
      detalle: { pagina: meta.pagina, intentoLabel: meta.intentoLabel },
    });

    const message = body.choices?.[0]?.message;
    if (message?.refusal?.trim()) {
      throw new Error(`OpenAI rechazó la solicitud: ${message.refusal.trim()}`);
    }
    const content = message?.content;
    if (!content?.trim()) throw new Error("Respuesta OpenAI vacía");
    return content;
  } catch (e) {
    if (!(e instanceof Error) || !/OpenAI HTTP/.test(e.message)) {
      await emitIaLlamada({
        proveedor: "openai",
        modelo: model,
        funcion: meta.funcion,
        tokensEntrada: 0,
        tokensSalida: 0,
        duracionMs: Date.now() - started,
        exito: false,
        error: e instanceof Error ? e.message : String(e),
        detalle: { pagina: meta.pagina, intentoLabel: meta.intentoLabel },
      });
    }
    throw e;
  }
}

async function callOpenAIVisionPage(
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
      callOpenAIVisionRaw(apiKey, mimeType, buffer, prompt, maxTokens, {
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

/** Re-lee solo metadatos del encabezado (página 1) con visión OpenAI. */
export async function extractMetadataOpenAI(input: OpenAIExtractInput): Promise<ExtractResult["metadata"]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY no configurada — no se puede leer el documento con IA");
  }
  if (!input.buffer?.length) {
    throw new Error("Documento sin contenido para leer");
  }

  const page = await firstPageImage(input.buffer, input.mimeType);
  if (!page) {
    throw new Error("No se pudo renderizar la primera página del PDF para lectura con IA");
  }

  const raw = await callOpenAIVisionRaw(
    apiKey,
    page.mimeType,
    page.buffer,
    buildMetadataOnlyPrompt(),
    1024,
    { funcion: "extract_metadata", pagina: 1 }
  );
  return parseExtractJsonContent(raw).metadata ?? {};
}

/** Proveedor OpenAI — visión para imágenes y PDF multipágina (C.11–C.13). */
export async function extractOpenAI(input: OpenAIExtractInput): Promise<ExtractResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return extractMock(input.documentoNombre);
  }

  const isImage = input.mimeType?.startsWith("image/") && input.buffer?.length;
  const isPdf = input.mimeType === "application/pdf" && input.buffer?.length;
  const sourceFileBytes = input.buffer?.length;

  if (isImage) {
    return callOpenAIVisionPage(
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

    const merged = await extractPdfPagesSequential(
      plan.pages,
      (pg) =>
        callOpenAIVisionPage(
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
    return attachProvenanceExtraccion(merged, plan, "openai");
  }

  throw new Error(`Tipo de archivo no soportado para extracción IA: ${input.mimeType ?? "desconocido"}`);
}
