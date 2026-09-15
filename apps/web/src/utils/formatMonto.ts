const FORMATTER = new Intl.NumberFormat("es-CL", {
  useGrouping: true,
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Monto con separador de miles (es-CL: 1.234.567,89). */
export function formatMonto(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return FORMATTER.format(n);
}

/** Versión corta para barras de resumen (evita filas de 20+ dígitos). */
export function formatMontoCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toLocaleString("es-CL", { maximumFractionDigits: 2 })} mil mill.`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 2 })} mill.`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} mil`;
  }
  return formatMonto(n);
}

/** Parsea texto ingresado con o sin separadores de miles. */
export function parseMontoInput(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "");
  if (!t) return null;
  const normalized = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : t.replace(/\./g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
