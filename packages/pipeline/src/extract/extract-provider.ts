import type { ExtractResult } from "../types.js";

import { runWithIaContext } from "../ia/ia-context.js";
import { extractAnthropic } from "./anthropic-provider.js";

import { extractMock } from "./mock-provider.js";

import { extractOpenAI } from "./openai-provider.js";

import { anthropicDisponible } from "./resolve-provider.js";

import { postProcessExtractResult } from "./post-process-extract.js";
import { sanitizeExtractResult, validateExtractResult } from "./validate-schema.js";

function prepareExtractResult(result: ExtractResult): ExtractResult {
  const sanitized = sanitizeExtractResult(result);
  const processed = postProcessExtractResult(sanitized);
  validateExtractResult(processed);
  return processed;
}



export type ExtractionProviderName = "mock" | "openai" | "anthropic";



export interface ExtractDocumentInput {

  provider: ExtractionProviderName;

  documentoNombre: string;

  mimeType?: string;

  buffer?: Buffer;

  tipoHint?: string;

}



type VisionExtractInput = Omit<ExtractDocumentInput, "provider">;



async function runVisionExtract(

  provider: ExtractionProviderName,

  input: VisionExtractInput

): Promise<ExtractResult> {

  if (provider === "anthropic") {

    return extractAnthropic(input);

  }

  return extractOpenAI(input);

}



/** OpenAI primero; si falla y hay ANTHROPIC_API_KEY, reintenta con Claude. */

async function extractOpenAiWithAnthropicFallback(

  input: VisionExtractInput

): Promise<ExtractResult> {

  try {

    const result = await extractOpenAI(input);

    return prepareExtractResult(result);

  } catch (openAiErr) {

    if (!anthropicDisponible()) throw openAiErr;

    try {

      const result = await runWithIaContext({ actorTipo: "sistema", esRespaldoAnthropic: true }, () =>
        extractAnthropic(input)
      );

      return prepareExtractResult(result);

    } catch (anthropicErr) {

      const oMsg = openAiErr instanceof Error ? openAiErr.message : String(openAiErr);

      const aMsg = anthropicErr instanceof Error ? anthropicErr.message : String(anthropicErr);

      if (/se requiere al menos una línea|sin líneas/i.test(oMsg)) {
        throw openAiErr instanceof Error ? openAiErr : new Error(oMsg);
      }

      throw new Error(`OpenAI falló (${oMsg}); Anthropic falló (${aMsg})`);

    }

  }

}



export async function extractDocument(input: ExtractDocumentInput): Promise<ExtractResult> {

  const visionInput: VisionExtractInput = {

    documentoNombre: input.documentoNombre,

    mimeType: input.mimeType,

    buffer: input.buffer,

    tipoHint: input.tipoHint,

  };



  let result: ExtractResult;



  switch (input.provider) {

    case "openai":

      result = await extractOpenAiWithAnthropicFallback(visionInput);

      break;

    case "anthropic":

      result = prepareExtractResult(await runVisionExtract("anthropic", visionInput));

      break;

    default:

      result = prepareExtractResult(extractMock(input.documentoNombre));

  }



  return result;

}



export { validateExtractResult, ExtractValidationError } from "./validate-schema.js";


