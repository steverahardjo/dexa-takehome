import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { Response } from 'express';

import { STORAGE_ERRORS } from '../contracts/storage.contracts.js';
import { RPC_ERRORS } from '../rpc/errors.js';

/** Wire error code -> HTTP status. Anything unknown is a bad gateway. */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  [RPC_ERRORS.invalidArgument]: HttpStatus.BAD_REQUEST,
  [RPC_ERRORS.unauthorized]: HttpStatus.UNAUTHORIZED,
  [RPC_ERRORS.forbidden]: HttpStatus.FORBIDDEN,
  [RPC_ERRORS.notFound]: HttpStatus.NOT_FOUND,
  [RPC_ERRORS.conflict]: HttpStatus.CONFLICT,
  [RPC_ERRORS.payloadTooLarge]: HttpStatus.PAYLOAD_TOO_LARGE,
  [RPC_ERRORS.rateLimited]: HttpStatus.TOO_MANY_REQUESTS,
  [RPC_ERRORS.unavailable]: HttpStatus.SERVICE_UNAVAILABLE,
  [STORAGE_ERRORS.unavailable]: HttpStatus.SERVICE_UNAVAILABLE,
};

interface ErrorBody {
  statusCode: number;
  message: string;
}

/**
 * The gateway is the only place where an RpcException (or anything else thrown
 * by a service) turns into an HTTP response. Without this filter every service
 * error would surface as a 500 and the client could not tell "already checked
 * in" (409) from "weekend" (403).
 */
@Catch()
export class RpcHttpFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcHttpFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);

    // 5xx means the client cannot fix it: keep the detail in the log only.
    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${body.statusCode} ${body.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      return {
        statusCode: exception.getStatus(),
        message: this.messageOf(exception.getResponse(), exception.message),
      };
    }

    if (exception instanceof RpcException) {
      const error = exception.getError();

      if (typeof error === 'string') {
        return { statusCode: HttpStatus.BAD_GATEWAY, message: error };
      }

      const payload = error as { code?: string; message?: string };

      return {
        statusCode:
          STATUS_BY_CODE[payload.code ?? ''] ?? HttpStatus.BAD_GATEWAY,
        message: payload.message ?? 'The service request failed',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }

  /** Nest's own error bodies are `{ message: string | string[] }`. */
  private messageOf(response: string | object, fallback: string): string {
    if (typeof response === 'string') return response;

    const message = (response as { message?: unknown }).message;

    if (Array.isArray(message)) {
      return message.filter((part) => typeof part === 'string').join(', ');
    }

    return typeof message === 'string' && message.trim() ? message : fallback;
  }
}
