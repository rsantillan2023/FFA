/** Tope global de casos en preproceso simultáneo (inline y worker redis). */
export function preprocessConcurrencyLimit(): number {
  const n = Number(process.env.PREPROCESS_CONCURRENCY);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(10, Math.floor(n));
}
