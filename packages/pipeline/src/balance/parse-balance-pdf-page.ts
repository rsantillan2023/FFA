import { loadPdfDocument } from "../extract/pdf-loader.js";
import { parseMontoChileno } from "../utils/monto-chileno.js";
import { normalizarDenominacion } from "../utils/text.js";

export type SeccionBalancePdf =
  | "activo_nc"
  | "activo_c"
  | "patrimonio"
  | "pasivo_nc"
  | "pasivo_c";

export interface FilaBalancePdf {
  denominacion: string;
  monto: number;
  seccion?: SeccionBalancePdf;
}

const SUFIJO_SECCION: Record<SeccionBalancePdf, string> = {
  activo_nc: " — activo no corriente",
  activo_c: " — activo corriente",
  patrimonio: "",
  pasivo_nc: " — pasivo no corriente",
  pasivo_c: " — pasivo corriente",
};

export function denominacionConSeccionBalance(
  denominacion: string,
  seccion?: SeccionBalancePdf
): string {
  if (!seccion || seccion === "patrimonio") return denominacion;
  const sufijo = SUFIJO_SECCION[seccion];
  if (denominacion.includes(sufijo.trim())) return denominacion;
  return `${denominacion}${sufijo}`;
}

function detectarCambioSeccion(line: string): SeccionBalancePdf | "pasivos_bloque" | null {
  const d = line.trim();
  if (/^activos no corrientes$/i.test(d)) return "activo_nc";
  if (/^activos corrientes$/i.test(d)) return "activo_c";
  if (/^patrimonio y pasivos$/i.test(d)) return "patrimonio";
  if (/^pasivos$/i.test(d)) return "pasivos_bloque";
  if (/^pasivos no corrientes$/i.test(d)) return "pasivo_nc";
  if (/^pasivos corrientes$/i.test(d)) return "pasivo_c";
  return null;
}

/** Texto del PDF agrupado por filas (mejor para tablas de balance). */
export async function extractPdfPageTextRows(
  pdfBuffer: Buffer,
  pageNum: number
): Promise<string> {
  const pdf = await loadPdfDocument(pdfBuffer);
  const page = await pdf.getPage(pageNum);
  const content = await page.getTextContent();

  const items = content.items.flatMap((item) => {
    if (!("str" in item)) return [];
    const tr = item.transform;
    return [{ str: String(item.str), x: tr?.[4] ?? 0, y: tr?.[5] ?? 0 }];
  });

  items.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: Array<{ y: number; parts: typeof items }> = [];
  for (const it of items) {
    const row = rows.find((r) => Math.abs(r.y - it.y) < 3);
    if (row) row.parts.push(it);
    else rows.push({ y: it.y, parts: [it] });
  }

  return rows
    .map((row) => {
      row.parts.sort((a, b) => a.x - b.x);
      return row.parts
        .map((p) => p.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    })
    .filter(Boolean)
    .join("\n");
}

/** Encabezados de sección — no son filas de detalle (coincidencia exacta). */
const SKIP_LINEA_EXACTA =
  /^(tabla|cifras|millones|m\$|activos|pasivos|patrimonio|al 31|de de|negocios no bancarios|negocios bancarios|activos no corrientes|activos corrientes|pasivos no corrientes|pasivos corrientes|patrimonio y pasivos)$/i;

export interface ParseFilasBalanceOpciones {
  /** miles → ×1e3, millones → ×1e6; por defecto infiere desde escala. */
  escala?: string;
  escalaFactor?: number;
}

/** Multiplicador para pasar cifras del PDF a montoOriginal (unidades del caso, p. ej. M$). */
export function multiplicadorMontoBalancePdf(opts?: ParseFilasBalanceOpciones): number {
  const factor = opts?.escalaFactor;
  const escala = opts?.escala?.toLowerCase();
  if (factor === 1_000_000 || escala === "millones") return 1;
  if (factor === 1_000 || escala === "miles") return 1;
  if (factor === 1 || escala === "unidades") return 1;
  return 1;
}

/** Parsea filas de detalle del balance (columna vigente = primer monto). */
export function parseFilasBalancePdfPage(
  text: string,
  opts?: ParseFilasBalanceOpciones
): FilaBalancePdf[] {
  const filas: FilaBalancePdf[] = [];
  let seccion: SeccionBalancePdf | undefined;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const cambio = detectarCambioSeccion(line);
    if (cambio === "pasivos_bloque") {
      seccion = undefined;
      continue;
    }
    if (cambio) {
      seccion = cambio;
      continue;
    }

    const match = line.match(/^(.+?)\s+([\d.,()\-]+)\s+([\d.,()\-]+)\s*$/);
    if (!match) continue;

    const denominacion = match[1].trim();
    if (SKIP_LINEA_EXACTA.test(denominacion)) continue;
    if (/\btotales$/i.test(denominacion)) continue;
    if (/^total\b/i.test(denominacion)) continue;
    if (/^patrimonio atribuible/i.test(denominacion)) continue;
    if (/^patrimonio total$/i.test(denominacion)) continue;

    const montoPdf = parseMontoChileno(match[2]);
    if (!Number.isFinite(montoPdf) || montoPdf === 0) continue;

    filas.push({
      denominacion,
      monto: Math.round(montoPdf * multiplicadorMontoBalancePdf(opts)),
      seccion,
    });
  }

  return filas;
}

/** Tolerancia para emparejar montos de balance (evita confundir p. ej. 1.301M vs 1.303M). */
export const TOLERANCIA_MONTO_BALANCE_REL = 0.0001;
export const TOLERANCIA_MONTO_BALANCE_ABS = 500_000;

export function montosCoinciden(
  a: number,
  b: number,
  toleranciaRel = TOLERANCIA_MONTO_BALANCE_REL
): boolean {
  const ma = Math.abs(a);
  const mb = Math.abs(b);
  if (ma === 0 && mb === 0) return true;
  const diff = Math.abs(ma - mb);
  if (diff <= TOLERANCIA_MONTO_BALANCE_ABS) return true;
  return diff / Math.max(ma, mb, 1) <= toleranciaRel;
}

function denominacionesBalanceCompatibles(normA: string, normB: string): boolean {
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;
  const baseA = normA.replace(/\s+(activo|pasivo)\s+(no\s+)?corriente$/, "");
  const baseB = normB.replace(/\s+(activo|pasivo)\s+(no\s+)?corriente$/, "");
  return baseA === baseB || baseA.includes(baseB) || baseB.includes(baseA);
}

/** Busca la fila PDF que mejor coincide con un monto (exacto > cercano > hint denominación). */
export function buscarFilaPdfPorMonto(
  filas: FilaBalancePdf[],
  monto: number,
  opciones?: { denominacionHint?: string }
): FilaBalancePdf | undefined {
  const exactas = filas.filter((f) => f.monto === monto);
  if (exactas.length === 1) return exactas[0];
  if (exactas.length > 1 && opciones?.denominacionHint) {
    const hint = normalizarDenominacion(opciones.denominacionHint);
    const porHint = exactas.find((f) =>
      denominacionesBalanceCompatibles(normalizarDenominacion(f.denominacion), hint)
    );
    if (porHint) return porHint;
  }

  const candidatas = filas
    .filter((f) => montosCoinciden(f.monto, monto))
    .sort((a, b) => Math.abs(a.monto - monto) - Math.abs(b.monto - monto));
  if (candidatas.length === 0) return undefined;
  if (candidatas.length === 1) return candidatas[0];

  if (opciones?.denominacionHint) {
    const hint = normalizarDenominacion(opciones.denominacionHint);
    const porHint = candidatas.find((f) =>
      denominacionesBalanceCompatibles(normalizarDenominacion(f.denominacion), hint)
    );
    if (porHint) return porHint;
  }

  return candidatas[0];
}

export function filaPdfYaExiste(
  fila: FilaBalancePdf,
  lineas: Array<{ denominacionOriginal: string; montoOriginal: number; montoNormalizado?: number }>
): boolean {
  const normFila = normalizarDenominacion(fila.denominacion);
  for (const l of lineas) {
    const m = l.montoNormalizado ?? l.montoOriginal;
    if (!montosCoinciden(m, fila.monto)) continue;
    const normL = normalizarDenominacion(l.denominacionOriginal);
    if (denominacionesBalanceCompatibles(normL, normFila)) return true;
  }
  return false;
}
