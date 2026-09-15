import { emitIaLlamada } from "../ia/registrar-llamada.js";
import { anthropicDisponible, openAiDisponible } from "./resolve-provider.js";
import type { PageTextScan } from "./pdf-text-scan.js";
import type { SeccionPagina } from "../types.js";
import { SECCIONES_CANONICAS_OBLIGATORIAS } from "./pdf-page-select.js";

export interface ClaudePageMapResult {
  paginasExtraer: number[];
  seccionesPorPagina: Map<number, SeccionPagina>;
  proveedor: "anthropic" | "openai";
  modelo: string;
}

function claudeMapEnabled(): boolean {
  const flag = process.env.PDF_CLAUDE_PAGE_MAP?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return anthropicDisponible() || openAiDisponible();
}

function claudeMapMinPages(): number {
  const n = Number(process.env.PDF_CLAUDE_MAP_MIN_PAGES ?? 20);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

function mapTimeoutMs(): number {
  const n = Number(process.env.PDF_CLAUDE_MAP_TIMEOUT_MS ?? 120_000);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

function snippet(text: string, max = 280): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function buildPageIndexPrompt(scans: PageTextScan[], totalPages: number, maxPages: number): string {
  const indice = scans.map((s) => ({
    pagina: s.pageNum,
    seccion_heuristica: s.seccion,
    score: s.score,
    titulo_canonico: Boolean(s.tituloCanonico),
    extracto: snippet(s.text),
  }));

  return `Sos un contador experto analizando un PDF de estados financieros de ${totalPages} páginas.

Te paso un índice de TODAS las páginas (número, sección heurística previa, extracto de texto).
Tu tarea: elegir qué páginas deben enviarse a extracción con visión IA.

OBJETIVO: incluir SIEMPRE las páginas con:
- Balance / estado de situación financiera (activo, pasivo, patrimonio — puede estar partido en 2 páginas)
- Estado de resultados / resultado integral
- Estado de flujos de efectivo
- Página 1 (portada / metadatos) si aporta moneda, escala o periodo

EXCLUIR en lo posible: notas al pie extensas, informes de auditoría, narrativa MD&A, anexos sin tablas numéricas.

LÍMITE: máximo ${maxPages} páginas en "paginas_extraer" (priorizá estados financieros canónicos).

ÍNDICE DE PÁGINAS:
${JSON.stringify(indice, null, 2)}

Respondé SOLO JSON válido:
{
  "paginas_extraer": [1, 24, 26, ...],
  "secciones": { "24": "balance", "26": "resultados" },
  "razonamiento": "<breve explicación>"
}

Valores válidos para secciones: balance, resultados, flujo_efectivo, notas, resumen_ejecutivo, operativo, segmentos, otro.`;
}

function parseMapJson(content: string): {
  paginas_extraer?: number[];
  secciones?: Record<string, string>;
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
    paginas_extraer?: number[];
    secciones?: Record<string, string>;
  };
}

async function callAnthropicMap(prompt: string): Promise<{ text: string; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("Anthropic no configurado");

  const models = [
    process.env.ANTHROPIC_EXTRACT_MODEL?.trim(),
    "claude-sonnet-4-6",
    "claude-sonnet-5",
  ].filter(Boolean) as string[];

  let lastError = "Error desconocido";
  for (const model of [...new Set(models)]) {
    const started = Date.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(mapTimeoutMs()),
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.status === 404) {
      lastError = `modelo ${model} no encontrado`;
      continue;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }

    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    await emitIaLlamada({
      proveedor: "anthropic",
      modelo: model,
      funcion: "pdf_mapa_paginas",
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

async function callOpenAiMap(prompt: string): Promise<{ text: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenAI no configurado");

  const model = process.env.OPENAI_EXTRACT_MODEL?.trim() || "gpt-4o-mini";
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(mapTimeoutMs()),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Planificador de extracción PDF contable. Respondé solo JSON válido.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  await emitIaLlamada({
    proveedor: "openai",
    modelo: model,
    funcion: "pdf_mapa_paginas",
    tokensEntrada: body.usage?.prompt_tokens ?? 0,
    tokensSalida: body.usage?.completion_tokens ?? 0,
    duracionMs: Date.now() - started,
    exito: true,
  });

  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI devolvió respuesta vacía");
  return { text, model };
}

function normalizeSeccion(raw: string | undefined): SeccionPagina {
  const s = (raw ?? "otro").toLowerCase() as SeccionPagina;
  const valid: SeccionPagina[] = [
    "balance",
    "resultados",
    "flujo_efectivo",
    "notas",
    "resumen_ejecutivo",
    "operativo",
    "segmentos",
    "otro",
  ];
  return valid.includes(s) ? s : "otro";
}

/** Garantiza páginas canónicas detectadas por heurística aunque Claude las omita. */
function mergeWithHeuristicMandatory(
  claudePages: number[],
  scans: PageTextScan[],
  maxPages: number
): number[] {
  const mandatory = new Set<number>();
  for (const s of scans) {
    if (SECCIONES_CANONICAS_OBLIGATORIAS.includes(s.seccion) && s.score >= 40) {
      mandatory.add(s.pageNum);
    }
  }
  if (scans.some((s) => s.pageNum === 1)) mandatory.add(1);

  const optional = [...new Set(claudePages)].filter((p) => !mandatory.has(p)).sort((a, b) => a - b);
  const merged = [...[...mandatory].sort((a, b) => a - b), ...optional];
  return [...new Set(merged)].slice(0, maxPages);
}

/**
 * Claude planifica qué páginas extraer en PDFs largos (Molinos 177+ pág.).
 * Fallback: null → usar heurística existente.
 */
export async function planPaginasConClaudeMap(
  scans: PageTextScan[],
  totalPages: number,
  maxPages: number
): Promise<ClaudePageMapResult | null> {
  if (!claudeMapEnabled()) return null;
  if (totalPages < claudeMapMinPages()) return null;
  if (scans.length === 0) return null;

  const prompt = buildPageIndexPrompt(scans, totalPages, maxPages);

  let text: string;
  let proveedor: "anthropic" | "openai";
  let modelo: string;

  if (anthropicDisponible()) {
    try {
      const r = await callAnthropicMap(prompt);
      text = r.text;
      proveedor = "anthropic";
      modelo = r.model;
    } catch {
      if (!openAiDisponible()) return null;
      const r = await callOpenAiMap(prompt);
      text = r.text;
      proveedor = "openai";
      modelo = r.model;
    }
  } else if (openAiDisponible()) {
    const r = await callOpenAiMap(prompt);
    text = r.text;
    proveedor = "openai";
    modelo = r.model;
  } else {
    return null;
  }

  const parsed = parseMapJson(text);
  const rawPages = (parsed.paginas_extraer ?? [])
    .map((n) => Math.round(Number(n)))
    .filter((n) => n >= 1 && n <= totalPages);

  if (rawPages.length === 0) return null;

  const paginasExtraer = mergeWithHeuristicMandatory(rawPages, scans, maxPages);
  const seccionesPorPagina = new Map<number, SeccionPagina>();

  for (const p of paginasExtraer) {
    const fromClaude = parsed.secciones?.[String(p)];
    if (fromClaude) {
      seccionesPorPagina.set(p, normalizeSeccion(fromClaude));
      continue;
    }
    const scan = scans.find((s) => s.pageNum === p);
    seccionesPorPagina.set(p, scan?.seccion ?? "otro");
  }

  return { paginasExtraer, seccionesPorPagina, proveedor, modelo };
}
