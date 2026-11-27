import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Observable, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { isStrictEnv } from '@indian-job-portal/validation';
import { QueueService } from '../queue/queue.service.js';

const LOCK_TTL_SECONDS = 30;
const COMPLETED_TTL_SECONDS = 86400;

/**
 * Provides replay and concurrent-delivery idempotency for QStash webhooks
 * keyed by the `upstash-message-id` header.
 * - Completed deliveries return cached success without re-executing handlers.
 * - Concurrent in-flight duplicates fail with 503 so QStash backs off cleanly.
 * - Failed handler executions release the lock so QStash retries are permitted.
 */
@Injectable()
export class QstashIdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(QstashIdempotencyInterceptor.name);

  constructor(@Optional() @Inject(QueueService) private readonly queueService?: QueueService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const rawMsgId = req.headers['upstash-message-id'];
    const messageId = Array.isArray(rawMsgId) ? rawMsgId[0]?.trim() : rawMsgId?.trim();

    if (!messageId || !this.queueService) {
      return next.handle();
    }

    const redis = this.queueService.connection;
    const doneKey = `qstash:done:${messageId}`;
    const lockKey = `qstash:lock:${messageId}`;

    try {
      const existing = await redis.get(doneKey);
      if (existing !== null) {
        try {
          return of(JSON.parse(existing));
        } catch {
          return of({ duplicate: true, messageId, status: 'already_processed' });
        }
      }

      const locked = await redis.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
      if (locked !== 'OK') {
        throw new ServiceUnavailableException({ code: 'QSTASH_DELIVERY_IN_FLIGHT' });
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      this.logger.warn(`QStash idempotency Redis check failed for ${messageId}`);
      if (isStrictEnv()) {
        throw new ServiceUnavailableException({ code: 'QSTASH_IDEMPOTENCY_UNAVAILABLE' });
      }
      return next.handle();
    }

    return next.handle().pipe(
      mergeMap(async (result) => {
        try {
          const serialized = JSON.stringify(result ?? { ok: true });
          await redis.set(doneKey, serialized, 'EX', COMPLETED_TTL_SECONDS);
          await redis.del(lockKey);
        } catch {
          await redis.del(lockKey).catch(() => undefined);
        }
        return result;
      }),
      catchError((err: unknown) => {
        void redis.del(lockKey).catch(() => undefined);
        return throwError(() => err);
      }),
    );
  }
}
