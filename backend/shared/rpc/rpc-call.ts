import { RpcException } from '@nestjs/microservices';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

import { STORAGE_ERRORS } from '../contracts/storage.contracts.js';
import { RPC_ERRORS } from './errors.js';

/** How long a service waits for another service before giving up. */
export const RPC_CALL_TIMEOUT_MS = 5000;

/** The only `code` values that may travel between services. */
const RPC_CODES = new Set<string>([
  ...Object.values(RPC_ERRORS),
  ...Object.values(STORAGE_ERRORS),
]);

/**
 * The RPC exception filter flattens anything that is not an RpcException to
 * "Internal server error", which throws away the code the caller needs. Errors
 * bubbling out of a ClientProxy are therefore re-wrapped in an RpcException.
 *
 * Only a known contract code is passed through: a transport failure such as
 * ECONNREFUSED also carries `{ code, message }`, and forwarding it would leak
 * hostnames and driver details to the client.
 */
export function toRpcException(
  error: unknown,
  fallbackMessage: string,
): RpcException {
  const payload = error as { code?: unknown; message?: unknown } | null;

  if (
    payload &&
    typeof payload.code === 'string' &&
    RPC_CODES.has(payload.code) &&
    typeof payload.message === 'string'
  ) {
    return new RpcException({ code: payload.code, message: payload.message });
  }

  return new RpcException({
    code: RPC_ERRORS.unavailable,
    message: fallbackMessage,
  });
}

/**
 * Request/response call to another service, with the shared timeout and error
 * mapping. Every caller uses this instead of hand-rolling `firstValueFrom`.
 */
export async function sendRpc<T>(
  client: ClientProxy,
  pattern: string,
  payload: unknown,
  fallbackMessage: string,
): Promise<T> {
  try {
    return await firstValueFrom(
      client.send<T>(pattern, payload).pipe(timeout({ first: RPC_CALL_TIMEOUT_MS })),
    );
  } catch (error) {
    throw toRpcException(error, fallbackMessage);
  }
}
