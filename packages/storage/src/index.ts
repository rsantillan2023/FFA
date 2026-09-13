import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { InfraConfig } from "@ffa/infra";
import { LocalStorage, buildLocalKey } from "./local.js";
import { S3Storage } from "./s3.js";

type Backend = LocalStorage | S3Storage;

let backend: Backend | null = null;
let mode: "local" | "s3" = "local";

export function initStorage(config: InfraConfig): void {
  mode = config.storageBackend;
  if (mode === "local") {
    backend = new LocalStorage(resolve(config.localStoragePath));
  } else {
    backend = new S3Storage(config);
  }
}

function getBackend(): Backend {
  if (!backend) {
    throw new Error("Storage no inicializado — llamá initStorage() al arrancar");
  }
  return backend;
}

export function getStorageMode(): "local" | "s3" {
  return mode;
}

export async function isStorageReady(): Promise<boolean> {
  try {
    await getBackend().ensureReady();
    return true;
  } catch {
    return false;
  }
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function uploadDocumento(
  casoId: string,
  documentoId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const key = buildLocalKey("casos", casoId, documentoId, filename);
  await getBackend().putObject(key, buffer, mimeType);
  return key;
}

export async function uploadBuffer(
  casoId: string,
  documentoId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  return uploadDocumento(casoId, documentoId, filename, buffer, mimeType);
}

export async function getDocumentoBuffer(
  storageKey: string
): Promise<{ buffer: Buffer; contentType: string }> {
  return getBackend().getObject(storageKey);
}

export async function uploadInformeHtml(
  casoId: string,
  fichaId: string,
  buffer: Buffer
): Promise<string> {
  const key = `informes/${casoId}/${fichaId}/informe-${Date.now()}.html`;
  await getBackend().putObject(key, buffer, "text/html; charset=utf-8");
  return key;
}

export async function uploadInformeDocx(
  casoId: string,
  informeId: string,
  buffer: Buffer
): Promise<string> {
  const key = `informes/${casoId}/${informeId}/informe-${Date.now()}.docx`;
  await getBackend().putObject(
    key,
    buffer,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  return key;
}
