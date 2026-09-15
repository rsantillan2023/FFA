import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_STORAGE_REL = "apps/api/data/storage";

export function getMonorepoRoot(startDir?: string): string {
  const fromFile = startDir ?? dirname(fileURLToPath(import.meta.url));
  return resolve(fromFile, "../../..");
}

/** Resuelve LOCAL_STORAGE_PATH de forma independiente al cwd del proceso. */
export function resolveLocalStoragePath(
  raw: string | undefined,
  repoRoot?: string
): string {
  const root = repoRoot ?? getMonorepoRoot();
  const configured = (raw?.trim() || "./data/storage").replace(/\\/g, "/");

  if (isAbsolute(configured)) {
    return configured;
  }

  const candidates = [
    resolve(process.cwd(), configured),
    resolve(root, configured),
    resolve(root, "apps/api", configured.replace(/^\.\//, "")),
    resolve(root, DEFAULT_STORAGE_REL),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return resolve(root, DEFAULT_STORAGE_REL);
}
