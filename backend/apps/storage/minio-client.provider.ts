import { ConfigService } from '@nestjs/config';
import { Client, ClientOptions } from 'minio';

/** DI token for the MinIO client, so it can be swapped in tests. */
export const MINIO_CLIENT = Symbol('MINIO_CLIENT');

/**
 * Separate client used only to sign URLs. A presigned URL is signed over the
 * host the *browser* will connect to, which in development is not the compose
 * service name the backend dials (see MINIO_PUBLIC_ENDPOINT).
 */
export const MINIO_PRESIGN_CLIENT = Symbol('MINIO_PRESIGN_CLIENT');

/**
 * S3 servers reject a request whose SigV4 scope carries a region they do not
 * serve. RustFS falls back to us-east-1 when RUSTFS_REGION is unset, so sign
 * with the same default instead of letting the SDK pick per operation.
 */
const DEFAULT_REGION = 'us-east-1';

const isTrue = (value: string | undefined, fallback = false): boolean =>
  value === undefined ? fallback : value === 'true';

const portOf = (
  name: string,
  raw: string | number | undefined,
  fallback: number,
): number => {
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const port = Number(raw);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return port;
};

function clientFrom(
  config: ConfigService,
  options: { endpoint: string; port: number; useSSL: boolean },
): Client {
  const clientOptions: ClientOptions = {
    endPoint: options.endpoint,
    port: options.port,
    useSSL: options.useSSL,
    accessKey: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
    secretKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
    region: config.get<string>('MINIO_REGION', DEFAULT_REGION),
  };

  return new Client(clientOptions);
}

export function createMinioClient(config: ConfigService): Client {
  const useSSL = isTrue(config.get<string>('MINIO_USE_SSL'));

  return clientFrom(config, {
    // Host only, no scheme: "rustfs", not "http://rustfs".
    endpoint: config.getOrThrow<string>('MINIO_ENDPOINT'),
    port: portOf(
      'MINIO_PORT',
      config.get<string>('MINIO_PORT'),
      useSSL ? 443 : 9000,
    ),
    useSSL,
  });
}

export function createMinioPresignClient(config: ConfigService): Client {
  const useSSL = isTrue(config.get<string>('MINIO_USE_SSL'));

  const internalPort = portOf(
    'MINIO_PORT',
    config.get<string>('MINIO_PORT'),
    useSSL ? 443 : 9000,
  );

  const publicEndpoint =
    config.get<string>('MINIO_PUBLIC_ENDPOINT')?.trim() ||
    config.getOrThrow<string>('MINIO_ENDPOINT');

  const publicUseSSL = isTrue(
    config.get<string>('MINIO_PUBLIC_USE_SSL'),
    useSSL,
  );

  return clientFrom(config, {
    endpoint: publicEndpoint,
    // Unset means "same port the backend uses", which is the single-host case.
    port: portOf(
      'MINIO_PUBLIC_PORT',
      config.get<string>('MINIO_PUBLIC_PORT'),
      publicUseSSL ? 443 : internalPort,
    ),
    useSSL: publicUseSSL,
  });
}
