import { EstadoFinanciero } from "@ffa/shared";

export interface CsvRubroRow {
  codigo: string;
  nombre: string;
  estadoFinanciero: string;
  corriente?: boolean;
  convencionSigno: "normal" | "invertido";
  padreCodigo?: string;
  orden: number;
  aliases?: string[];
  notaMargen?: string;
}

export function parsePlanCuentasCsv(csv: string): CsvRubroRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("CSV vacío");
  }

  const header = lines[0].toLowerCase();
  const hasHeader = header.includes("codigo") && header.includes("nombre");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows: CsvRubroRow[] = [];
  for (let i = 0; i < dataLines.length; i++) {
    const parts = dataLines[i].split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 3) {
      throw new Error(`Línea ${i + (hasHeader ? 2 : 1)}: columnas insuficientes`);
    }

    const [
      codigo,
      nombre,
      estadoFinanciero,
      corrienteStr,
      signoStr,
      padreCodigo,
      ordenStr,
      aliasesStr,
      notaMargen,
    ] = parts;

    if (!Object.values(EstadoFinanciero).includes(estadoFinanciero as EstadoFinanciero)) {
      throw new Error(`Código ${codigo}: estado financiero inválido (${estadoFinanciero})`);
    }

    rows.push({
      codigo,
      nombre,
      estadoFinanciero,
      corriente:
        corrienteStr === "true" || corrienteStr === "1"
          ? true
          : corrienteStr === "false" || corrienteStr === "0"
            ? false
            : undefined,
      convencionSigno: signoStr === "invertido" ? "invertido" : "normal",
      padreCodigo: padreCodigo || undefined,
      orden: ordenStr ? Number(ordenStr) : i + 1,
      aliases: aliasesStr
        ? aliasesStr
            .split(";")
            .map((a) => a.trim())
            .filter(Boolean)
        : undefined,
      notaMargen: notaMargen || undefined,
    });
  }

  return rows;
}
