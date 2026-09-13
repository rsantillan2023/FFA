import { emitIaLlamada } from "../ia/registrar-llamada.js";
import type { RubroRef } from "../types.js";
import { anthropicDisponible, openAiDisponible } from "../extract/resolve-provider.js";
import { scoreRubroCandidates } from "./classify-lines.js";

const MAX_RUBROS_PROMPT = 25;
const MAX_LINEAS_PAGINA = 8;

export interface SugerirClasificacionIaInput {
  denominacionOriginal: string;
  montoNormalizado?: number;
  paginaNumero?: number;
  codigoOrigen?: string;
  columnaOrigen?: string;
  rubroActualId?: string;
  rubroActualCodigo?: string;
  candidatosHeuristicos?: Array<{ codigo: string; nombre: string; score: number }>;
  rubros: RubroRef[];
  contextoCaso?: {
    moneda?: string;
    escala?: string;
    razonSocial?: string;
    lineasMismaPagina?: string[];
  };
}

export interface SugerenciaClasificacionIaResult {
  rubroInstitucionalId: string;
  rubroCodigo: string;
  rubroNombre: string;
  confianza: number;
  razonamiento: string;
  proveedor: "anthropic" | "openai";
  modelo: string;
}

export class ClasificacionIaNoDisponibleError extends Error {
  constructor(message = "No hay proveedor de IA configurado para clasificación") {
    super(message);
    this.name = "ClasificacionIaNoDisponibleError";
  }
}

function buildShortlist(input: SugerirClasificacionIaInput): RubroRef[] {
  const linea = {
    denominacionOriginal: input.denominacionOriginal,
    montoOriginal: input.montoNormalizado ?? 0,
    paginaNumero: input.paginaNumero ?? 1,
    denominacionNormalizada: input.denominacionOriginal,
    montoNormalizado: input.montoNormalizado ?? 0,
    signoAplicado: "positivo" as const,
    codigoOrigen: input.codigoOrigen,
    columnaOrigen: input.columnaOrigen,
  };

  const scored = scoreRubroCandidates(linea, input.rubros);
  const byId = new Map(input.rubros.map((r) => [r.id, r]));
  const shortlist: RubroRef[] = [];

  for (const c of scored) {
    const rubro = byId.get(c.rubroInstitucionalId);
    if (rubro && !shortlist.some((s) => s.id === rubro.id)) {
      shortlist.push(rubro);
    }
    if (shortlist.length >= MAX_RUBROS_PROMPT) break;
  }

  if (input.rubroActualId) {
    const actual = byId.get(input.rubroActualId);
    if (actual && !shortlist.some((s) => s.id === actual.id)) {
      shortlist.unshift(actual);
    }
  }

  if (shortlist.length < 10) {
    for (const rubro of input.rubros) {
      if (shortlist.some((s) => s.id === rubro.id)) continue;
      shortlist.push(rubro);
      if (shortlist.length >= MAX_RUBROS_PROMPT) break;
    }
  }

  return shortlist.slice(0, MAX_RUBROS_PROMPT);
}

function buildPrompt(input: SugerirClasificacionIaInput, shortlist: RubroRef[]): string {
  const rubrosJson = shortlist.map((r) => ({
    codigo: r.codigo,
    nombre: r.nombre,
    estado_financiero: r.estadoFinanciero,
    aliases: r.aliases?.slice(0, 5) ?? [],
  }));

  const ctx = input.contextoCaso;
  const lineasPagina = ctx?.lineasMismaPagina?.slice(0, MAX_LINEAS_PAGINA) ?? [];

  return `Sos un contador experto. Clasificá UNA línea contable en el rubro del plan de cuentas institucional más adecuado.

LÍNEA A CLASIFICAR:
- Denominación: "${input.denominacionOriginal}"
- Monto normalizado: ${input.montoNormalizado ?? "desconocido"}
- Página: ${input.paginaNumero ?? "?"}
${input.codigoOrigen ? `- Código origen documento: ${input.codigoOrigen}` : ""}
${input.columnaOrigen ? `- Columna origen: ${input.columnaOrigen}` : ""}
${input.rubroActualCodigo ? `- Rubro propuesto por heurística: ${input.rubroActualCodigo}` : ""}

CONTEXTO DEL CASO:
${ctx?.razonSocial ? `- Empresa: ${ctx.razonSocial}` : ""}
${ctx?.moneda ? `- Moneda: ${ctx.moneda}` : ""}
${ctx?.escala ? `- Escala: ${ctx.escala}` : ""}
${lineasPagina.length ? `- Otras líneas en la misma página: ${lineasPagina.map((l) => `"${l}"`).join(", ")}` : ""}
${
  input.candidatosHeuristicos?.length
    ? `- Candidatos heurísticos previos: ${input.candidatosHeuristicos
        .slice(0, 3)
        .map((c) => `${c.codigo} (${c.score}%)`)
        .join(", ")}`
    : ""
}

RUBROS VÁLIDOS (elegí EXACTAMENTE uno de esta lista por código):
${JSON.stringify(rubrosJson, null, 2)}

Respondé SOLO con JSON válido (sin markdown):
{
  "rubro_codigo": "<código exacto de la lista>",
  "confianza": <entero 0-100>,
  "razonamiento": "<1-3 oraciones en español explicando por qué>"
}

Reglas:
- rubro_codigo DEBE existir en la lista de rubros válidos.
- Si ningún rubro encaja bien, elegí el más cercano pero confianza ≤ 50.
- Considerá estado financiero (activo/pasivo/patrimonio/resultados) según el significado contable.`;
}

function parseLlmJson(content: string): {
  rubro_codigo?: string;
  confianza?: number;
  razonamiento?: string;
} {
  let text = content.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) text = fenced[1]!.trim();
  else {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
  }
  return JSON.parse(text) as {
    rubro_codigo?: string;
    confianza?: number;
    razonamiento?: string;
  };
}

function anthropicModels(): string[] {
  const configured = process.env.ANTHROPIC_CLASIFICACION_MODEL?.trim();
  const fallbacks = ["claude-sonnet-4-6", "claude-sonnet-5"];
  return [...new Set([configured, ...fallbacks].filter(Boolean))] as string[];
}

function openAiModel(): string {
  return process.env.OPENAI_CLASIFICACION_MODEL?.trim() || "gpt-4o-mini";
}

function clasificacionTimeoutMs(): number {
  const n = Number(process.env.CLASIFICACION_IA_TIMEOUT_MS ?? 90_000);
  return Number.isFinite(n) && n > 0 ? n : 90_000;
}

async function callAnthropic(prompt: string): Promise<{ text: string; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new ClasificacionIaNoDisponibleError();

  let lastError = "Error desconocido";
  for (const model of anthropicModels()) {
    const started = Date.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(clasificacionTimeoutMs()),
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.status === 404) {
      lastError = `modelo ${model} no encontrado`;
      await emitIaLlamada({
        proveedor: "anthropic",
        modelo: model,
        funcion: "clasificacion_revision_ia",
        tokensEntrada: 0,
        tokensSalida: 0,
        duracionMs: Date.now() - started,
        exito: false,
        error: lastError,
      });
      continue;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    }

    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    await emitIaLlamada({
      proveedor: "anthropic",
      modelo: model,
      funcion: "clasificacion_revision_ia",
      tokensEntrada: body.usage?.input_tokens ?? 0,
      tokensSalida: body.usage?.output_tokens ?? 0,
      duracionMs: Date.now() - started,
      exito: true,
    });

    const text = body.content?.find((c) => c.type === "text")?.text?.trim();
    if (!text) throw new Error("Anthropic devolvió respuesta vacía");
    return { text, model };
  }

  throw new Error(`Ningún modelo Anthropic disponible (${lastError})`);
}

async function callOpenAi(prompt: string): Promise<{ text: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ClasificacionIaNoDisponibleError();

  const model = openAiModel();
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(clasificacionTimeoutMs()),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Clasificador contable. Respondé únicamente con JSON válido según el formato solicitado.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const errMsg = `OpenAI HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`;
    await emitIaLlamada({
      proveedor: "openai",
      modelo: model,
      funcion: "clasificacion_revision_ia",
      tokensEntrada: 0,
      tokensSalida: 0,
      duracionMs: Date.now() - started,
      exito: false,
      error: errMsg,
    });
    throw new Error(errMsg);
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  await emitIaLlamada({
    proveedor: "openai",
    modelo: model,
    funcion: "clasificacion_revision_ia",
    tokensEntrada: body.usage?.prompt_tokens ?? 0,
    tokensSalida: body.usage?.completion_tokens ?? 0,
    duracionMs: Date.now() - started,
    exito: true,
  });

  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI devolvió respuesta vacía");
  return { text, model };
}

async function callLlm(prompt: string): Promise<{ text: string; proveedor: "anthropic" | "openai"; model: string }> {
  if (anthropicDisponible()) {
    try {
      const { text, model } = await callAnthropic(prompt);
      return { text, proveedor: "anthropic", model };
    } catch (e) {
      if (!openAiDisponible()) throw e;
    }
  }
  if (openAiDisponible()) {
    const { text, model } = await callOpenAi(prompt);
    return { text, proveedor: "openai", model };
  }
  throw new ClasificacionIaNoDisponibleError();
}

export async function sugerirClasificacionIa(
  input: SugerirClasificacionIaInput
): Promise<SugerenciaClasificacionIaResult> {
  if (!input.rubros.length) {
    throw new Error("No hay rubros disponibles en el plan de cuentas");
  }

  const shortlist = buildShortlist(input);
  const prompt = buildPrompt(input, shortlist);
  const { text, proveedor, model } = await callLlm(prompt);
  const parsed = parseLlmJson(text);

  const codigo = parsed.rubro_codigo?.trim();
  if (!codigo) {
    throw new Error("La IA no devolvió un código de rubro válido");
  }

  const rubro = shortlist.find((r) => r.codigo === codigo);
  if (!rubro) {
    throw new Error(`La IA sugirió el rubro "${codigo}" que no está en la lista permitida`);
  }

  const confianza = Math.min(100, Math.max(0, Math.round(Number(parsed.confianza) || 0)));
  const razonamiento = (parsed.razonamiento ?? "").trim() || "Sin explicación adicional.";

  return {
    rubroInstitucionalId: rubro.id,
    rubroCodigo: rubro.codigo,
    rubroNombre: rubro.nombre,
    confianza,
    razonamiento,
    proveedor,
    modelo: model,
  };
}
