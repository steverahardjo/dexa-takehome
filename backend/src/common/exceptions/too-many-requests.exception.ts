import { HttpException, HttpStatus } from '@nestjs/common';

/** Nest has no built-in 429 class, so this keeps the error envelope consistent. */
export class TooManyRequestsException extends HttpException {
  constructor(message = 'Too many requests') {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
