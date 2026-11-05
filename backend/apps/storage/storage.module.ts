import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { createMinioClient, MINIO_CLIENT } from './minio-client.provider.js';
import { StorageService } from './services/storage.service.js';
import { StorageController } from './storage.controller.js';

/**
 * MinIO storage microservice (TCP transport).
 *
 * Environment:
 *   MINIO_ENDPOINT                host only, e.g. "minio"        (required)
 *   MINIO_PORT                    9000 (or 443 when MINIO_USE_SSL)
 *   MINIO_USE_SSL                 "true" | "false", default false
 *   MINIO_ACCESS_KEY              (required)
 *   MINIO_SECRET_KEY              (required)
 *   MINIO_REGION                  optional
 *   MINIO_BUCKET                  private bucket, default "absences"
 *   MINIO_UPLOAD_URL_TTL          presigned upload TTL, default 900
 *   MINIO_DOWNLOAD_URL_TTL        presigned download TTL, default 900
 *   MINIO_MAX_UPLOAD_BYTES        default 10 MiB
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
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
