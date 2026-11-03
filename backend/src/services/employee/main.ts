import { startService } from '../../bootstrap.js';
import { EmployeeServiceAppModule } from './app.module.js';

const DEFAULT_PORT = 3002;

await startService(
  EmployeeServiceAppModule,
  DEFAULT_PORT,
  'employee',
);
