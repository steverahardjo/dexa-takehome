import { ConfigService } from '@nestjs/config';
import type { Client } from 'minio';

import {
  createMinioClient,
  createMinioPresignClient,
} from './minio-client.provider.js';

/** The MinIO client keeps its resolved endpoint as plain fields. */
type Inspectable = Client & {
  host: string;
  port: number;
  protocol: string;
  region?: string;
};

const target = (client: Client): Inspectable => client as Inspectable;

const config = (overrides: Record<string, unknown> = {}): ConfigService =>
  new ConfigService({
    MINIO_ENDPOINT: 'rustfs',
    MINIO_PORT: '9000',
    MINIO_USE_SSL: 'false',
    MINIO_ACCESS_KEY: 'absencesrustfs',
    MINIO_SECRET_KEY: 'secret',
    ...overrides,
  });

describe('createMinioClient', () => {
  it('dials the internal endpoint', () => {
    const client = target(createMinioClient(config()));

    expect(client.host).toBe('rustfs');
    expect(client.port).toBe(9000);
    expect(client.protocol).toBe('http:');
  });

  it('falls back to the RustFS default region', () => {
    expect(target(createMinioClient(config())).region).toBe('us-east-1');
  });

  it('keeps an explicit region', () => {
    expect(
      target(createMinioClient(config({ MINIO_REGION: 'eu-west-1' }))).region,
    ).toBe('eu-west-1');
  });

  it('speaks https and port 443 when MINIO_USE_SSL is set', () => {
    const client = target(
      createMinioClient(config({ MINIO_USE_SSL: 'true', MINIO_PORT: '' })),
    );

    expect(client.protocol).toBe('https:');
    expect(client.port).toBe(443);
  });

  it('refuses a port that is not a positive integer', () => {
    expect(() => createMinioClient(config({ MINIO_PORT: 'abc' }))).toThrow(
      'MINIO_PORT must be a positive integer',
    );
  });

  it('requires credentials', () => {
    expect(() =>
      createMinioClient(
        config({ MINIO_ACCESS_KEY: undefined, MINIO_SECRET_KEY: undefined }),
      ),
    ).toThrow();
  });
});

describe('createMinioPresignClient', () => {
  it('signs for the internal endpoint when no public one is configured', () => {
    const client = target(createMinioPresignClient(config()));

    expect(client.host).toBe('rustfs');
    expect(client.port).toBe(9000);
  });

  it('signs for the public endpoint the browser resolves', () => {
    const client = target(
      createMinioPresignClient(
        config({
          MINIO_PUBLIC_ENDPOINT: 'localhost',
          MINIO_PUBLIC_PORT: '9100',
        }),
      ),
    );

    expect(client.host).toBe('localhost');
    expect(client.port).toBe(9100);
    expect(client.protocol).toBe('http:');
  });

  it('reuses the internal port when only the host differs', () => {
    const client = target(
      createMinioPresignClient(
        config({ MINIO_PUBLIC_ENDPOINT: 'storage.local' }),
      ),
    );

    expect(client.host).toBe('storage.local');
    expect(client.port).toBe(9000);
  });

  it('signs https for the public client independently of the internal one', () => {
    const client = target(
      createMinioPresignClient(
        config({
          MINIO_PUBLIC_ENDPOINT: 'storage.example.com',
          MINIO_PUBLIC_USE_SSL: 'true',
        }),
      ),
    );

    expect(client.protocol).toBe('https:');
    expect(client.port).toBe(443);
  });

  it('ignores a blank public endpoint', () => {
    const client = target(
      createMinioPresignClient(config({ MINIO_PUBLIC_ENDPOINT: '  ' })),
    );

    expect(client.host).toBe('rustfs');
  });
});
