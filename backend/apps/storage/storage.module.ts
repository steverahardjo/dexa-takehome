import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import {
  createMinioClient,
  createMinioPresignClient,
  MINIO_CLIENT,
  MINIO_PRESIGN_CLIENT,
} from './minio-client.provider.js';
import { StorageService } from './services/storage.service.js';
import { StorageController } from './storage.controller.js';

/**
 * Storage microservice (TCP transport) backed by RustFS.
 *
 * Environment:
 *   MINIO_ENDPOINT                host only, e.g. "rustfs"      (required)
 *   MINIO_PORT                    9000 (or 443 when MINIO_USE_SSL)
 *   MINIO_USE_SSL                 "true" | "false", default false
 *   MINIO_ACCESS_KEY              (required)
 *   MINIO_SECRET_KEY              (required)
 *   MINIO_REGION                  default "us-east-1"
 *   MINIO_BUCKET                  private bucket, default "absences"
 *   MINIO_UPLOAD_URL_TTL          presigned upload TTL, default 900
 *   MINIO_DOWNLOAD_URL_TTL        presigned download TTL, default 900
 *   MINIO_MAX_UPLOAD_BYTES        default 10 MiB
 *
 * Presigned URLs are signed by a second client that can point somewhere else:
 *   MINIO_PUBLIC_ENDPOINT         host the browser resolves, default MINIO_ENDPOINT
 *   MINIO_PUBLIC_PORT             default MINIO_PORT
 *   MINIO_PUBLIC_USE_SSL          default MINIO_USE_SSL
 */
@Module({
  imports: [ConfigModule],
  controllers: [StorageController],
  providers: [
    {
      provide: MINIO_CLIENT,
      inject: [ConfigService],
      useFactory: createMinioClient,
    },
    {
      provide: MINIO_PRESIGN_CLIENT,
      inject: [ConfigService],
      useFactory: createMinioPresignClient,
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
