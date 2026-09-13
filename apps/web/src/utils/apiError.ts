/** Mensaje legible a partir de un error de la API o de una excepción inesperada. */
export function apiErrorMessage(error: unknown, fallback = "Error inesperado"): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
