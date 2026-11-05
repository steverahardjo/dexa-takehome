import { Controller, UsePipes } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { GetUploadUrlDto } from './dto/get-upload-url.dto.js';
import { ObjectKeyDto } from './dto/object-key.dto.js';
import { StorageService } from './services/storage.service.js';
import {
  STORAGE_PATTERNS,
  type DownloadUrlResult,
  type UploadUrlResult,
} from '../../shared/contracts/storage.contracts.js';
import { rpcValidationPipe } from '../../shared/rpc/rpc-validation.pipe.js';

/**
 * Internal TCP API. Only reachable from inside the network; callers must never
 * expose these patterns directly to the internet.
 */
@Controller()
@UsePipes(rpcValidationPipe)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** Reserves a key and returns a temporary URL the client PUTs the file to. */
  @MessagePattern(STORAGE_PATTERNS.getUploadUrl)
  getUploadUrl(@Payload() dto: GetUploadUrlDto): Promise<UploadUrlResult> {
    return this.storage.getUploadUrl(dto.contentType, dto.fileName, dto.namespace);
  }

  /** Confirms an upload: verifies size and type, returns the stored metadata. */
  @MessagePattern(STORAGE_PATTERNS.confirmUpload)
  confirmUpload(
    @Payload() dto: ObjectKeyDto,
  ): Promise<{ key: string; size: number; contentType: string | null }> {
    return this.storage.confirmUpload(dto.key);
  }

  /** Returns a temporary URL for downloading a private object. */
  @MessagePattern(STORAGE_PATTERNS.getDownloadUrl)
  getDownloadUrl(@Payload() dto: ObjectKeyDto): Promise<DownloadUrlResult> {
    return this.storage.getDownloadUrl(dto.key);
  }

  /** Removes an object; deleting a missing key is not an error. */
  @MessagePattern(STORAGE_PATTERNS.deleteObject)
  async deleteObject(
    @Payload() dto: ObjectKeyDto,
  ): Promise<{ key: string; deleted: true }> {
    await this.storage.deleteObject(dto.key);

    return { key: dto.key, deleted: true };
  }
}
