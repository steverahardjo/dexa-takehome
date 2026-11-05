import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import { RPC_ERRORS } from './errors.js';

const messagesOf = (errors: ValidationError[]): string[] =>
  errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...messagesOf(error.children ?? []),
  ]);

/**
 * HTTP exceptions are reported as "Internal server error" by the RPC exception
 * filter, so validation failures are re-thrown as RpcException with the
 * offending constraints instead.
 */
export const rpcValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: (errors: ValidationError[]) =>
    new RpcException({
      code: RPC_ERRORS.invalidArgument,
      message: messagesOf(errors).join(', ') || 'Invalid payload',
    }),
});
