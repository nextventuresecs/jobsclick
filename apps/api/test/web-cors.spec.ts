import { FastifyAdapter } from '@nestjs/platform-fastify';
import { expect, it } from 'vitest';
import { configureWebCors } from '../src/config/web-cors.js';

it('allows staging authentication preflights from the configured web origin only', async () => {
  const adapter = new FastifyAdapter();
  configureWebCors(adapter, 'https://staging.example.test/');
  const server = adapter.getInstance();
  try {
    await server.ready();
    const preflight = (origin: string) => server.inject({
      method: 'OPTIONS',
      url: '/auth/oauth/exchange',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-user-id,sentry-trace,baggage',
      },
    });
    const allowed = await preflight('https://staging.example.test');
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://staging.example.test');
    expect(allowed.headers['access-control-allow-methods']).toContain('POST');
    expect(allowed.headers['access-control-allow-headers']).toContain('sentry-trace');
    expect(allowed.headers['access-control-allow-headers']?.toString().toLowerCase()).toContain('x-user-id');
    expect(allowed.headers['access-control-allow-credentials']).toBeUndefined();
    const denied = await preflight('https://unrelated.example.test');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  } finally {
    await server.close();
  }
});
