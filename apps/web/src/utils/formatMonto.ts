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
