import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly cdnUrl: string;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(S3Service.name);
    const region = process.env.DO_SPACES_REGION ?? 'ams3';
    const endpoint =
      process.env.DO_SPACES_ENDPOINT ??
      `https://${region}.digitaloceanspaces.com`;

    this.bucket = process.env.DO_SPACES_BUCKET ?? '';
    this.cdnUrl = `${endpoint}/${this.bucket}`;

    this.client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId: process.env.DO_SPACES_KEY ?? '',
        secretAccessKey: process.env.DO_SPACES_SECRET ?? '',
      },
      forcePathStyle: false,
    });
  }

  /** Public CDN base URL (e.g. https://endpoint/bucket) */
  getCdnUrl(): string {
    return this.cdnUrl;
  }

  /** Download an object from S3 as a Buffer */
  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = response.Body;
    if (!stream) throw new Error(`Empty body for key: ${key}`);

    // Collect stream into buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async upload(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${this.cdnUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      this.logger.warn({ key, err: error }, 'Failed to delete S3 object');
    }
  }

  /** List objects under a prefix, returning key and lastModified */
  async listByPrefix(
    prefix: string,
  ): Promise<{ key: string; lastModified: Date }[]> {
    const results: { key: string; lastModified: Date }[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of response.Contents ?? []) {
        if (obj.Key && obj.LastModified) {
          results.push({ key: obj.Key, lastModified: obj.LastModified });
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return results;
  }
}
