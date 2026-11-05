import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { randomUUID } from 'node:crypto';

import {
  STORAGE_PATTERNS,
  type ConfirmedUpload,
  type DeletedObject,
  type DownloadUrlResult,
  type UploadUrlResult,
} from '../../../shared/contracts/storage.contracts.js';
import { RPC_ERRORS } from '../../../shared/rpc/errors.js';

/** Avatars the fake storage service knows about. */
export const uploadedAvatars = new Set<string>();

/**
 * Stand-in for the storage microservice in e2e tests: it speaks the real TCP
 * patterns but keeps objects in memory instead of MinIO.
 */
@Controller()
export class FakeStorageController {
  @MessagePattern(STORAGE_PATTERNS.getUploadUrl)
  upload(@Payload() payload: { contentType: string }): UploadUrlResult {
    const extension =
      payload.contentType === 'application/pdf' ? '.pdf' : '.png';
    const key = `2026/11/${randomUUID()}${extension}`;
    uploadedAvatars.add(key);

    return {
      key,
      uploadUrl: `https://minio.test/upload/${key}`,
      expiresInSeconds: 600,
    };
  }

  @MessagePattern(STORAGE_PATTERNS.confirmUpload)
  confirm(@Payload() payload: { key: string }): ConfirmedUpload {
    if (!uploadedAvatars.has(payload.key)) {
      throw new RpcException({
        code: RPC_ERRORS.invalidArgument,
        message: 'Invalid storage key',
      });
    }

    return { key: payload.key, size: 12, contentType: 'image/png' };
  }

  @MessagePattern(STORAGE_PATTERNS.getDownloadUrl)
  sign(@Payload() payload: { key: string }): DownloadUrlResult {
    if (!uploadedAvatars.has(payload.key)) {
      throw new RpcException({
        code: RPC_ERRORS.notFound,
        message: 'File does not exist',
      });
    }

    return {
      key: payload.key,
      downloadUrl: `https://minio.test/absences/${payload.key}?X-Amz-Signature=stub`,
      expiresInSeconds: 900,
      contentType: 'image/png',
      size: 12,
    };
  }

  @MessagePattern(STORAGE_PATTERNS.deleteObject)
  remove(@Payload() payload: { key: string }): DeletedObject {
    uploadedAvatars.delete(payload.key);

    return { key: payload.key, deleted: true };
  }
}
