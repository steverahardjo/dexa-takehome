import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';

import { tcpClients } from '../../../shared/rpc/tcp-clients.js';
import { GatewayAuthModule } from './auth/gateway-auth.module.js';
import {
  ATTENDANCE_CLIENT,
  AUTH_CLIENT,
  EMPLOYEE_CLIENT,
} from './clients/tokens.js';
import { AdminEmployeesController } from './controllers/admin-employees.controller.js';
import { AttendanceController } from './controllers/attendance.controller.js';
import { AuthController } from './controllers/auth.controller.js';
import { EmployeeMeController } from './controllers/employee-me.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { MeService } from './services/me.service.js';

/**
 * The one public HTTP process. It owns authentication (AuthGuard + @Roles),
 * request validation and the RPC -> HTTP error mapping; every other service is
 * internal TCP. It has no database of its own.
 *
 * Environment:
 *   GATEWAY_HTTP_PORT         public port, default 3003
 *   FRONTEND_ORIGIN           allowed CORS origins, comma separated
 *   AUTH_TCP_HOST/PORT        default 127.0.0.1:4002
 *   EMPLOYEE_TCP_HOST/PORT    default 127.0.0.1:4003
 *   ATTENDANCE_TCP_HOST/PORT  default 127.0.0.1:4004
 *   JWT_ACCESS_SECRET         must match the auth service (required)
 */
@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync(
      tcpClients(
        { name: AUTH_CLIENT, envPrefix: 'AUTH', defaultPort: 4002 },
        { name: EMPLOYEE_CLIENT, envPrefix: 'EMPLOYEE', defaultPort: 4003 },
        { name: ATTENDANCE_CLIENT, envPrefix: 'ATTENDANCE', defaultPort: 4004 },
      ),
    ),
    GatewayAuthModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    AdminEmployeesController,
    EmployeeMeController,
    AttendanceController,
  ],
  providers: [MeService],
})
export class AppModule {}
