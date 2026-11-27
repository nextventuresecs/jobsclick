import { describe, expect, it } from 'vitest';
import {
  getExpectedProductionRef,
  parseProductionDatabaseUrl,
} from './bootstrap-production-db.ts';
import {
  FORBIDDEN_OLD_PROJECT_REF,
  TARGET_STAGING_PROJECT_REF,
} from './bootstrap-staging-db.ts';

describe('bootstrap-production-db safeguards', () => {
  const prodRef = 'prodprojref123456789';
  const sessionPoolerUrl = `postgresql://postgres.${prodRef}:secretpass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;

  it('requires PRODUCTION_PROJECT_REF and refuses staging or forbidden refs', () => {
    expect(() =>
      getExpectedProductionRef({ productionProjectRef: '' }),
    ).toThrow(/PRODUCTION_PROJECT_REF is required/);

    expect(() =>
      getExpectedProductionRef({ productionProjectRef: TARGET_STAGING_PROJECT_REF }),
    ).toThrow(/staging or forbidden project ref/);

    expect(() =>
      getExpectedProductionRef({ productionProjectRef: FORBIDDEN_OLD_PROJECT_REF }),
    ).toThrow(/staging or forbidden project ref/);

    expect(() =>
      getExpectedProductionRef({
        productionProjectRef: 'customstagingref123',
        stagingProjectRef: 'customstagingref123',
      }),
    ).toThrow(/staging or forbidden project ref/);

    expect(
      getExpectedProductionRef({ productionProjectRef: prodRef }),
    ).toBe(prodRef);
  });

  it('requires PRODUCTION_DATABASE_URL and rejects staging URLs or localhost', () => {
    expect(() =>
      parseProductionDatabaseUrl('', {
        productionProjectRef: prodRef,
        confirmedProjectRef: prodRef,
      }),
    ).toThrow(/PRODUCTION_DATABASE_URL is required/);

    expect(() =>
      parseProductionDatabaseUrl(
        `postgresql://postgres.${TARGET_STAGING_PROJECT_REF}:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
        {
          productionProjectRef: prodRef,
          confirmedProjectRef: prodRef,
        },
      ),
    ).toThrow(/staging\/forbidden project ref/);

    expect(() =>
      parseProductionDatabaseUrl(
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        {
          productionProjectRef: prodRef,
          confirmedProjectRef: prodRef,
        },
      ),
    ).toThrow(/Refusing to run production bootstrap against local host/);
  });

  it('enforces --confirm-project-ref, port 5432 session pooler, and tenant match', () => {
    expect(() =>
      parseProductionDatabaseUrl(sessionPoolerUrl, {
        productionProjectRef: prodRef,
      }),
    ).toThrow(/SECURITY CONFIRMATION REQUIRED/);

    expect(() =>
      parseProductionDatabaseUrl(sessionPoolerUrl, {
        productionProjectRef: prodRef,
        confirmedProjectRef: 'wrong-ref',
      }),
    ).toThrow(/SECURITY CONFIRMATION REQUIRED/);

    expect(() =>
      parseProductionDatabaseUrl(
        `postgresql://postgres.${prodRef}:secretpass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
        {
          productionProjectRef: prodRef,
          confirmedProjectRef: prodRef,
        },
      ),
    ).toThrow(/Port 6543 is a transaction-mode/);

    expect(() =>
      parseProductionDatabaseUrl(
        'postgresql://postgres.otherref:secretpass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
        {
          productionProjectRef: prodRef,
          confirmedProjectRef: prodRef,
        },
      ),
    ).toThrow(/Pooler tenant mismatch/);

    const config = parseProductionDatabaseUrl(sessionPoolerUrl, {
      productionProjectRef: prodRef,
      confirmedProjectRef: prodRef,
    });
    expect(config.host).toBe('aws-0-ap-south-1.pooler.supabase.com');
    expect(config.port).toBe(5432);
    expect(config.user).toBe(`postgres.${prodRef}`);
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
  });
});
