import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { randomUUID } from 'node:crypto';
import type { Client } from 'minio';

import { MINIO_CLIENT } from '../minio-client.provider.js';
import {
  STORAGE_NAMESPACES,
  STORAGE_KEY,
  type DownloadUrlResult,
  type StorageNamespace,
  type UploadUrlResult,
} from '../../../shared/contracts/storage.contracts.js';

const DEFAULT_BUCKET = 'absences';
const DEFAULT_TTL = 900;
const MAX_TTL = 604800; // 7 days
const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);

  private readonly bucket: string;
  private readonly uploadTtl: number;
  private readonly downloadTtl: number;
  private readonly maxUploadBytes: number;

  constructor(
    @Inject(MINIO_CLIENT)
    private readonly minio: Client,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>('MINIO_BUCKET', DEFAULT_BUCKET);

    this.uploadTtl = Number(config.get('MINIO_UPLOAD_URL_TTL', DEFAULT_TTL));

    this.downloadTtl = Number(
      config.get('MINIO_DOWNLOAD_URL_TTL', DEFAULT_TTL),
    );

    this.maxUploadBytes = Number(
      config.get('MINIO_MAX_UPLOAD_BYTES', DEFAULT_MAX_UPLOAD_BYTES),
    );

    for (const [name, value] of [
      ['MINIO_UPLOAD_URL_TTL', this.uploadTtl],
      ['MINIO_DOWNLOAD_URL_TTL', this.downloadTtl],
      ['MINIO_MAX_UPLOAD_BYTES', this.maxUploadBytes],
    ] as const) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
      }
    }

    if (this.uploadTtl > MAX_TTL || this.downloadTtl > MAX_TTL) {
      throw new Error('Signed URL TTL cannot exceed 7 days');
    }
  }

  /**
   * Ensure the private bucket exists when the service starts.
   */
  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.minio.bucketExists(this.bucket);

      if (!exists) {
        await this.minio.makeBucket(this.bucket);
        this.logger.log(`Created bucket: ${this.bucket}`);
      }
    } catch (error) {
      this.logger.error('Failed to initialize storage bucket', error);
      throw error;
    }
  }

  /**
   * Generate a temporary URL for direct frontend uploads.
   */
  async getUploadUrl(
    contentType: string,
    fileName?: string,
    namespace: StorageNamespace = STORAGE_NAMESPACES.avatar,
  ): Promise<UploadUrlResult> {
    const extension = ALLOWED_TYPES[contentType];

    if (!extension) {
      throw new RpcException({
        code: 'INVALID_ARGUMENT',
        message: 'Unsupported file type',
      });
    }

    // A name that lies about its type would produce an object nobody can serve.
    if (fileName && !fileName.toLowerCase().endsWith(extension)) {
      throw new RpcException({
        code: 'INVALID_ARGUMENT',
        message: `fileName must end with ${extension} for ${contentType}`,
      });
    }

    const now = new Date();

    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    const key = `${namespace}/${year}/${month}/${randomUUID()}${extension}`;

    try {
      const uploadUrl = await this.minio.presignedPutObject(
        this.bucket,
        key,
        this.uploadTtl,
      );

      return {
        key,
        uploadUrl,
        expiresInSeconds: this.uploadTtl,
      };
    } catch (error) {
      this.handleStorageError(error, 'Could not generate upload URL');
    }
  }

  /**
   * Verify the uploaded object and return its metadata.
   */
  async confirmUpload(key: string): Promise<{
    key: string;
    size: number;
    contentType: string | null;
  }> {
    this.validateKey(key);

    try {
      const stat = await this.minio.statObject(this.bucket, key);

      if (stat.size > this.maxUploadBytes) {
        await this.minio.removeObject(this.bucket, key);

        throw new RpcException({
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Uploaded file exceeds the maximum size',
        });
      }

      const contentType = this.getContentType(stat.metaData);

      if (!contentType || !ALLOWED_TYPES[contentType]) {
        await this.minio.removeObject(this.bucket, key);

        throw new RpcException({
          code: 'INVALID_ARGUMENT',
          message: 'Unsupported uploaded file type',
        });
      }

      return {
        key,
        size: stat.size,
        contentType,
      };
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }

      this.handleStorageError(error, 'Could not verify uploaded file');
    }
  }

  /**
   * Generate a temporary URL for downloading a private object.
   */
  async getDownloadUrl(key: string): Promise<DownloadUrlResult> {
    this.validateKey(key);

    try {
      const stat = await this.minio.statObject(this.bucket, key);

      const downloadUrl = await this.minio.presignedGetObject(
        this.bucket,
        key,
        this.downloadTtl,
      );

      return {
        key,
        downloadUrl,
        expiresInSeconds: this.downloadTtl,
        contentType: this.getContentType(stat.metaData),
        size: stat.size,
      };
    } catch (error) {
      this.handleStorageError(error, 'Could not generate download URL');
    }
  }

  /**
   * Delete an object from storage.
   */
  async deleteObject(key: string): Promise<void> {
    this.validateKey(key);

    try {
      await this.minio.removeObject(this.bucket, key);
    } catch (error) {
      this.handleStorageError(error, 'Could not delete file');
    }
  }

  /**
   * Keys are only valid inside a namespace this service issues, so a caller
   * cannot confirm or delete an object another service owns.
   */
  private validateKey(key: string): void {
    if (typeof key !== 'string' || !STORAGE_KEY.test(key)) {
      throw new RpcException({
        code: 'INVALID_ARGUMENT',
        message: 'Invalid storage key',
      });
    }
  }

  private getContentType(metadata: Record<string, unknown>): string | null {
    const value =
      metadata['Content-Type'] ?? metadata['content-type'] ?? metadata.mimetype;

    return typeof value === 'string' ? value : null;
  }

  private handleStorageError(error: unknown, message: string): never {
    const code =
      error instanceof Error
        ? (error as Error & { code?: string }).code
        : undefined;

    if (
      code === 'NotFound' ||
      code === 'NoSuchKey' ||
      code === 'NoSuchBucket'
    ) {
      throw new RpcException({
        code: 'NOT_FOUND',
        message: 'File does not exist',
      });
    }

    this.logger.error(
      `${message}: ${error instanceof Error ? error.message : String(error)}`,
    );

    throw new RpcException({
      code: 'STORAGE_UNAVAILABLE',
      message,
    });
  }
}
