import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { RpcHttpFilter } from '../../../shared/http/rpc-http.filter.js';
import { AppModule } from './app.module.js';
import { logOpenApi, setupOpenApi } from './docs/openapi.js';

/**
 * The gateway: the only process the browser talks to.
 *
 * Validation happens here and again in each service (a service never trusts its
 * transport), and every RpcException leaves through RpcHttpFilter so a "already
 * checked in" is a 409 and a weekend check-in is a 403.
 *
 * The OpenAPI document is served from this process too, because it is the only
 * HTTP surface there is: /docs (UI), /docs-json, /docs-yaml. Set
 * OPENAPI_ENABLED=false to turn it off.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new RpcHttpFilter());

  const origins = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins.includes('*') ? true : origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });

  const port = Number(process.env.GATEWAY_HTTP_PORT ?? 3003);

  if (setupOpenApi(app)) {
    logOpenApi(port);
  }

  await app.listen(port);
  Logger.log(`Gateway listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
