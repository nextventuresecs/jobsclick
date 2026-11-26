import './instrument.js';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { AppModule } from './app.module.js';
import { validateEnv } from './config/env.js';
import { configureWebCors } from './config/web-cors.js';
import { registerApiSecurityHeaders } from './config/security-headers.js';
import { registerAdminQueueGuard } from './queue/admin-queue-guard.js';
import { initSentry, setupFastifySentry } from './config/sentry.js';

async function bootstrap() {
  const env = validateEnv();
  initSentry(env.SENTRY_DSN);

  const adapter = new FastifyAdapter({
    trustProxy: env.TRUST_PROXY_HOPS,
    bodyLimit: 1_048_576,
  });
  configureWebCors(adapter, env.WEB_URL || env.APP_URL);
  setupFastifySentry(adapter.getInstance());
  registerApiSecurityHeaders(adapter.getInstance());
  registerAdminQueueGuard(adapter.getInstance());

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { rawBody: true },
  );
  app.enableShutdownHooks();

  // Fastify multipart registration (No multer!)
  await app.register((multipart as unknown) as Parameters<NestFastifyApplication['register']>[0]);

  // Mount Bull-Board Dashboard UI behind /admin/queues/ui
  try {
    const { QueueService } = await import('./queue/queue.service.js');
    const queueService = app.get(QueueService);
    await app.register(
      queueService.serverAdapter.registerPlugin() as unknown as Parameters<NestFastifyApplication['register']>[0],
      { prefix: '/admin/queues/ui' } as unknown as Parameters<NestFastifyApplication['register']>[1],
    );
  } catch (err) {
    console.warn('[Bull-Board] Failed to mount Bull-Board on Fastify:', err);
  }

  const port = env.PORT;
  await app.listen(port, '0.0.0.0');
  console.log(`API running on http://0.0.0.0:${port}`);
}

bootstrap();
