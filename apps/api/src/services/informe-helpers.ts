import {
  CasoModel,
  DocumentoFuenteModel,
  LineaContableModel,
  ValidacionResultadoModel,
  type FichaCanonicaDocument,
} from "@ffa/db";
import { resolveIdentidadCaso } from "@ffa/shared";

export type IdentidadInforme = {
  razonSocial: string;
  rut: string;
  ejercicio?: number | null;
};

/** Identidad para el informe: documento real → contribuyente → referencia de carga (nunca placeholder demo). */
export async function resolveIdentidadInforme(
  casoId: string,
  contrib?: { razonSocial?: string | null; rut?: string | null } | null,
  casoEjercicio?: number | null
): Promise<IdentidadInforme> {
  const [docs, caso] = await Promise.all([
    DocumentoFuenteModel.find({ casoId }).sort({ "recepcion.at": 1 }),
    CasoModel.findById(casoId).select("referencia periodo"),
  ]);

  let docMeta = docs[0]?.extractMetadata;
  for (const doc of docs) {
    const meta = doc.extractMetadata;
    if (meta?.razonSocial?.trim() || meta?.rut?.trim()) {
      docMeta = meta;
      break;
    }
  }

  const ejercicioDoc = docMeta?.periodo?.ejercicio;
  const resolved = resolveIdentidadCaso({
    extractMetadata: docMeta,
    contribuyente: contrib,
    referencia: caso?.referencia,
  });

  return {
    razonSocial: resolved.razonSocial || "—",
    rut: resolved.rut,
    ejercicio: ejercicioDoc ?? caso?.periodo?.ejercicio ?? casoEjercicio ?? null,
  };
}

export type FilaInforme2 = [string, string];
export type FilaInforme3 = [string, string, string];

export const INDICADOR_NOMBRES: Record<string, string> = {
  LIQ_CORRIENTE: "Liquidez corriente",
  END_TOTAL: "Endeudamiento total",
  MARGEN_BRUTO: "Margen bruto aprox.",
  CAP_TRABAJO: "Capital de trabajo",
  COBERTURA_PAT: "Cobertura patrimonial",
};

const ESCALA_FACTOR: Record<string, number> = {
  unidades: 1,
  miles: 1_000,
  millones: 1_000_000,
};

export function fmtNumero(
  value: number | null | undefined,
  maximumFractionDigits = 0
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-CL", {
    useGrouping: true,
    maximumFractionDigits,
  }).format(value);
}

export function fmtMonto(
  value: number | null | undefined,
  moneda = "CLP",
  escala = "miles"
): string {
  if (value == null || Number.isNaN(value)) return "—";
  const factor = ESCALA_FACTOR[escala] ?? 1_000;
  const real = value * factor;
  const formatted = fmtNumero(real);
  const escalaLabel = escala === "unidades" ? "" : ` (${escala})`;
  return `${moneda} ${formatted}${escalaLabel}`;
}

export function fmtIndicadorValor(
  codigo: string,
  valor: number | null | undefined,
  opts?: { moneda?: string; escala?: string }
): string {
  if (valor == null || Number.isNaN(valor)) return "—";
  if (codigo === "END_TOTAL" || codigo === "MARGEN_BRUTO") {
    return `${(valor * 100).toFixed(1)}%`;
  }
  if (codigo === "CAP_TRABAJO") {
    if (opts?.moneda && opts?.escala) {
      return fmtMonto(valor, opts.moneda, opts.escala);
    }
    return fmtNumero(valor);
  }
  return `${valor.toFixed(2)}×`;
}

export function indicadorNombre(codigo: string): string {
  return INDICADOR_NOMBRES[codigo] ?? codigo;
}

export async function filasDetalleTrazabilidad(
  ficha: FichaCanonicaDocument,
  opts?: { moneda?: string; escala?: string }
): Promise<FilaInforme3[]> {
  const moneda = opts?.moneda ?? "CLP";
  const escala = opts?.escala ?? "miles";
  const detalle = [
    ...(ficha.balance?.detalle ?? []),
    ...(ficha.estadoResultados?.detalle ?? []),
  ];
  const lineaIds: string[] = [];
  for (const d of detalle) {
    for (const id of d.lineasIds ?? []) {
      lineaIds.push(id.toString());
    }
  }
  if (!lineaIds.length) return [];

  const lineas = await LineaContableModel.find({ _id: { $in: lineaIds } });
  const docIds = [
    ...new Set(lineas.map((l) => l.documentoId?.toString()).filter(Boolean) as string[]),
  ];
  const docs = await DocumentoFuenteModel.find({ _id: { $in: docIds } });
  const docNames = new Map(docs.map((d) => [d._id.toString(), d.nombreOriginal]));

  return lineas.map((l) => {
    const raw = l.montoNormalizado ?? l.montoOriginal;
    const montoFmt =
      raw != null && !Number.isNaN(Number(raw)) ? fmtMonto(Number(raw), moneda, escala) : "—";
    return [
      l.denominacionOriginal,
      montoFmt,
      `${docNames.get(l.documentoId?.toString() ?? "") ?? "—"}, pág. ${l.paginaNumero ?? "—"}`,
    ];
  });
}

export async function filasInconsistencias(casoId: string): Promise<FilaInforme3[]> {
  const vals = await ValidacionResultadoModel.find({
    casoId,
    passed: false,
    severidad: { $in: ["warning", "critical"] },
  }).sort({ tipo: 1 });

  return vals.map((v) => [
    v.tipo,
    v.mensaje,
    v.confirmadaPorAnalista ? "Confirmada por analista" : "Sin confirmar",
  ]);
}

type TableOpts = { numericCol?: number; highlightLast?: boolean };

export function renderTable2(
  headers: [string, string],
  rows: FilaInforme2[],
  opts: TableOpts = {}
): string {
  if (!rows.length) return '<p class="empty">Sin datos</p>';
  const numericCol = opts.numericCol ?? 1;
  const body = rows
    .map((row) => {
      const isTotal = row[0].toLowerCase().startsWith("total");
      const cls = isTotal ? ' class="total"' : "";
      const cells = row.map((c, colIdx) => {
        const numCls = colIdx === numericCol ? ' class="num"' : "";
        return `<td${numCls}>${c}</td>`;
      });
      return `<tr${cls}>${cells.join("")}</tr>`;
    })
    .join("");
  return `<table class="data"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

export function renderTable3(
  headers: [string, string, string],
  rows: FilaInforme3[],
  opts: TableOpts = {}
): string {
  if (!rows.length) return '<p class="empty">Sin datos</p>';
  const numericCol = opts.numericCol ?? -1;
  const body = rows
    .map((row) => {
      const cells = row.map((c, colIdx) => {
        const numCls = colIdx === numericCol ? ' class="num"' : "";
        return `<td${numCls}>${c}</td>`;
      });
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");
  return `<table class="data"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}
