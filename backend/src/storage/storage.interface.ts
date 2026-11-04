import type { Readable } from 'node:stream';

export interface StorageUploadResult {
  key: string;
  url: string;
}

/**
 * Common contract for binary evidence (attendance photos). Configuration decides
 * whether the S3 implementation or the in-memory development mock is used.
 */
export interface StorageProvider {
  upload(file: Express.Multer.File, key: string): Promise<StorageUploadResult>;
  getUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface StoredObject {
  body: Buffer | Readable;
  contentType: string;
  contentLength?: number;
}

/** Only the in-memory provider can stream an object back directly. */
export interface StreamableStorageProvider extends StorageProvider {
  read(key: string): Promise<StoredObject>;
}

export function isStreamableStorage(
  provider: StorageProvider,
): provider is StreamableStorageProvider {
  return typeof (provider as StreamableStorageProvider).read === 'function';
}

/** Stable, opaque URL for an object. Persisting this is safe; S3 URLs expire. */
export function buildObjectUrl(publicApiUrl: string, key: string): string {
  const token = Buffer.from(key, 'utf8').toString('base64url');
  return `${publicApiUrl.replace(/\/$/, '')}/storage/objects/${token}`;
}

export function decodeObjectToken(token: string): string {
  return Buffer.from(token, 'base64url').toString('utf8');
}
