/** Precios estimados USD por 1M tokens (input / output). Valores orientativos. */
const PRECIOS_POR_MODELO: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
};

const DEFAULT_OPENAI = { input: 0.15, output: 0.6 };
const DEFAULT_ANTHROPIC = { input: 3, output: 15 };

function resolverPrecioModelo(
  proveedor: "openai" | "anthropic",
  modelo: string
): { input: number; output: number } {
  const key = modelo.toLowerCase();
  if (PRECIOS_POR_MODELO[key]) return PRECIOS_POR_MODELO[key]!;

  for (const [patron, precio] of Object.entries(PRECIOS_POR_MODELO)) {
    if (key.includes(patron) || patron.includes(key)) return precio;
  }

  if (proveedor === "openai") {
    if (key.includes("gpt-4o")) return PRECIOS_POR_MODELO["gpt-4o"]!;
    return DEFAULT_OPENAI;
  }
  return DEFAULT_ANTHROPIC;
}

/** Estima el coste USD de una llamada según proveedor, modelo y tokens. */
export function estimarCosteIaUsd(
  proveedor: "openai" | "anthropic",
  modelo: string,
  tokensEntrada: number,
  tokensSalida: number
): number {
  const precio = resolverPrecioModelo(proveedor, modelo);
  const coste =
    (tokensEntrada / 1_000_000) * precio.input + (tokensSalida / 1_000_000) * precio.output;
  return Math.round(coste * 1_000_000) / 1_000_000;
}
