import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import type { Client } from 'minio';

import { GetUploadUrlDto } from './dto/get-upload-url.dto.js';
import { StorageService } from './services/storage.service.js';
import { STORAGE_ERRORS } from '../../shared/contracts/storage.contracts.js';
import { rpcValidationPipe } from '../../shared/rpc/rpc-validation.pipe.js';

const BUCKET = 'absences';
const KEY = 'avatars/2026/11/0f1b4b9a-6d78-4c1d-9d3f-2a1b3c4d5e6f.png';

const config = (overrides: Record<string, unknown> = {}): ConfigService =>
  new ConfigService({
    MINIO_BUCKET: BUCKET,
    MINIO_UPLOAD_URL_TTL: 600,
    MINIO_DOWNLOAD_URL_TTL: 300,
    ...overrides,
  });

interface FakeClient {
  bucketExists: ReturnType<typeof vi.fn>;
  makeBucket: ReturnType<typeof vi.fn>;
  presignedPutObject: ReturnType<typeof vi.fn>;
  presignedGetObject: ReturnType<typeof vi.fn>;
  statObject: ReturnType<typeof vi.fn>;
  removeObject: ReturnType<typeof vi.fn>;
}

const createClient = (): FakeClient => ({
  bucketExists: vi.fn().mockResolvedValue(true),
  makeBucket: vi.fn().mockResolvedValue(undefined),
  presignedPutObject: vi
    .fn()
    .mockResolvedValue('https://minio/absences/key?upload-signature'),
  presignedGetObject: vi
    .fn()
    .mockResolvedValue('https://minio/absences/key?download-signature'),
  statObject: vi.fn().mockResolvedValue({
    size: 17,
    etag: 'etag-1',
    lastModified: new Date(),
    metaData: { 'Content-Type': 'image/png' },
  }),
  removeObject: vi.fn().mockResolvedValue(undefined),
});

const createService = (
  client: FakeClient = createClient(),
  overrides: Record<string, unknown> = {},
  // Same fake by default: presigning and bucket operations then share one
  // record, so existing assertions stay valid. Pass a second client to assert
  // the two are wired separately.
  presign: FakeClient = client,
): { service: StorageService; client: FakeClient; presign: FakeClient } => ({
  service: new StorageService(
    client as unknown as Client,
    presign as unknown as Client,
    config(overrides),
  ),
  client,
  presign,
});

const errorWithCode = (code: string): Error =>
  Object.assign(new Error(`minio: ${code}`), { code });

const expectRpcCode = async (
  promise: Promise<unknown>,
  code: string,
): Promise<void> => {
  await expect(promise).rejects.toBeInstanceOf(RpcException);
  await promise.catch((error: RpcException) => {
    expect(error.getError()).toMatchObject({ code });
  });
};

describe('StorageService.onModuleInit', () => {
  it('creates the bucket when it does not exist', async () => {
    const client = createClient();
    client.bucketExists.mockResolvedValue(false);
    const { service } = createService(client);

    await service.onModuleInit();

    expect(client.makeBucket).toHaveBeenCalledWith(BUCKET);
  });

  it('leaves an existing bucket alone', async () => {
    const client = createClient();
    const { service } = createService(client);

    await service.onModuleInit();

    expect(client.makeBucket).not.toHaveBeenCalled();
  });

  it('retries while the S3 listener is still starting', async () => {
    vi.useFakeTimers();

    try {
      const client = createClient();
      client.bucketExists
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue(true);
      const { service } = createService(client);

      const init = service.onModuleInit();
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(init).resolves.toBeUndefined();
      expect(client.bucketExists).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after the retry budget so compose can restart it', async () => {
    vi.useFakeTimers();

    try {
      const client = createClient();
      client.bucketExists.mockRejectedValue(new Error('ECONNREFUSED'));
      const { service } = createService(client);
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const init = service.onModuleInit();
      const settled = expect(init).rejects.toThrow('ECONNREFUSED');

      await vi.advanceTimersByTimeAsync(9_000);
      await settled;
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});

describe('StorageService.getUploadUrl', () => {
  it('reserves a key with the right extension and presigns a PUT', async () => {
    const { service, client } = createService();

    const result = await service.getUploadUrl('image/png');

    expect(result.key).toMatch(/^avatars\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
    expect(client.presignedPutObject).toHaveBeenCalledWith(
      BUCKET,
      result.key,
      600,
    );
    expect(result).toEqual({
      key: result.key,
      uploadUrl: 'https://minio/absences/key?upload-signature',
      expiresInSeconds: 600,
    });
  });

  it('signs with the presign client, not the internal one', async () => {
    const client = createClient();
    const presign = createClient();
    const { service } = createService(client, {}, presign);

    await service.getUploadUrl('image/png');

    expect(presign.presignedPutObject).toHaveBeenCalledTimes(1);
    expect(client.presignedPutObject).not.toHaveBeenCalled();
  });

  it('refuses a fileName that disagrees with the contentType', async () => {
    const { service } = createService();

    await expect(
      service.getUploadUrl('image/png', 'photo.jpg'),
    ).rejects.toMatchObject({ error: { code: 'INVALID_ARGUMENT' } });
  });

  it.each([
    ['image/jpeg', '.jpg'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif'],
    ['application/pdf', '.pdf'],
  ])('maps %s to a %s key', async (contentType, extension) => {
    const { service } = createService();

    const { key } = await service.getUploadUrl(contentType);

    expect(key.endsWith(extension)).toBe(true);
  });

  it('rejects a type it cannot serve without presigning', async () => {
    const { service, client } = createService();

    await expectRpcCode(
      service.getUploadUrl('text/html'),
      STORAGE_ERRORS.invalidArgument,
    );
    expect(client.presignedPutObject).not.toHaveBeenCalled();
  });

  it('maps presign failures to unavailable', async () => {
    const client = createClient();
    client.presignedPutObject.mockRejectedValue(new Error('connection reset'));
    const { service } = createService(client);

    await expectRpcCode(
      service.getUploadUrl('image/png'),
      STORAGE_ERRORS.unavailable,
    );
  });
});

describe('StorageService.confirmUpload', () => {
  it('returns the metadata of a valid upload', async () => {
    const { service, client } = createService();

    await expect(service.confirmUpload(KEY)).resolves.toEqual({
      key: KEY,
      size: 17,
      contentType: 'image/png',
    });
    expect(client.statObject).toHaveBeenCalledWith(BUCKET, KEY);
    expect(client.removeObject).not.toHaveBeenCalled();
  });

  it('deletes an upload that exceeds the size limit', async () => {
    const client = createClient();
    client.statObject.mockResolvedValue({
      size: 11 * 1024 * 1024,
      etag: 'e',
      lastModified: new Date(),
      metaData: { 'Content-Type': 'image/png' },
    });
    const { service } = createService(client);

    await expectRpcCode(
      service.confirmUpload(KEY),
      STORAGE_ERRORS.payloadTooLarge,
    );
    expect(client.removeObject).toHaveBeenCalledWith(BUCKET, KEY);
  });

  it('deletes an upload whose stored content type is not allowed', async () => {
    const client = createClient();
    client.statObject.mockResolvedValue({
      size: 17,
      etag: 'e',
      lastModified: new Date(),
      metaData: { 'Content-Type': 'text/html' },
    });
    const { service } = createService(client);

    await expectRpcCode(
      service.confirmUpload(KEY),
      STORAGE_ERRORS.invalidArgument,
    );
    expect(client.removeObject).toHaveBeenCalledWith(BUCKET, KEY);
  });

  it('deletes an upload with no content type at all', async () => {
    const client = createClient();
    client.statObject.mockResolvedValue({
      size: 17,
      etag: 'e',
      lastModified: new Date(),
      metaData: {},
    });
    const { service } = createService(client);

    await expectRpcCode(
      service.confirmUpload(KEY),
      STORAGE_ERRORS.invalidArgument,
    );
    expect(client.removeObject).toHaveBeenCalledWith(BUCKET, KEY);
  });

  it('reports a missing object as NOT_FOUND without deleting', async () => {
    const client = createClient();
    client.statObject.mockRejectedValue(errorWithCode('NotFound'));
    const { service } = createService(client);

    await expectRpcCode(service.confirmUpload(KEY), STORAGE_ERRORS.notFound);
    expect(client.removeObject).not.toHaveBeenCalled();
  });

  it('rejects a key the service did not hand out', async () => {
    const { service, client } = createService();

    await expectRpcCode(
      service.confirmUpload('../../etc/passwd'),
      STORAGE_ERRORS.invalidArgument,
    );
    expect(client.statObject).not.toHaveBeenCalled();
  });
});

describe('StorageService.getDownloadUrl', () => {
  it('presigns a GET with the download TTL and returns metadata', async () => {
    const { service, client } = createService();

    await expect(service.getDownloadUrl(KEY)).resolves.toEqual({
      key: KEY,
      downloadUrl: 'https://minio/absences/key?download-signature',
      expiresInSeconds: 300,
      contentType: 'image/png',
      size: 17,
    });
    expect(client.presignedGetObject).toHaveBeenCalledWith(BUCKET, KEY, 300);
  });

  it('fails with NOT_FOUND instead of returning a URL that would 404', async () => {
    const client = createClient();
    client.statObject.mockRejectedValue(errorWithCode('NoSuchKey'));
    const { service } = createService(client);

    await expectRpcCode(service.getDownloadUrl(KEY), STORAGE_ERRORS.notFound);
    expect(client.presignedGetObject).not.toHaveBeenCalled();
  });

  it('rejects an invalid key', async () => {
    const { service, client } = createService();

    await expectRpcCode(
      service.getDownloadUrl('avatars/ada.png'),
      STORAGE_ERRORS.invalidArgument,
    );
    expect(client.statObject).not.toHaveBeenCalled();
  });
});

describe('StorageService.deleteObject', () => {
  it('removes the object', async () => {
    const { service, client } = createService();

    await expect(service.deleteObject(KEY)).resolves.toBeUndefined();
    expect(client.removeObject).toHaveBeenCalledWith(BUCKET, KEY);
  });

  it('rejects an invalid key without touching storage', async () => {
    const { service, client } = createService();

    await expectRpcCode(
      service.deleteObject('avatars/2026/11/not-a-uuid.png'),
      STORAGE_ERRORS.invalidArgument,
    );
    expect(client.removeObject).not.toHaveBeenCalled();
  });
});

describe('rpcValidationPipe', () => {
  const transform = (payload: unknown): Promise<unknown> =>
    rpcValidationPipe.transform(payload, {
      type: 'body',
      metatype: GetUploadUrlDto,
    });

  it('accepts a well formed upload URL payload', async () => {
    await expect(transform({ contentType: 'image/png' })).resolves.toEqual({
      contentType: 'image/png',
    });
  });

  it('reports a missing contentType as INVALID_ARGUMENT', async () => {
    await expectRpcCode(transform({}), STORAGE_ERRORS.invalidArgument);
  });

  it('rejects unknown fields', async () => {
    await expectRpcCode(
      transform({ contentType: 'image/png', key: 'x.png' }),
      STORAGE_ERRORS.invalidArgument,
    );
  });
});
