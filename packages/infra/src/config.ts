import { resolveLocalStoragePath } from "./paths.js";

export type FfaProfile = "minimal" | "docker" | "native" | "cloud";
export type StorageBackend = "local" | "s3";
export type QueueBackend = "inline" | "redis";
export type MailBackend = "off" | "mailhog" | "imap" | "smtp";
export type MongodbBackend = "uri" | "memory";

export interface InfraConfig {
  profile: FfaProfile;
  storageBackend: StorageBackend;
  localStoragePath: string;
  queueBackend: QueueBackend;
  mailBackend: MailBackend;
  mongodbBackend: MongodbBackend;
  mongodbUri: string;
  redisUrl: string;
  redisRequired: boolean;
  s3Endpoint: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Bucket: string;
  s3Region: string;
  mailhogApi: string;
  mailPollIntervalMs: number;
  smtpHost: string;
  smtpPort: number;
  smtpFrom: string;
}

const PROFILE_DEFAULTS: Record<
  FfaProfile,
  Pick<
    InfraConfig,
    | "storageBackend"
    | "queueBackend"
    | "mailBackend"
    | "mongodbBackend"
    | "mongodbUri"
    | "redisUrl"
    | "s3Endpoint"
    | "s3AccessKey"
    | "s3SecretKey"
    | "s3Bucket"
    | "mailhogApi"
  >
> = {
  minimal: {
    storageBackend: "local",
    queueBackend: "inline",
    mailBackend: "off",
    mongodbBackend: "memory",
    mongodbUri: "",
    redisUrl: "",
    s3Endpoint: "",
    s3AccessKey: "",
    s3SecretKey: "",
    s3Bucket: "ffa-documents",
    mailhogApi: "",
  },
  docker: {
    storageBackend: "s3",
    queueBackend: "redis",
    mailBackend: "mailhog",
    mongodbBackend: "uri",
    mongodbUri: "mongodb://ffa:ffa_dev@localhost:27017/ffa?authSource=admin",
    redisUrl: "redis://localhost:6379",
    s3Endpoint: "http://localhost:9000",
    s3AccessKey: "ffa_minio",
    s3SecretKey: "ffa_minio_secret",
    s3Bucket: "ffa-documents",
    mailhogApi: "http://localhost:8025/api/v2",
  },
  native: {
    storageBackend: "local",
    queueBackend: "redis",
    mailBackend: "off",
    mongodbBackend: "uri",
    mongodbUri: "mongodb://127.0.0.1:27017/ffa",
    redisUrl: "redis://127.0.0.1:6379",
    s3Endpoint: "http://127.0.0.1:9000",
    s3AccessKey: "ffa_minio",
    s3SecretKey: "ffa_minio_secret",
    s3Bucket: "ffa-documents",
    mailhogApi: "http://127.0.0.1:8025/api/v2",
  },
  cloud: {
    storageBackend: "s3",
    queueBackend: "redis",
    mailBackend: "smtp",
    mongodbBackend: "uri",
    mongodbUri: "",
    redisUrl: "",
    s3Endpoint: "https://s3.amazonaws.com",
    s3AccessKey: "",
    s3SecretKey: "",
    s3Bucket: "ffa-documents",
    mailhogApi: "",
  },
};

function pickEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T
): T {
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v === "" ? undefined : v;
}

export function loadInfraConfig(): InfraConfig {
  const profile = pickEnum(
    env("FFA_PROFILE"),
    ["minimal", "docker", "native", "cloud"] as const,
    "minimal"
  );
  const base = PROFILE_DEFAULTS[profile];

  const storageBackend = pickEnum(
    env("STORAGE_BACKEND"),
    ["local", "s3"] as const,
    base.storageBackend
  );
  const queueBackend = pickEnum(
    env("QUEUE_BACKEND"),
    ["inline", "redis"] as const,
    base.queueBackend
  );
  const mailBackend = pickEnum(
    env("MAIL_BACKEND"),
    ["off", "mailhog", "imap", "smtp"] as const,
    base.mailBackend
  );
  const mongodbBackend = pickEnum(
    env("MONGODB_BACKEND"),
    ["uri", "memory"] as const,
    base.mongodbBackend
  );

  const mongodbUri =
    env("MONGODB_URI") ??
    base.mongodbUri ??
    "mongodb://127.0.0.1:27017/ffa";

  const redisUrl = env("REDIS_URL") ?? base.redisUrl ?? "redis://localhost:6379";

  return {
    profile,
    storageBackend,
    localStoragePath: resolveLocalStoragePath(env("LOCAL_STORAGE_PATH")),
    queueBackend,
    mailBackend,
    mongodbBackend,
    mongodbUri,
    redisUrl,
    redisRequired: queueBackend === "redis",
    s3Endpoint: env("S3_ENDPOINT") ?? base.s3Endpoint ?? "http://localhost:9000",
    s3AccessKey: env("S3_ACCESS_KEY") ?? base.s3AccessKey ?? "ffa_minio",
    s3SecretKey: env("S3_SECRET_KEY") ?? base.s3SecretKey ?? "ffa_minio_secret",
    s3Bucket: env("S3_BUCKET") ?? base.s3Bucket ?? "ffa-documents",
    s3Region: env("S3_REGION") ?? "us-east-1",
    mailhogApi: env("MAILHOG_API") ?? base.mailhogApi ?? "http://localhost:8025/api/v2",
    mailPollIntervalMs: Number(env("MAIL_POLL_MS") ?? 30000),
    smtpHost: env("SMTP_HOST") ?? "localhost",
    smtpPort: Number(env("SMTP_PORT") ?? 1025),
    smtpFrom: env("SMTP_FROM") ?? "ffa@ecr-salud.local",
  };
}
