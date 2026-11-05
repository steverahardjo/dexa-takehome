import { ConfigService } from '@nestjs/config';
import { Client, ClientOptions } from 'minio';

/** DI token for the MinIO client, so it can be swapped in tests. */
export const MINIO_CLIENT = Symbol('MINIO_CLIENT');

export function createMinioClient(config: ConfigService): Client {
  const useSSL = config.get<string>('MINIO_USE_SSL', 'false') === 'true';
  const port = Number(config.get('MINIO_PORT', useSSL ? 443 : 9000));

  const options: ClientOptions = {
    // Host only, no scheme: "minio", not "http://minio".
    endPoint: config.getOrThrow<string>('MINIO_ENDPOINT'),
    port,
    useSSL,
    accessKey: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
    secretKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
    region: config.get<string>('MINIO_REGION'),
  };

  return new Client(options);
}
