import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';

import { rpcValidationPipe } from '../../shared/rpc/rpc-validation.pipe.js';
import { tcpServer } from '../../shared/rpc/tcp-clients.js';
import { AuthModule } from './auth.module.js';

/** Auth microservice: internal TCP only, no public port. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AuthModule,
    tcpServer('AUTH', 4002),
  );

  app.useGlobalPipes(rpcValidationPipe);

  await app.listen();
}

void bootstrap();
