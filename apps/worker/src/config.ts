import { loadInfraConfig, loadRootEnv, type InfraConfig } from "@ffa/infra";

loadRootEnv();

export const infraConfig: InfraConfig = loadInfraConfig();

export const workerConfig = {
  infra: infraConfig,
  mongodbUri: infraConfig.mongodbUri,
  redisUrl: infraConfig.redisUrl,
  mailhogApi: infraConfig.mailhogApi,
  mailPollIntervalMs: infraConfig.mailPollIntervalMs,
  smtpHost: infraConfig.smtpHost,
  smtpPort: infraConfig.smtpPort,
  smtpFrom: infraConfig.smtpFrom,
};
