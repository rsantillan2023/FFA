import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { InfraConfig } from "@ffa/infra";

export class S3Storage {
  private client: S3Client | null = null;
  private bucketReady = false;

  constructor(private readonly config: Pick<
    InfraConfig,
    "s3Endpoint" | "s3AccessKey" | "s3SecretKey" | "s3Bucket" | "s3Region"
  >) {}

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: this.config.s3Region,
        endpoint: this.config.s3Endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: this.config.s3AccessKey,
          secretAccessKey: this.config.s3SecretKey,
        },
      });
    }
    return this.client;
  }

  async ensureReady(): Promise<void> {
    if (this.bucketReady) return;
    const s3 = this.getClient();
    try {
      await s3.send(new HeadBucketCommand({ Bucket: this.config.s3Bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: this.config.s3Bucket }));
    }
    this.bucketReady = true;
  }

  async putObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.ensureReady();
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      })
    );
  }

  async getObject(key: string): Promise<{ buffer: Buffer; contentType: string }> {
    await this.ensureReady();
    const res = await this.getClient().send(
      new GetObjectCommand({ Bucket: this.config.s3Bucket, Key: key })
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("Documento vacío en almacenamiento");
    return {
      buffer: Buffer.from(bytes),
      contentType: res.ContentType ?? "application/octet-stream",
    };
  }
}
