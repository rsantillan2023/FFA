import { emitIaLlamada } from "../ia/registrar-llamada.js";
import { anthropicDisponible, openAiDisponible } from "../extract/resolve-provider.js";

export interface DiagnosticoCuadraturaInput {
  totales: {
    activo: number;
    pasivo: number;
    patrimonio: number;
    diferencia: number;
    cuadraturaOk: boolean;
  };
  testigoActivo?: number;
  testigoPasivoPatrimonio?: number;
  paginasBalance?: number[];
  lineasResumen?: Array<{
    denominacion: string;
    monto: number;
    rubroCodigo?: string;
    pagina?: number;
    excluida?: boolean;
  }>;
  contexto?: { moneda?: string; escala?: string; razonSocial?: string };
}

export interface DiagnosticoCuadraturaIaResult {
  resumen: string;
  causasProbables: string[];
  accionesSugeridas: string[];
  proveedor: "anthropic" | "openai";
  modelo: string;
}

function diagnosticoHabilitado(): boolean {
  const flag = process.env.CUADRATURA_IA_DIAGNOSTICO?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return anthropicDisponible() || openAiDisponible();
}

function timeoutMs(): number {
  const n = Number(process.env.CUADRATURA_IA_TIMEOUT_MS ?? 90_000);
  return Number.isFinite(n) && n > 0 ? n : 90_000;
}

function buildPrompt(input: DiagnosticoCuadraturaInput): string {
  const t = input.totales;
  const lineas =
    input.lineasResumen
      ?.slice(0, 40)
      .map(
        (l) =>
          `- p${l.pagina ?? "?"} | ${l.rubroCodigo ?? "?"} | ${l.denominacion.slice(0, 60)} | ${l.monto}${l.excluida ? " [excluida]" : ""}`
      )
      .join("\n") ?? "(sin detalle de líneas)";

  return `Sos un contador auditor. Un balance procesado automáticamente NO CUADRA (Activo ≠ Pasivo + Patrimonio).

DATOS DEL CASO:
${input.contexto?.razonSocial ? `- Empresa: ${input.contexto.razonSocial}` : ""}
${input.contexto?.moneda ? `- Moneda: ${input.contexto.moneda}` : ""}
${input.contexto?.escala ? `- Escala: ${input.contexto.escala}` : ""}
${input.paginasBalance?.length ? `- Páginas balance objetivo: ${input.paginasBalance.join(", ")}` : ""}

TOTALES PROCESO:
- Activo: ${t.activo}
- Pasivo: ${t.pasivo}
- Patrimonio: ${t.patrimonio}
- Diferencia (A − P − PN): ${t.diferencia}
${input.testigoActivo != null ? `- Testigo PDF activo: ${input.testigoActivo}` : ""}
${input.testigoPasivoPatrimonio != null ? `- Testigo PDF pasivo+patrimonio: ${input.testigoPasivoPatrimonio}` : ""}

MUESTRA DE LÍNEAS (máx 40):
${lineas}

Respondé SOLO JSON:
{
  "resumen": "<2-3 oraciones en español>",
  "causas_probables": ["...", "..."],
  "acciones_sugeridas": ["...", "..."]
}

No inventes montos. Enfocate en causas típicas: escala mal aplicada, páginas ER mezcladas en balance, patrimonio en pasivo, duplicados, totales incluidos como detalle, líneas faltantes del PDF.`;
}

function parseJson(content: string): {
  resumen?: string;
  causas_probables?: string[];
  acciones_sugeridas?: string[];
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
    resumen?: string;
    causas_probables?: string[];
    acciones_sugeridas?: string[];
  };
}

async function callAnthropic(prompt: string): Promise<{ text: string; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("Anthropic no configurado");

  const model =
    process.env.ANTHROPIC_CLASIFICACION_MODEL?.trim() ||
    process.env.ANTHROPIC_EXTRACT_MODEL?.trim() ||
    "claude-sonnet-4-6";

  const started = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs()),
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

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
    funcion: "diagnostico_cuadratura_ia",
    tokensEntrada: body.usage?.input_tokens ?? 0,
    tokensSalida: body.usage?.output_tokens ?? 0,
    duracionMs: Date.now() - started,
    exito: true,
  });

  const text = body.content?.find((c) => c.type === "text")?.text?.trim();
  if (!text) throw new Error("Respuesta vacía");
  return { text, model };
}

async function callOpenAi(prompt: string): Promise<{ text: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenAI no configurado");

  const model = process.env.OPENAI_CLASIFICACION_MODEL?.trim() || "gpt-4o-mini";
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs()),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Auditor contable. Respondé solo JSON válido." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  await emitIaLlamada({
    proveedor: "openai",
    modelo: model,
    funcion: "diagnostico_cuadratura_ia",
    tokensEntrada: body.usage?.prompt_tokens ?? 0,
    tokensSalida: body.usage?.completion_tokens ?? 0,
    duracionMs: Date.now() - started,
    exito: true,
  });

  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Respuesta vacía");
  return { text, model };
}

/** Diagnóstico IA cuando la cuadratura no cierra — sin crear ajustes sintéticos. */
export async function diagnosticarCuadraturaIa(
  input: DiagnosticoCuadraturaInput
): Promise<DiagnosticoCuadraturaIaResult | null> {
  if (input.totales.cuadraturaOk) return null;
  if (!diagnosticoHabilitado()) return null;

  const prompt = buildPrompt(input);

  let text: string;
  let proveedor: "anthropic" | "openai";
  let modelo: string;

  if (anthropicDisponible()) {
    try {
      const r = await callAnthropic(prompt);
      text = r.text;
      proveedor = "anthropic";
      modelo = r.model;
    } catch {
      if (!openAiDisponible()) return null;
      const r = await callOpenAi(prompt);
      text = r.text;
      proveedor = "openai";
      modelo = r.model;
    }
  } else if (openAiDisponible()) {
    const r = await callOpenAi(prompt);
    text = r.text;
    proveedor = "openai";
    modelo = r.model;
  } else {
    return null;
  }

  const parsed = parseJson(text);
  return {
    resumen: (parsed.resumen ?? "").trim() || "No se pudo generar resumen.",
    causasProbables: (parsed.causas_probables ?? []).filter(Boolean).slice(0, 8),
    accionesSugeridas: (parsed.acciones_sugeridas ?? []).filter(Boolean).slice(0, 8),
    proveedor,
    modelo,
  };
}
