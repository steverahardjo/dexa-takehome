import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';

import { rpcValidationPipe } from '../../shared/rpc/rpc-validation.pipe.js';
import { tcpServer } from '../../shared/rpc/tcp-clients.js';
import { AttendanceModule } from './attendance.module.js';

/** Attendance microservice: internal TCP only, no public port. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AttendanceModule,
    tcpServer('ATTENDANCE', 4004),
  );

  app.useGlobalPipes(rpcValidationPipe);

  await app.listen();
}

void bootstrap();
