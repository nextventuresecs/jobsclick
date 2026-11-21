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
