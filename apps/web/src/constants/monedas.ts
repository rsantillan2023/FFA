/** Monedas ISO 4217 habituales en balances regionales. */
export const MONEDAS_OPCIONES = [
  { codigo: "ARS", nombre: "Peso argentino" },
  { codigo: "USD", nombre: "Dólar estadounidense" },
  { codigo: "EUR", nombre: "Euro" },
  { codigo: "CLP", nombre: "Peso chileno" },
  { codigo: "BRL", nombre: "Real brasileño" },
  { codigo: "UYU", nombre: "Peso uruguayo" },
  { codigo: "PYG", nombre: "Guaraní paraguayo" },
  { codigo: "PEN", nombre: "Sol peruano" },
  { codigo: "BOB", nombre: "Boliviano" },
  { codigo: "MXN", nombre: "Peso mexicano" },
  { codigo: "COP", nombre: "Peso colombiano" },
] as const;

export function monedaLabel(codigo: string): string {
  const c = codigo.trim().toUpperCase();
  if (!c) return "—";
  const found = MONEDAS_OPCIONES.find((m) => m.codigo === c);
  return found ? `${found.codigo} — ${found.nombre}` : c;
}
