import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  buildObjectUrl,
  type StorageProvider,
  type StorageUploadResult,
} from './storage.interface.js';

/**
 * S3-compatible storage (AWS S3, MinIO, Cloudflare R2 …). Objects are private;
 * reads go through short-lived signed URLs.
 */
@Injectable()
export class S3StorageService implements StorageProvider {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicApiUrl: string;
  private readonly signedUrlTtlSeconds = 900;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('storage.bucket', '');
    this.publicApiUrl = config.get<string>('publicApiUrl', 'http://localhost:3000');

    const endpoint = config.get<string>('storage.endpoint', '');
    this.client = new S3Client({
      region: config.get<string>('storage.region', 'us-east-1'),
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: config.get<boolean>('storage.forcePathStyle', true),
      credentials: {
        accessKeyId: config.get<string>('storage.accessKeyId', ''),
        secretAccessKey: config.get<string>('storage.secretAccessKey', ''),
      },
    });
  }

  async upload(file: Express.Multer.File, key: string): Promise<StorageUploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
        // No ACL header: modern S3 buckets default to private objects and
        // reject ACLs when Object Ownership is "Bucket owner enforced".
      }),
    );

    this.logger.log(`Uploaded object ${key} to ${this.bucket}`);
    return { key, url: buildObjectUrl(this.publicApiUrl, key) };
  }

  async getUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: this.signedUrlTtlSeconds },
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
