import type {
  TypeOrmModuleAsyncOptions,
  TypeOrmModuleOptions,
} from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

interface DatabaseOptions {
  /** Name of the data source, see shared/database/data-sources.ts. */
  name: string;
  entities: NonNullable<TypeOrmModuleOptions['entities']>;
  /** Overrides DB_DATABASE for this service when set. */
  database?: string;
}

/**
 * Shared TypeORM options, MySQL 8 as prescribed by docker-compose.
 *
 * Every service connects with the same `DB_*` variables; each module declares
 * only the entities it owns and registers them under its own data-source name.
 */
export function databaseOptions(
  config: ConfigService,
  { name, entities, database }: DatabaseOptions,
): TypeOrmModuleOptions {
  return {
    name,
    type: 'mysql',
    host: config.get<string>('DB_HOST', '127.0.0.1'),
    port: Number(config.get('DB_PORT', 3306)),
    username: config.get<string>('DB_USERNAME', 'attendance'),
    password: config.get<string>('DB_PASSWORD', 'attend1234'),
    database: database ?? config.get<string>('DB_DATABASE', 'absences'),
    charset: 'utf8mb4',
    // Store and read instants as UTC; `date` columns come back as YYYY-MM-DD.
    timezone: 'Z',
    dateStrings: ['DATE'],
    entities,
    // No migrations yet; disable in production via DB_SYNCHRONIZE=false.
    synchronize: config.get<string>('DB_SYNCHRONIZE', 'true') !== 'false',
    logging: config.get<string>('DB_LOGGING', 'false') === 'true',
    extra: { connectionLimit: Number(config.get('DB_POOL_SIZE', 10)) },
  };
}

/**
 * `TypeOrmModule.forRootAsync(serviceDatabase(NAME, [Entity]))` — the one line
 * every service uses to open its connection. Same MySQL server and credentials
 * for all of them; each module only declares the entities it owns.
 */
export function serviceDatabase(
  name: string,
  entities: NonNullable<TypeOrmModuleOptions['entities']>,
): TypeOrmModuleAsyncOptions {
  return {
    name,
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
      databaseOptions(config, { name, entities }),
  };
}
