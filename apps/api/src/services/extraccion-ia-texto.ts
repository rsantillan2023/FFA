import { DocumentoFuenteModel, LineaContableModel } from "@ffa/db";
import type { ExtractResult } from "@ffa/pipeline";
import type { ExtraccionIaTextoDto } from "@ffa/shared";

function fmtMonto(n: number): string {
  return new Intl.NumberFormat("es-CL").format(n);
}

function formatFromPayload(payload: ExtractResult): string {
  const parts: string[] = [];

  parts.push(`Tipo de documento: ${payload.tipoDocumento ?? "—"}`);
  parts.push("");

  const meta = payload.metadata;
  if (meta) {
    parts.push("— Identificación detectada —");
    if (meta.razonSocial) parts.push(`Empresa: ${meta.razonSocial}`);
    if (meta.rut) parts.push(`RUT: ${meta.rut}`);
    if (meta.moneda) parts.push(`Moneda: ${meta.moneda}`);
    if (meta.escala) parts.push(`Escala: ${meta.escala}`);
    if (meta.periodo?.ejercicio) parts.push(`Ejercicio: ${meta.periodo.ejercicio}`);
    if (meta.periodo?.desde || meta.periodo?.hasta) {
      parts.push(`Período: ${meta.periodo.desde ?? "—"} → ${meta.periodo.hasta ?? "—"}`);
    }
    parts.push("");
  }

  if (payload.encabezados?.length) {
    parts.push("— Encabezados —");
    parts.push(payload.encabezados.join(" | "));
    parts.push("");
  }

  parts.push(`— Líneas extraídas (${payload.lineas?.length ?? 0}) —`);
  for (const linea of payload.lineas ?? []) {
    const pag = linea.paginaNumero != null ? `[pág. ${linea.paginaNumero}] ` : "";
    const cod = linea.codigoOrigen ? `${linea.codigoOrigen} · ` : "";
    const col = linea.columnaOrigen ? ` (${linea.columnaOrigen})` : "";
    parts.push(`${pag}${cod}${linea.denominacionOriginal}${col}\t${fmtMonto(linea.montoOriginal)}`);
  }

  if (payload.totales?.length) {
    parts.push("");
    parts.push("— Totales detectados —");
    for (const t of payload.totales) {
      parts.push(`${t.denominacion} (${t.tipo})\t${fmtMonto(t.monto)}`);
    }
  }

  if (payload.notas?.length) {
    parts.push("");
    parts.push("— Notas al pie / aclaraciones —");
    for (const n of payload.notas) {
      const ref = n.rubroRef ? `[${n.rubroRef}] ` : "";
      parts.push(`${ref}${n.texto}`);
    }
  }

  const transcripcion =
    payload.transcripcionPaginas ??
    (payload.textoPagina?.trim() ? [{ pagina: 1, texto: payload.textoPagina.trim() }] : []);
  if (transcripcion.length) {
    parts.push("");
    parts.push("— Transcripción literal del documento —");
    for (const t of transcripcion) {
      parts.push("");
      parts.push(`=== Página ${t.pagina} ===`);
      parts.push(t.texto);
    }
  }

  parts.push("");
  parts.push("— JSON original de extracción —");
  parts.push(JSON.stringify(payload, null, 2));

  return parts.join("\n");
}

function formatReconstruido(input: {
  metadata: Record<string, unknown> | null;
  notas: Array<{ rubroRef?: string | null; texto?: string | null }>;
  transcripcion: Array<{ pagina?: number | null; texto?: string | null }>;
  paginaCount?: number | null;
  lineas: Array<{
    paginaNumero?: number | null;
    codigoOrigen?: string | null;
    columnaOrigen?: string | null;
    denominacionOriginal?: string | null;
    montoOriginal?: number | null;
  }>;
}): string {
  const parts: string[] = [
    "No se guardó el JSON crudo de la extracción (caso procesado antes de esta versión).",
    "Debajo se reconstruye lo almacenado en base de datos a partir de la lectura automática.",
    "",
  ];

  const meta = input.metadata;
  if (meta) {
    parts.push("— Identificación detectada —");
    if (meta.razonSocial) parts.push(`Empresa: ${String(meta.razonSocial)}`);
    if (meta.rut) parts.push(`RUT: ${String(meta.rut)}`);
    if (meta.moneda) parts.push(`Moneda: ${String(meta.moneda)}`);
    if (meta.escala) parts.push(`Escala: ${String(meta.escala)}`);
    const periodo = meta.periodo as { ejercicio?: number } | undefined;
    if (periodo?.ejercicio) parts.push(`Ejercicio: ${periodo.ejercicio}`);
    parts.push("");
  }

  parts.push(`— Líneas almacenadas (${input.lineas.length}) —`);
  for (const linea of input.lineas) {
    const pag = linea.paginaNumero != null ? `[pág. ${linea.paginaNumero}] ` : "";
    const cod = linea.codigoOrigen ? `${linea.codigoOrigen} · ` : "";
    const col = linea.columnaOrigen ? ` (${linea.columnaOrigen})` : "";
    const monto = linea.montoOriginal != null ? fmtMonto(linea.montoOriginal) : "—";
    parts.push(`${pag}${cod}${linea.denominacionOriginal ?? "—"}${col}\t${monto}`);
  }

  if (input.notas.length) {
    parts.push("");
    parts.push("— Notas al pie / aclaraciones —");
    for (const n of input.notas) {
      const ref = n.rubroRef ? `[${n.rubroRef}] ` : "";
      parts.push(`${ref}${n.texto ?? ""}`);
    }
  }

  if (input.transcripcion.length) {
    parts.push("");
    parts.push("— Transcripción literal del documento —");
    for (const t of input.transcripcion) {
      parts.push("");
      parts.push(`=== Página ${t.pagina ?? "?"} ===`);
      parts.push(t.texto ?? "");
    }
  } else if (input.paginaCount && input.paginaCount > 0) {
    parts.push("");
    parts.push(
      `— Sin transcripción guardada (${input.paginaCount} pág. en el PDF). Reprocesá el expediente para capturar texto completo. —`
    );
  }

  return parts.join("\n");
}

export async function obtenerExtraccionIaTexto(casoId: string): Promise<ExtraccionIaTextoDto> {
  const doc = await DocumentoFuenteModel.findOne({ casoId }).sort({ createdAt: 1 });
  if (!doc) throw new Error("No hay documento fuente en este expediente");

  const lineas = await LineaContableModel.find({ casoId, documentoId: doc._id })
    .sort({ paginaNumero: 1, denominacionOriginal: 1 })
    .select("paginaNumero codigoOrigen columnaOrigen denominacionOriginal montoOriginal")
    .lean();

  const payload = doc.extractPayload as ExtractResult | undefined | null;
  const notas = (doc.extractNotas ?? []).map((n) => ({
    rubroRef: n.rubroRef,
    texto: n.texto,
  }));

  if (payload && typeof payload === "object" && Array.isArray(payload.lineas)) {
    return {
      documentoId: doc._id.toString(),
      documentoNombre: doc.nombreOriginal,
      origen: "payload",
      lineasCount: payload.lineas.length,
      texto: formatFromPayload(payload),
    };
  }

  return {
    documentoId: doc._id.toString(),
    documentoNombre: doc.nombreOriginal,
    origen: "reconstruido",
    lineasCount: lineas.length,
    texto: formatReconstruido({
      metadata: (doc.extractMetadata as Record<string, unknown> | undefined) ?? null,
      notas,
      transcripcion: (doc.extractTranscripcion ?? []).map((t) => ({
        pagina: t.pagina,
        texto: t.texto,
      })),
      paginaCount: doc.paginaCount,
      lineas,
    }),
  };
}
