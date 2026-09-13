const EJERCICIO_MIN = 1900;
const EJERCICIO_MAX = 2100;

function esEjercicioValido(year: number): boolean {
  return Number.isFinite(year) && year >= EJERCICIO_MIN && year <= EJERCICIO_MAX;
}

/** Parsea ejercicio fiscal desde extracción IA; descarta "indeterminado" y valores no numéricos. */
export function parseEjercicioPeriodo(input?: unknown): number | undefined {
  if (input == null) return undefined;
  if (typeof input === "number" && Number.isFinite(input)) {
    const year = Math.trunc(input);
    return esEjercicioValido(year) ? year : undefined;
  }

  const trimmed = String(input).trim();
  if (!trimmed || /indetermin/i.test(trimmed) || /^n\/a$/i.test(trimmed) || /^-$/.test(trimmed)) {
    return undefined;
  }

  const yearMatch = /^(\d{4})$/.exec(trimmed);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return esEjercicioValido(year) ? year : undefined;
  }

  const num = Number(trimmed.replace(",", "."));
  if (Number.isFinite(num)) {
    const year = Math.trunc(num);
    return esEjercicioValido(year) ? year : undefined;
  }

  return undefined;
}

/** Parsea fechas de período desde extracción IA (ISO, DD/MM/YYYY, etc.). */
export function parseFechaPeriodoString(input?: string | null): string | undefined {
  if (input == null) return undefined;
  const trimmed = String(input).trim();
  if (!trimmed || /^invalid/i.test(trimmed)) return undefined;

  const chile = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (chile) {
    const day = Number(chile[1]);
    const month = Number(chile[2]);
    const year = Number(chile[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return undefined;
  }

  const isoPrefix = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoPrefix) {
    const parsed = new Date(`${isoPrefix[0]}T12:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return isoPrefix[0];
    return undefined;
  }

  const yearOnly = /^(\d{4})$/.exec(trimmed);
  if (yearOnly) {
    return `${yearOnly[1]}-12-31`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

export function fechaPeriodoToDate(isoDate?: string | null): Date | undefined {
  const normalized = parseFechaPeriodoString(isoDate);
  if (!normalized) return undefined;
  const d = new Date(`${normalized}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
