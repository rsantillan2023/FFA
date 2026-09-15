import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getMonorepoRoot, resolveLocalStoragePath } from "./paths.js";

let loaded = false;

export { getMonorepoRoot };

/** Carga `.env` desde la raíz del monorepo (idempotente). */
export function loadRootEnv(startDir?: string): void {
  if (loaded) return;

  const fromFile = startDir ?? dirname(fileURLToPath(import.meta.url));
  const root = getMonorepoRoot(fromFile);
  const envPath = resolve(root, ".env");
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath });
  }
  loadDotenv();
  process.env.LOCAL_STORAGE_PATH = resolveLocalStoragePath(
    process.env.LOCAL_STORAGE_PATH,
    root
  );
  loaded = true;
}
