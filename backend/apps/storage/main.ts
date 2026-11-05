import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';

import { StorageModule } from './storage.module.js';
import { rpcValidationPipe } from '../../shared/rpc/rpc-validation.pipe.js';
import { tcpServer } from '../../shared/rpc/tcp-clients.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    StorageModule,
    // Bind to the private network only: this transport has no auth.
    tcpServer('STORAGE', 4001, '0.0.0.0'),
  );

  app.useGlobalPipes(rpcValidationPipe);

  await app.listen();
}

void bootstrap();
