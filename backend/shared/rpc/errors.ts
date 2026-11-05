/**
 * Error codes carried by RpcException payloads across services. Callers switch
 * on `code`, so the values are part of the wire contract. The gateway maps each
 * code to an HTTP status (shared/http/rpc-http.filter.ts).
 */
export const RPC_ERRORS = {
  invalidArgument: 'INVALID_ARGUMENT',
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  conflict: 'CONFLICT',
  payloadTooLarge: 'PAYLOAD_TOO_LARGE',
  rateLimited: 'RATE_LIMITED',
  unavailable: 'UNAVAILABLE',
} as const;

export type RpcErrorCode = (typeof RPC_ERRORS)[keyof typeof RPC_ERRORS];
