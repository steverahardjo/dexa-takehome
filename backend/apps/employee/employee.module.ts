import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';

import { serviceDatabase } from '../../shared/database/database-options.js';
import { EMPLOYEE_DATA_SOURCE } from '../../shared/database/data-sources.js';
import { tcpClients } from '../../shared/rpc/tcp-clients.js';
import { AUTH_CLIENT, STORAGE_CLIENT } from './clients/microservice-clients.js';
import { EmployeeController } from './controller/employee.controller.js';
import { Division } from './entity/division.entity.js';
import { Employee } from './entity/employee.entity.js';
import { EmployeeService } from './services/employee.service.js';

/**
 * Employee microservice (TCP only). Owns the employee database and calls auth
 * for identities and storage for avatars; the gateway exposes it over HTTP.
 *
 * Environment:
 *   EMPLOYEE_TCP_HOST/PORT  internal transport, default 127.0.0.1:4003
 *   AUTH_TCP_HOST/PORT      auth service, default 127.0.0.1:4002
 *   STORAGE_TCP_HOST/PORT   storage service, default 127.0.0.1:4001
 *   DB_SYNCHRONIZE          "false" to disable schema sync, default true
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync(
      serviceDatabase(EMPLOYEE_DATA_SOURCE, [Employee, Division]),
    ),
    TypeOrmModule.forFeature([Employee, Division], EMPLOYEE_DATA_SOURCE),
    ClientsModule.registerAsync(
      tcpClients(
        { name: AUTH_CLIENT, envPrefix: 'AUTH', defaultPort: 4002 },
        { name: STORAGE_CLIENT, envPrefix: 'STORAGE', defaultPort: 4001 },
      ),
    ),
  ],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
