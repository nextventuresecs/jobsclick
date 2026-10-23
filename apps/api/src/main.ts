import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import crypto from 'node:crypto';
import { AppModule } from './app.module.js';
import { validateEnv } from './config/env.js';
import { initSentry } from './config/sentry.js';

interface FastifyRequestWithRawBody {
  rawBody?: string;
}

async function bootstrap() {
  const env = validateEnv();
  initSentry(env.SENTRY_DSN);

  const adapter = new FastifyAdapter();

  // Override the default JSON parser to also store the raw body.
  // QStash signs the exact bytes it sends. Fastify's default parser
  // discards the raw string. We store it on request.rawBody so the
  // signature guard can verify against the original bytes.
  adapter.getInstance().removeContentTypeParser('application/json');
  adapter.getInstance().addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req: unknown, rawBody: string, done: (err: null, result: unknown) => void) => {
      (req as FastifyRequestWithRawBody).rawBody = rawBody;
      try {
        done(null, JSON.parse(rawBody));
      } catch {
        done(null, rawBody);
      }
    },
  );

  // SEC-01: Administrative Queue Dashboard Guard
  adapter.getInstance().addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0] || '';
    if (url.startsWith('/admin/queues')) {
      const authHeader = req.headers['authorization'];
      const secret = process.env['ADMIN_DASHBOARD_SECRET'] || process.env['JWT_SECRET'];

      if (!authHeader) {
        reply.code(401).send({
          statusCode: 401,
          error: 'UNAUTHORIZED',
          message: 'Authentication required for administrative queue dashboard',
        });
        return;
      }

      let authorized = false;
      if (secret && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        // Check either matching secret directly or token comparison
        if (token.length === secret.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
          authorized = true;
        }
      }

      if (!authorized) {
        reply.code(403).send({
          statusCode: 403,
          error: 'FORBIDDEN',
          message: 'Insufficient administrative privileges to access queue dashboard',
        });
        return;
      }
    }
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );

  // Fastify multipart registration (No multer!)
  await app.register((multipart as unknown) as Parameters<NestFastifyApplication['register']>[0]);

  // Mount Bull-Board Dashboard UI behind /admin/queues
  try {
    const { QueueService } = await import('./queue/queue.service.js');
    const queueService = app.get(QueueService);
    await app.register(
      queueService.serverAdapter.registerPlugin() as unknown as Parameters<NestFastifyApplication['register']>[0],
      { prefix: '/admin/queues' } as unknown as Parameters<NestFastifyApplication['register']>[1],
    );
  } catch (err) {
    console.warn('[Bull-Board] Failed to mount Bull-Board on Fastify:', err);
  }

  await app.listen(env.PORT, '0.0.0.0');
  console.log(`API running on http://localhost:${env.PORT}`);
}

bootstrap();
