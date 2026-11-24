import type { FastifyAdapter } from '@nestjs/platform-fastify';

export function configureWebCors(adapter: FastifyAdapter, webUrl: string): void {
  adapter.enableCors({
    origin: [new URL(webUrl).origin],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-User-Id',
      'sentry-trace',
      'baggage',
      'traceparent',
      'tracestate',
    ],
  });
}
