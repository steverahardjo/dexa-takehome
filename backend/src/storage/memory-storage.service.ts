import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  buildObjectUrl,
  type StorageUploadResult,
  type StoredObject,
  type StreamableStorageProvider,
} from './storage.interface.js';

interface MemoryObject {
  body: Buffer;
  contentType: string;
  uploadedAt: Date;
}

/**
 * Development/test storage. Objects live in process memory and disappear on
 * restart, which is exactly what local development and tests need.
 */
@Injectable()
export class MemoryStorageService implements StreamableStorageProvider {
  private readonly objects = new Map<string, MemoryObject>();
  private readonly publicApiUrl: string;

  constructor(config: ConfigService) {
    this.publicApiUrl = config.get<string>('publicApiUrl', 'http://localhost:3000');
  }

  async upload(file: Express.Multer.File, key: string): Promise<StorageUploadResult> {
    if (!file?.buffer) {
      throw new NotFoundException('No file content received');
    }

    // Prefix with a short random segment so identical keys cannot collide.
    const storedKey = `${key}-${randomUUID().slice(0, 8)}`;
    this.objects.set(storedKey, {
      body: file.buffer,
      contentType: file.mimetype || 'application/octet-stream',
      uploadedAt: new Date(),
    });

    return { key: storedKey, url: buildObjectUrl(this.publicApiUrl, storedKey) };
  }

  async getUrl(key: string): Promise<string> {
    if (!this.objects.has(key)) throw new NotFoundException('Object not found');
    return buildObjectUrl(this.publicApiUrl, key);
  }

  async read(key: string): Promise<StoredObject> {
    const object = this.objects.get(key);
    if (!object) throw new NotFoundException('Object not found');
    return {
      body: object.body,
      contentType: object.contentType,
      contentLength: object.body.byteLength,
    };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  /** Test helper: current object count. */
  size(): number {
    return this.objects.size;
  }

  clear(): void {
    this.objects.clear();
  }
}
