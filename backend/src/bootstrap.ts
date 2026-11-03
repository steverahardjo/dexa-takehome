import { Logger, ValidationPipe, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { env, servicePort } from './config/env.js';

/**
 * Shared boot for the three containers: the same validation and CORS rules,
 * only the module and the default port differ.
 */
export async function startService(
  appModule: Type,
  defaultPort: number,
  name: string,
): Promise<void> {
  const app = await NestFactory.create(appModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const origins = env
    .string('FRONTEND_ORIGIN', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins.includes('*') ? true : origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });

  app.enableShutdownHooks();

  const port = servicePort(defaultPort);

  await app.listen(port, '0.0.0.0');

  new Logger(name).log(`${name} listening on http://0.0.0.0:${port}`);
}
