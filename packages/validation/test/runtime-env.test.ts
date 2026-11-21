import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getAppEnv,
  isProduction,
  isStaging,
  isStrictEnv,
  isTestEnv,
} from '../src/runtime-env';

describe('runtime-env helper', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['APP_ENV'];
    delete process.env['NODE_ENV'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('source precedence (APP_ENV overrides NODE_ENV)', () => {
    it('returns staging when NODE_ENV=production and APP_ENV=staging', () => {
      const env = { NODE_ENV: 'production', APP_ENV: 'staging' };
      expect(getAppEnv(env)).toBe('staging');
      expect(isStaging(env)).toBe(true);
      expect(isProduction(env)).toBe(false);
      expect(isStrictEnv(env)).toBe(true);
      expect(isTestEnv(env)).toBe(false);
    });

    it('returns staging when NODE_ENV=staging alone (APP_ENV unset)', () => {
      const env = { NODE_ENV: 'staging' };
      expect(getAppEnv(env)).toBe('staging');
      expect(isStaging(env)).toBe(true);
      expect(isProduction(env)).toBe(false);
      expect(isStrictEnv(env)).toBe(true);
      expect(isTestEnv(env)).toBe(false);
    });

    it('throws conflict error when APP_ENV=production and NODE_ENV=staging', () => {
      const env = { NODE_ENV: 'staging', APP_ENV: 'production' };
      expect(() => getAppEnv(env)).toThrow(
        /Conflicting environment configuration: APP_ENV=production cannot be combined with NODE_ENV=staging/
      );
    });

    it('throws conflict error when APP_ENV=production and NODE_ENV=test', () => {
      const env = { NODE_ENV: 'test', APP_ENV: 'production' };
      expect(() => getAppEnv(env)).toThrow(
        /Conflicting environment configuration: APP_ENV=production cannot be combined with NODE_ENV=test/
      );
    });

    it('returns staging when APP_ENV=staging and NODE_ENV=development', () => {
      const env = { NODE_ENV: 'development', APP_ENV: 'staging' };
      expect(getAppEnv(env)).toBe('staging');
      expect(isStaging(env)).toBe(true);
      expect(isStrictEnv(env)).toBe(true);
    });

    it('returns test when APP_ENV=test and NODE_ENV=production', () => {
      const env = { NODE_ENV: 'production', APP_ENV: 'test' };
      expect(getAppEnv(env)).toBe('test');
      expect(isTestEnv(env)).toBe(true);
      expect(isStrictEnv(env)).toBe(false);
    });
  });

  describe('environment value normalization', () => {
    it('trims whitespace and ignores case for APP_ENV', () => {
      expect(getAppEnv({ APP_ENV: '  STAGING  ' })).toBe('staging');
      expect(getAppEnv({ APP_ENV: '  Production  ' })).toBe('production');
      expect(getAppEnv({ APP_ENV: '  TEST  ' })).toBe('test');
      expect(getAppEnv({ APP_ENV: '  DEVELOPMENT  ' })).toBe('development');
    });

    it('trims whitespace and ignores case for NODE_ENV', () => {
      expect(getAppEnv({ NODE_ENV: '  STAGING  ' })).toBe('staging');
      expect(getAppEnv({ NODE_ENV: '  Production  ' })).toBe('production');
      expect(getAppEnv({ NODE_ENV: '  TEST  ' })).toBe('test');
      expect(getAppEnv({ NODE_ENV: '  DEVELOPMENT  ' })).toBe('development');
      expect(getAppEnv({ NODE_ENV: 'dev' })).toBe('development');
    });
  });

  describe('strict-by-default behavior (unset or unknown treated as production-like)', () => {
    it('defaults to production when both are unset', () => {
      expect(getAppEnv({})).toBe('production');
      expect(isProduction({})).toBe(true);
      expect(isStrictEnv({})).toBe(true);
      expect(isStaging({})).toBe(false);
      expect(isTestEnv({})).toBe(false);
    });

    it('defaults to production when both are empty or whitespace only', () => {
      const env = { APP_ENV: '   ', NODE_ENV: '   ' };
      expect(getAppEnv(env)).toBe('production');
      expect(isProduction(env)).toBe(true);
      expect(isStrictEnv(env)).toBe(true);
    });

    it('treats unknown environment names as production (strict fail-closed)', () => {
      expect(getAppEnv({ NODE_ENV: 'preview' })).toBe('production');
      expect(getAppEnv({ NODE_ENV: 'custom-qa' })).toBe('production');
      expect(getAppEnv({ APP_ENV: 'sandbox' })).toBe('production');
      expect(isStrictEnv({ NODE_ENV: 'preview' })).toBe(true);
      expect(isStrictEnv({ NODE_ENV: 'custom-qa' })).toBe(true);
    });

    it('handles legacy string argument in isStrictEnv', () => {
      expect(isStrictEnv('production')).toBe(true);
      expect(isStrictEnv('staging')).toBe(true);
      expect(isStrictEnv('preview')).toBe(true);
      expect(isStrictEnv('')).toBe(true);
      expect(isStrictEnv('development')).toBe(false);
      expect(isStrictEnv('dev')).toBe(false);
      expect(isStrictEnv('test')).toBe(false);
    });
  });

  describe('global process.env inspection when source is omitted', () => {
    it('reads from process.env when called without arguments', () => {
      process.env['NODE_ENV'] = 'production';
      process.env['APP_ENV'] = 'staging';
      expect(getAppEnv()).toBe('staging');
      expect(isStaging()).toBe(true);
      expect(isStrictEnv()).toBe(true);

      delete process.env['APP_ENV'];
      process.env['NODE_ENV'] = 'staging';
      expect(getAppEnv()).toBe('staging');

      process.env['NODE_ENV'] = 'test';
      expect(getAppEnv()).toBe('test');
      expect(isTestEnv()).toBe(true);
      expect(isStrictEnv()).toBe(false);

      process.env['NODE_ENV'] = 'development';
      expect(getAppEnv()).toBe('development');
      expect(isStrictEnv()).toBe(false);

      delete process.env['NODE_ENV'];
      expect(getAppEnv()).toBe('production');
      expect(isStrictEnv()).toBe(true);
    });
  });
});
