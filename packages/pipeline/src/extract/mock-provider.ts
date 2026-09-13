import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enrichExtractResult } from "./enrich-extract.js";
import type { ExtractResult } from "../types.js";

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

let cachedFixture: ExtractResult | null = null;

function loadFixture(): ExtractResult {
  if (!cachedFixture) {
    const raw = readFileSync(resolve(fixtureDir, "balance-ejemplo.json"), "utf-8");
    cachedFixture = JSON.parse(raw) as ExtractResult;
  }
  return structuredClone(cachedFixture);
}

function pickFixtureName(documentoNombre?: string): string {
  const name = (documentoNombre ?? "").toLowerCase();
  if (name.includes("ifrs") || name.includes("auditad")) return "ifrs-ejemplo.json";
  if (name.includes("resultado") || name.includes("eerr")) return "estado-resultados-ejemplo.json";
  if (name.includes("8col") || name.includes("ocho")) return "balance-ejemplo.json";
  return "balance-ejemplo.json";
}

/** Proveedor mock — líneas de fixture; identidad (razón social/RUT) se resuelve aparte en el worker. */
export function extractMock(documentoNombre?: string): ExtractResult {
  const file = pickFixtureName(documentoNombre);
  let result: ExtractResult;
  try {
    const raw = readFileSync(resolve(fixtureDir, file), "utf-8");
    result = enrichExtractResult(JSON.parse(raw) as ExtractResult);
  } catch {
    result = enrichExtractResult(loadFixture());
  }
  return {
    ...result,
    metadata: {
      ...result.metadata,
      razonSocial: undefined,
      rut: undefined,
    },
  };
}
