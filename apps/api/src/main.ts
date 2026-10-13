import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
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

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );

  // Fastify multipart registration (No multer!)
  await app.register((multipart as unknown) as Parameters<NestFastifyApplication['register']>[0]);

  await app.listen(env.PORT, '0.0.0.0');
  console.log(`API running on http://localhost:${env.PORT}`);
}

bootstrap();
