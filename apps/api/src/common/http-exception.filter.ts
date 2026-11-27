import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RateLimitException } from './rate-limit.exception.js';
import { emitAuthorizationAuditEvent } from '../auth/authorization-audit.service.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest & { user?: AuthUser }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof RateLimitException) {
      response.header('Retry-After', String(exception.retryAfter));
      response.header('retry-after', String(exception.retryAfter));
    }

    const resBody =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: status,
            error: 'Internal Server Error',
            message: (exception as Error)?.message || 'Internal server error',
          };

    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      const rawReqId = request?.headers?.['x-request-id'];
      const requestId =
        typeof rawReqId === 'string' && rawReqId.trim()
          ? rawReqId.trim()
          : (request?.id ? String(request.id) : undefined);
      const bodyObj = typeof resBody === 'object' && resBody !== null ? (resBody as Record<string, unknown>) : null;
      const reasonCode = String(
        bodyObj?.['code'] || bodyObj?.['error'] || (status === 401 ? 'HTTP_401_UNAUTHORIZED' : 'HTTP_403_FORBIDDEN'),
      );
      const routePath = (request?.url || '/').split('?')[0] || '/';
      const auditEvent = emitAuthorizationAuditEvent({
        requestId,
        actorId: request?.user?.id ?? null,
        role: request?.user?.role ?? null,
        tenantId: request?.user?.id ?? null,
        action: `${request?.method || 'UNKNOWN'} ${routePath}`,
        decision: 'deny',
        reasonCode,
        policyId: status === 401 ? 'ADR-0002-AUTHN-GUARD' : 'ADR-0002-AUTHZ-GUARD',
      });
      response.header('X-Request-Id', auditEvent.requestId);
    }

    if (status >= 500) {
      this.logger.error(
        `HTTP ${status} on ${request?.method} ${request?.url}: ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).send(
      typeof resBody === 'string'
        ? { statusCode: status, message: resBody }
        : resBody,
    );
  }
}
