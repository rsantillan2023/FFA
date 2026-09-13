/** Ejecuta una promesa con tope de tiempo; rechaza con `message` si vence. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = "Tiempo de espera agotado"
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    );
  });
}

export function readEnvTimeoutMs(
  primary: string,
  fallbackMs: number,
  secondary?: string
): number {
  const raw = process.env[primary] ?? (secondary ? process.env[secondary] : undefined);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallbackMs;
}
