import { startService } from '../../bootstrap.js';
import { AdminServiceAppModule } from './app.module.js';

const DEFAULT_PORT = 3003;

await startService(
  AdminServiceAppModule,
  DEFAULT_PORT,
  'admin',
);
