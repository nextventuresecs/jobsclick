import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { AppModule } from './app.module.js';
import { validateEnv } from './config/env.js';
import { initSentry } from './config/sentry.js';

async function bootstrap() {
  const env = validateEnv();
  initSentry(env.SENTRY_DSN);
  
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Fastify multipart registration (No multer!)
  await app.register((multipart as unknown) as Parameters<NestFastifyApplication['register']>[0]);

  await app.listen(env.PORT, '0.0.0.0');
  console.log(`API running on http://localhost:${env.PORT}`);
}

bootstrap();
