import {
  Controller,
  Post,
  Logger,
  ServiceUnavailableException,
  ConflictException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import * as Sentry from '@sentry/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
const sentinel = 'synthetic-private-db-token-and-email@example.invalid';
@Controller('claim-failure-fixture')
class FaultController {
  @Post('database') database() {
    throw Object.assign(new Error(sentinel), { code: 'XX000' });
  }
  @Post('outage') outage() {
    throw new ServiceUnavailableException('private diagnostic ' + sentinel);
  }
  @Post('safe') safe() {
    throw new ServiceUnavailableException('AUTH_PROVIDER_LIFETIME_MISCONFIGURED');
  }
  @Post('rejected') rejected() {
    throw new ConflictException('AUTH_CLAIM_REJECTED');
  }
}
describe('AUTH-01 E unexpected claim-path failure privacy', () => {
  let app: NestFastifyApplication;
  const events: Sentry.Event[] = [];
  const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  beforeAll(async () => {
    vi.stubEnv('SENTRY_DSN', 'https://public@example.invalid/1');
    Sentry.init({
      dsn: process.env['SENTRY_DSN'],
      defaultIntegrations: false,
      transport: () => ({ send: async () => ({ statusCode: 200 }), flush: async () => true }),
      beforeSend(event) {
        events.push(event);
        return event;
      },
    });
    const module = await Test.createTestingModule({ controllers: [FaultController] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  beforeEach(() => {
    events.length = 0;
    log.mockClear();
    Sentry.setUser({ email: sentinel });
    Sentry.setExtra('provider_token', sentinel);
  });
  afterAll(async () => {
    await app?.close();
    await Sentry.close(1000);
    log.mockRestore();
    vi.unstubAllEnvs();
  });
  it.each([
    ['database', 500, 'DatabaseError'],
    ['outage', 503, 'DependencyError'],
  ])(
    'keeps an injected %s failure out of the client, one log line and its alert',
    async (path, status, errorClass) => {
      const response = await app.inject({
        method: 'POST',
        url: '/claim-failure-fixture/' + path + '?access_token=synthetic-query-token',
      });
      expect(response.statusCode).toBe(status);
      expect(response.body).not.toContain(sentinel);
      expect(response.body).not.toContain('private diagnostic');
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0]).toHaveLength(1);
      const record = JSON.parse(String(log.mock.calls[0]![0]));
      expect(Object.keys(record).sort()).toEqual(['errorClass', 'requestId']);
      expect(record.errorClass).toBe(errorClass);
      expect(record.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-query-token');
      expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
      await Sentry.flush(1000);
      expect(events).toHaveLength(1);
      expect(events[0]?.extra).toEqual(record);
      expect(JSON.stringify(events)).not.toContain(sentinel);
      expect(JSON.stringify(events)).not.toContain('synthetic-query-token');
    },
  );
  it('keeps the approved lifetime error code loud without copying an upstream error object', async () => {
    const response = await app.inject({ method: 'POST', url: '/claim-failure-fixture/safe' });
    expect(response.statusCode).toBe(503);
    expect(response.json().message).toBe('AUTH_PROVIDER_LIFETIME_MISCONFIGURED');
  });
  it('does not log or alert expected business rejection a second time', async () => {
    expect(
      (await app.inject({ method: 'POST', url: '/claim-failure-fixture/rejected' })).statusCode,
    ).toBe(409);
    await Sentry.flush(1000);
    expect(log).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });
});
