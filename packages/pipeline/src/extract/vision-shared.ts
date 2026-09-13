import type { ExtractResult, ExtractedLine, ExtractedMetadata } from "../types.js";
import { parseMontoChileno } from "../utils/monto-chileno.js";
import { renderPdfToPngPages } from "./pdf-render.js";

export async function firstPageImage(
  buffer: Buffer,
  mimeType?: string
): Promise<{ mimeType: string; buffer: Buffer } | null> {
  if (mimeType?.startsWith("image/")) {
    return { mimeType, buffer };
  }
  if (mimeType === "application/pdf") {
    const pages = await renderPdfToPngPages(buffer, 1);
    if (!pages.length) return null;
    return { mimeType: pages[0]!.mimeType, buffer: pages[0]!.buffer };
  }
  return null;
}

function normalizeJsonText(content: string): string {
  let text = content.trim();
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    if (start >= 0) text = text.slice(start);
    else text = `{${text}`;
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) {
    text = fenced[1]!.trim();
    if (!text.startsWith("{")) text = `{${text}`;
  }
  const end = text.lastIndexOf("}");
  if (end > 0) text = text.slice(0, end + 1);
  return text;
}

/** Parsea JSON de respuesta de modelos de visión (markdown, texto extra, prefijo assistant). */
export function parseExtractJsonContent(content: string): ExtractResult {
  const text = normalizeJsonText(content);
  try {
    return normalizeParsedExtract(JSON.parse(text) as ExtractResult);
  } catch {
    const salvaged = salvageExtractFromNormalizedText(text);
    if (salvaged) return salvaged;
    throw new Error("JSON de extracción inválido o truncado");
  }
}

/** Último recurso: recupera líneas de una respuesta cruda sin relanzar error. */
export function salvageExtractFromRaw(content: string): ExtractResult | null {
  try {
    return parseExtractJsonContent(content);
  } catch {
    return salvageExtractFromNormalizedText(normalizeJsonText(content));
  }
}

function salvageExtractFromNormalizedText(text: string): ExtractResult | null {
  const repaired = repairTruncatedExtractJson(text);
  if (repaired) return normalizeParsedExtract(repaired);
  const partial = extractPartialFromTruncatedJson(text);
  if (partial) return normalizeParsedExtract(partial);
  return null;
}

function normalizeParsedExtract(parsed: ExtractResult): ExtractResult {
  parsed.metadata = parsed.metadata ?? {};
  parsed.lineas = parsed.lineas ?? [];
  return parsed;
}

/** Recupera JSON truncado por límite de tokens (cierra arrays/objetos abiertos). */
function repairTruncatedExtractJson(text: string): ExtractResult | null {
  const candidates = [text, stripBrokenTextoPagina(text), stripFromBrokenStringField(text)];
  for (const candidate of candidates) {
    const closed = closeOpenJsonBrackets(candidate);
    if (!closed) continue;
    try {
      const parsed = JSON.parse(closed) as ExtractResult;
      if (Array.isArray(parsed.lineas) && parsed.lineas.length > 0) return parsed;
      if (parsed.metadata && Object.keys(parsed.metadata).length > 0) return parsed;
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

function stripBrokenTextoPagina(text: string): string {
  const key = '"textoPagina"';
  const idx = text.indexOf(key);
  if (idx < 0) return text;
  const tail = text.slice(idx + key.length);
  const nextField = tail.search(/,\s*"(?:notas|lineas|tipoDocumento|metadata|transcripcionPaginas)"/);
  if (nextField >= 0) {
    return `${text.slice(0, idx).replace(/,\s*$/, "")}${tail.slice(nextField)}`;
  }
  return text.slice(0, idx).replace(/,\s*$/, "");
}

function stripFromBrokenStringField(text: string): string {
  const lastQuote = text.lastIndexOf('"');
  if (lastQuote <= 0) return text;
  const tail = text.slice(lastQuote + 1).trim();
  if (tail.startsWith(",") || tail.startsWith("}") || tail.startsWith("]")) return text;
  return text.slice(0, lastQuote + 1);
}

function closeOpenJsonBrackets(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let slice = text.slice(start).replace(/,\s*$/, "");
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of slice) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inString) slice += '"';
  while (stack.length) slice += stack.pop();
  return slice;
}

function parseMontoFromExtract(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const asNum = Number(trimmed.replace(",", "."));
  if (Number.isFinite(asNum)) return asNum;
  const chileno = parseMontoChileno(trimmed);
  return typeof chileno === "number" && Number.isFinite(chileno) ? chileno : null;
}

function lineFromObject(obj: Record<string, unknown>, paginaDefault = 1): ExtractedLine | null {
  const denominacionOriginal = String(obj.denominacionOriginal ?? "").trim();
  if (!denominacionOriginal) return null;
  let montoOriginal: number | null = null;
  if (typeof obj.montoOriginal === "number") montoOriginal = obj.montoOriginal;
  else if (obj.montoOriginal != null) montoOriginal = parseMontoFromExtract(String(obj.montoOriginal));
  if (montoOriginal == null || Number.isNaN(montoOriginal)) return null;
  return {
    denominacionOriginal,
    montoOriginal,
    paginaNumero: Number(obj.paginaNumero) > 0 ? Number(obj.paginaNumero) : paginaDefault,
    confianzaExtraccion: 70,
    codigoOrigen: obj.codigoOrigen != null ? String(obj.codigoOrigen) : undefined,
    columnaOrigen: obj.columnaOrigen != null ? String(obj.columnaOrigen) : undefined,
  };
}

function extractCompleteLineObjects(text: string, paginaDefault = 1): ExtractedLine[] {
  const idx = text.indexOf('"lineas"');
  if (idx < 0) return [];
  const bracket = text.indexOf("[", idx);
  if (bracket < 0) return [];

  const lineas: ExtractedLine[] = [];
  let i = bracket + 1;
  while (i < text.length) {
    while (i < text.length && text[i] !== "{") {
      if (text[i] === "]") return lineas;
      i++;
    }
    if (i >= text.length || text[i] !== "{") break;

    const start = i;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (; i < text.length; i++) {
      const ch = text[i]!;
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const chunk = text.slice(start, i + 1);
          try {
            const obj = JSON.parse(chunk) as Record<string, unknown>;
            const line = lineFromObject(obj, paginaDefault);
            if (line) lineas.push(line);
          } catch {
            /* objeto incompleto */
          }
          i++;
          break;
        }
      }
    }
    if (depth !== 0) break;
  }
  return lineas;
}

/** Extrae líneas completas aunque el JSON global esté roto. */
function extractPartialFromTruncatedJson(text: string): ExtractResult | null {
  const tipoDocumento =
    /"tipoDocumento"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "desconocido";

  let lineas = extractCompleteLineObjects(text);
  if (lineas.length === 0) {
    lineas = extractLineasByPattern(text);
  }
  if (lineas.length === 0) return null;

  const metadata = extractMetadataFromText(text);
  return { tipoDocumento, metadata, lineas };
}

function extractLineasByPattern(text: string): ExtractedLine[] {
  const lineas: ExtractedLine[] = [];
  const denomRegex = /"denominacionOriginal"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;
  while ((match = denomRegex.exec(text)) !== null) {
    const window = text.slice(match.index, match.index + 900);
    const montoMatch =
      /"montoOriginal"\s*:\s*(-?\d+(?:\.\d+)?|"[^"]*")/.exec(window) ??
      /"montoOriginal"\s*:\s*([^,}\]]+)/.exec(window);
    if (!montoMatch) continue;

    const denominacionOriginal = match[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const rawMonto = montoMatch[1]!.replace(/^"|"$/g, "");
    const montoOriginal = parseMontoFromExtract(rawMonto);
    if (!denominacionOriginal.trim() || montoOriginal == null) continue;

    const paginaMatch = /"paginaNumero"\s*:\s*(\d+)/.exec(window);
    lineas.push({
      denominacionOriginal,
      montoOriginal,
      paginaNumero: paginaMatch ? Number(paginaMatch[1]) : 1,
      confianzaExtraccion: 65,
    });
  }
  return lineas;
}

function extractMetadataFromText(text: string): ExtractedMetadata {
  const metadata: ExtractedMetadata = {};
  const razonSocial = /"razonSocial"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(text)?.[1];
  const rut = /"rut"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(text)?.[1];
  const moneda = /"moneda"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(text)?.[1];
  const ejercicio = /"ejercicio"\s*:\s*(\d{4})/.exec(text)?.[1];
  if (razonSocial) metadata.razonSocial = razonSocial.replace(/\\"/g, '"');
  if (rut) metadata.rut = rut.replace(/\\"/g, '"');
  if (moneda) metadata.moneda = moneda.replace(/\\"/g, '"');
  if (ejercicio) metadata.periodo = { ejercicio: Number(ejercicio) };
  return metadata;
}
