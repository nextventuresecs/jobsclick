import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
declare module 'fastify' {
  interface FastifyRequest {
    authRequestId?: string;
  }
}
/** Internal correlation only. Never take an audit/request ID from a browser header or body. */
export function getSafeRequestId(request: FastifyRequest): string {
  if (
    !request.authRequestId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      request.authRequestId,
    )
  )
    request.authRequestId = randomUUID();
  return request.authRequestId;
}
