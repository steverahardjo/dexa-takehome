import { startService } from './bootstrap.js';
import { AppModule } from './app.module.js';

/** One process with every domain, for local development. */
const DEFAULT_PORT = 4000;

await startService(AppModule, DEFAULT_PORT, 'api');
