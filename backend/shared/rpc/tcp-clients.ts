import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  type ClientsProviderAsyncOptions,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';

/**
 * One entry per TCP client a module depends on. Every service follows the same
 * `<PREFIX>_TCP_HOST` / `<PREFIX>_TCP_PORT` convention, so a module never
 * repeats the transport boilerplate.
 */
export interface TcpClientSpec {
  /** DI token used with `@Inject(...)`. */
  name: string | symbol;
  /** Variable prefix, e.g. `EMPLOYEE` for EMPLOYEE_TCP_HOST/PORT. */
  envPrefix: string;
  defaultPort: number;
  defaultHost?: string;
}

/** `ClientsModule.registerAsync(tcpClients(...))` from a list of specs. */
export const tcpClients = (
  ...specs: TcpClientSpec[]
): ClientsProviderAsyncOptions[] =>
  specs.map((spec) => ({
    name: spec.name,
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      transport: Transport.TCP,
      options: {
        host: config.get<string>(
          `${spec.envPrefix}_TCP_HOST`,
          spec.defaultHost ?? '127.0.0.1',
        ),
        port: Number(
          config.get(`${spec.envPrefix}_TCP_PORT`, spec.defaultPort),
        ),
      },
    }),
  }));

/**
 * The listening side of the same convention, for `createMicroservice` (which
 * runs before ConfigService exists).
 */
export const tcpServer = (
  envPrefix: string,
  defaultPort: number,
  defaultHost = '127.0.0.1',
): MicroserviceOptions => ({
  transport: Transport.TCP,
  options: {
    host: process.env[`${envPrefix}_TCP_HOST`] ?? defaultHost,
    port: Number(process.env[`${envPrefix}_TCP_PORT`] ?? defaultPort),
  },
});
