/**
 * Applies pending migrations without booting the HTTP server.
 * The API also runs them on start (`DB_MIGRATIONS_RUN=true` by default); this is
 * for CI/deploy pipelines that migrate before switching traffic.
 */
import { AppDataSource } from './data-source.js';

await AppDataSource.initialize();
console.log('Database is up to date: all registered migrations have been applied.');
await AppDataSource.destroy();
