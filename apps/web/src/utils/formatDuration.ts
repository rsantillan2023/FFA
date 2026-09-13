/** Formatea minutos en texto legible (ej. «1 h 15 min»), sin decimales flotantes. */
export function formatMinutos(val: number | null | undefined): string {
  if (val == null || Number.isNaN(val)) return "—";
  const total = Math.round(Number(val));
  if (total <= 0) return "—";
  if (total < 60) return `${total} min`;
  const h = Math.trunc(total / 60);
  const m = total - h * 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
