import { captureSafeApiFailure, type SafeApiIncident } from '../config/sentry.js';
import { getSafeRequestId } from './request-id.js';
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

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof RateLimitException) {
      response.header('Retry-After', String(exception.retryAfter));
      response.header('retry-after', String(exception.retryAfter));
    }

    if (status >= 500) {
      const databaseCode =
        exception !== null && typeof exception === 'object' && 'code' in exception
          ? exception.code
          : undefined;
      const incident: SafeApiIncident = {
        requestId: getSafeRequestId(request),
        errorClass:
          typeof databaseCode === 'string' && /^[0-9A-Z]{5}$/.test(databaseCode)
            ? 'DatabaseError'
            : status === 503
              ? 'DependencyError'
              : 'InternalError',
      };
      this.logger.error(JSON.stringify(incident));
      captureSafeApiFailure(incident);
      const upstream = exception instanceof HttpException ? exception.getResponse() : null;
      const candidate =
        typeof upstream === 'string'
          ? upstream
          : upstream && typeof upstream === 'object' && 'message' in upstream
            ? upstream.message
            : undefined;
      // Only reviewed internal codes can pass. An uppercase upstream secret is still a secret.
      const allowlist = new Set([
        'AUTH_PROVIDER_LIFETIME_MISCONFIGURED',
        'AUTH_PROVIDER_UNAVAILABLE',
        'AUTH_SESSION_UNAVAILABLE',
        'AUTH_CLAIM_UNAVAILABLE',
        'AUTH_DEPENDENCY_UNAVAILABLE',
        'PUBLIC_DISCOVERY_UNAVAILABLE',
      ]);
      const code =
        typeof candidate === 'string' && allowlist.has(candidate)
          ? candidate
          : status === 503
            ? 'DEPENDENCY_UNAVAILABLE'
            : 'INTERNAL_SERVER_ERROR';
      response
        .status(status)
        .send({ statusCode: status, code, message: code, requestId: incident.requestId });
      return;
    }

    const resBody =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: status,
            error: 'Internal Server Error',
            message: 'INTERNAL_SERVER_ERROR',
          };

    response
      .status(status)
      .send(typeof resBody === 'string' ? { statusCode: status, message: resBody } : resBody);
  }
}
