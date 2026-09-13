import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let loaded = false;

/** Carga `.env` desde la raíz del monorepo (idempotente). */
export function loadRootEnv(startDir?: string): void {
  if (loaded) return;

  const fromFile = startDir ?? dirname(fileURLToPath(import.meta.url));
  const root = resolve(fromFile, "../../../");
  const envPath = resolve(root, ".env");
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath });
  }
  loadDotenv();
  loaded = true;
}
