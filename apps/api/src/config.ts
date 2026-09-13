import { loadInfraConfig, loadRootEnv, type InfraConfig } from "@ffa/infra";

loadRootEnv();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const infraConfig: InfraConfig = loadInfraConfig();

export const appConfig = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.API_HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 3000),
  jwtSecret: required("JWT_SECRET", "dev-secret-change-in-production-min-32"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? "admin@ecr-salud.local",
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? "Admin123!",
  deploymentMode: process.env.DEPLOYMENT_MODE ?? "hybrid",
  infra: infraConfig,
  mongodbUri: infraConfig.mongodbUri,
  redisUrl: infraConfig.redisUrl,
  smtpHost: infraConfig.smtpHost,
  smtpPort: infraConfig.smtpPort,
  smtpFrom: infraConfig.smtpFrom,
  mailhogApi: infraConfig.mailhogApi,
};
