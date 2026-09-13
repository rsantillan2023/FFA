/** Normaliza confianzaExtraccion a escala 0.00–1.00. */
export function normalizarConfianzaExtraccion(raw?: number): number {
  if (raw == null || Number.isNaN(raw)) return 0.8;
  if (raw > 1 && raw <= 100) return Math.min(1, Math.max(0, raw / 100));
  if (raw > 100) return 1;
  return Math.min(1, Math.max(0, raw));
}
