export interface ExtraccionSeccion {
  titulo: string;
  lineas: string[];
}

export interface ExtraccionTextoParseado {
  preamble: string[];
  secciones: ExtraccionSeccion[];
  json: string | null;
}

const JSON_MARKER = "— JSON original de extracción —";
const SECTION_RE = /^— (.+?) —$/;

export function parseExtraccionTexto(texto: string): ExtraccionTextoParseado {
  let body = texto;
  let json: string | null = null;

  const jsonIdx = texto.indexOf(JSON_MARKER);
  if (jsonIdx >= 0) {
    body = texto.slice(0, jsonIdx).trimEnd();
    json = texto.slice(jsonIdx + JSON_MARKER.length).trim();
    try {
      json = JSON.stringify(JSON.parse(json), null, 2);
    } catch {
      /* conservar texto tal cual */
    }
  }

  const lines = body.split("\n");
  const secciones: ExtraccionSeccion[] = [];
  const preamble: string[] = [];
  let current: ExtraccionSeccion | null = null;

  for (const line of lines) {
    const match = line.match(SECTION_RE);
    if (match) {
      if (current) secciones.push(current);
      current = { titulo: match[1], lineas: [] };
    } else if (current) {
      current.lineas.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) secciones.push(current);

  trimBlankEdges(preamble);
  for (const seccion of secciones) trimBlankEdges(seccion.lineas);

  return { preamble, secciones, json };
}

function trimBlankEdges(lines: string[]): void {
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
}

export function seccionEsTabular(titulo: string): boolean {
  const t = titulo.toLowerCase();
  return t.includes("líneas") || t.includes("lineas") || t.includes("totales");
}

export function parseLineaTabular(linea: string): { concepto: string; monto: string } | null {
  const tabIdx = linea.indexOf("\t");
  if (tabIdx < 0) return null;
  return {
    concepto: linea.slice(0, tabIdx).trim(),
    monto: linea.slice(tabIdx + 1).trim(),
  };
}

export function parseJsonPayload(json: string | null): Record<string, unknown> | null {
  if (!json?.trim()) return null;
  try {
    const value = JSON.parse(json) as unknown;
    return value != null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function fmtMontoExtraccion(value: unknown): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-CL").format(value);
}

export function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "json-hl__num";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "json-hl__key" : "json-hl__str";
      } else if (/true|false/.test(match)) {
        cls = "json-hl__bool";
      } else if (/null/.test(match)) {
        cls = "json-hl__null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}
