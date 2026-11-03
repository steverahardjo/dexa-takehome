import { startService } from '../../bootstrap.js';
import { AuthServiceAppModule } from './app.module.js';

const DEFAULT_PORT = 3001;

await startService(
  AuthServiceAppModule,
  DEFAULT_PORT,
  'auth',
);
