import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';

import { rpcValidationPipe } from '../../shared/rpc/rpc-validation.pipe.js';
import { tcpServer } from '../../shared/rpc/tcp-clients.js';
import { EmployeeModule } from './employee.module.js';

/** Employee microservice: internal TCP only, no public port. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    EmployeeModule,
    tcpServer('EMPLOYEE', 4003),
  );

  app.useGlobalPipes(rpcValidationPipe);

  await app.listen();
}

void bootstrap();
