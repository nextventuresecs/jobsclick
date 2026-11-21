import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getClientAppEnv,
  getClientEnvSource,
  isClientProduction,
  isClientStaging,
  isClientTestEnv,
  isClientStrictEnv,
} from '../src/lib/client-env';

describe('Web Client Environment Static Helper (client-env.ts)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('reads literal NEXT_PUBLIC_APP_ENV and returns staging', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';

    const source = getClientEnvSource();
    expect(source.NEXT_PUBLIC_APP_ENV).toBe('staging');
    expect(getClientAppEnv()).toBe('staging');
    expect(isClientStaging()).toBe(true);
    expect(isClientProduction()).toBe(false);
    expect(isClientStrictEnv()).toBe(true);
    expect(isClientTestEnv()).toBe(false);
  });

  it('resolves production when NEXT_PUBLIC_APP_ENV=production and NODE_ENV=production', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';

    expect(getClientAppEnv()).toBe('production');
    expect(isClientProduction()).toBe(true);
    expect(isClientStaging()).toBe(false);
    expect(isClientStrictEnv()).toBe(true);
  });

  it('resolves development when NODE_ENV=development and NEXT_PUBLIC_APP_ENV is unset', () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.APP_ENV;
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'development';

    expect(getClientAppEnv()).toBe('development');
    expect(isClientStrictEnv()).toBe(false);
    expect(isClientProduction()).toBe(false);
  });

  it('fails closed to production when both NEXT_PUBLIC_APP_ENV and NODE_ENV are unset', () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.APP_ENV;
    delete (process.env as Record<string, string | undefined>)['NODE_ENV'];

    expect(getClientAppEnv()).toBe('production');
    expect(isClientStrictEnv()).toBe(true);
  });
});
