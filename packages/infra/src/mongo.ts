import type { InfraConfig } from "./config.js";

let memoryServer: { stop: () => Promise<boolean> } | null = null;

export async function resolveMongoUri(config: InfraConfig): Promise<string> {
  if (config.mongodbBackend !== "memory") {
    return config.mongodbUri;
  }

  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const mongod = await MongoMemoryServer.create();
    memoryServer = mongod;
    const uri = mongod.getUri("ffa");
    console.log("[infra] MongoDB en memoria (sin Docker):", uri);
    return uri;
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : String(err);
    throw new Error(
      `MONGODB_BACKEND=memory requiere mongodb-memory-server instalado. ` +
        `Ejecutá npm install en la raíz o usá FFA_PROFILE=docker/native con MONGODB_URI. Detalle: ${msg}`
    );
  }
}

export async function stopMemoryMongo(): Promise<void> {
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
