import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, normalize, resolve } from "node:path";

export class LocalStorage {
  constructor(private readonly rootDir: string) {}

  private resolveKey(key: string): string {
    const absRoot = resolve(this.rootDir);
    const absPath = resolve(absRoot, key);
    const rel = normalize(absPath.slice(absRoot.length));
    if (rel.startsWith("..")) {
      throw new Error("Ruta de almacenamiento inválida");
    }
    return absPath;
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  async putObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer);
    await writeFile(`${path}.meta.json`, JSON.stringify({ contentType }));
  }

  async getObject(key: string): Promise<{ buffer: Buffer; contentType: string }> {
    const path = this.resolveKey(key);
    const buffer = await readFile(path);
    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(await readFile(`${path}.meta.json`, "utf8")) as {
        contentType?: string;
      };
      contentType = meta.contentType ?? contentType;
    } catch {
      // sin meta
    }
    return { buffer, contentType };
  }
}

export function buildLocalKey(
  prefix: string,
  casoId: string,
  entityId: string,
  filename: string
): string {
  return `${prefix}/${casoId}/${entityId}/${filename}`;
}
