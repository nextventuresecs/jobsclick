import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateSeedGuards,
  runSeedStaging,
  TARGET_STAGING_PROJECT_REF,
  FORBIDDEN_OLD_PROJECT_REF,
} from './seed-staging.ts';

describe('TASK E: Staging Database Seed Runner Guards and Safety Gates', () => {
  const originalEnv = process.env;

  const validStagingDatabaseUrl = `postgresql://postgres:testpass@db.${TARGET_STAGING_PROJECT_REF}.supabase.co:5432/postgres`;
  const validStagingAllowlist = '9876543210,9876543211,9876543212,9876543213,9876543214';
  const validSeedPhonesJson = JSON.stringify({
    admin: '9876543210',
    msme_admin: '9876543211',
    intermediary: '9876543212',
    employer: '9876543213',
    job_seeker: '9876543214',
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. Wrong Project Ref Guard', () => {
    it('refuses to run when target database host does not match STAGING_PROJECT_REF', () => {
      const wrongHostUrl = 'postgresql://postgres:testpass@db.wrongstagingref999.supabase.co:5432/postgres';

      expect(() => {
        validateSeedGuards({
          connectionString: wrongHostUrl,
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
          env: {
            APP_ENV: 'staging',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: validSeedPhonesJson,
          },
        });
      }).toThrow(/does not match expected staging project ref/);
    });

    it('refuses to run when target pooler username does not match expected staging ref', () => {
      const wrongPoolerUrl = 'postgresql://postgres.otherproject:testpass@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';

      expect(() => {
        validateSeedGuards({
          connectionString: wrongPoolerUrl,
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
          env: {
            APP_ENV: 'staging',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: validSeedPhonesJson,
          },
        });
      }).toThrow(/does not match expected staging project ref/);
    });
  });

  describe('2. Old Forbidden Project Ref Guard', () => {
    it('refuses to run if connection string contains forbidden old ref aspahsnclunutwiqliau in hostname', () => {
      const oldRefUrl = `postgresql://postgres:testpass@db.${FORBIDDEN_OLD_PROJECT_REF}.supabase.co:5432/postgres`;

      expect(() => {
        validateSeedGuards({
          connectionString: oldRefUrl,
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
          env: {
            APP_ENV: 'staging',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: validSeedPhonesJson,
          },
        });
      }).toThrow(/deprecated\/forbidden staging project ref/);
    });

    it('refuses to run if connection string contains forbidden old ref in username or path', () => {
      const oldRefPoolerUrl = `postgresql://postgres.${FORBIDDEN_OLD_PROJECT_REF}:testpass@aws-0.pooler.supabase.com:5432/postgres`;

      expect(() => {
        validateSeedGuards({
          connectionString: oldRefPoolerUrl,
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
          env: {
            APP_ENV: 'staging',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: validSeedPhonesJson,
          },
        });
      }).toThrow(/deprecated\/forbidden staging project ref/);
    });
  });

  describe('3. Missing or Invalid Confirm Flag Guard (--confirm-project-ref)', () => {
    it('refuses to run when --confirm-project-ref is omitted', () => {
      expect(() => {
        validateSeedGuards({
          connectionString: validStagingDatabaseUrl,
          confirmedProjectRef: undefined,
          env: {
            APP_ENV: 'staging',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: validSeedPhonesJson,
          },
        });
      }).toThrow(/SECURITY CONFIRMATION REQUIRED: You must explicitly provide --confirm-project-ref/);
    });

    it('refuses to run when --confirm-project-ref does not match expected staging project ref', () => {
      expect(() => {
        validateSeedGuards({
          connectionString: validStagingDatabaseUrl,
          confirmedProjectRef: 'mismatched-ref',
          env: {
            APP_ENV: 'staging',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: validSeedPhonesJson,
          },
        });
      }).toThrow(/Confirmed project ref "mismatched-ref" does not match target staging project ref/);
    });
  });

  describe('4. Production Environment Guard', () => {
    it('refuses to run when APP_ENV is explicitly production', () => {
      expect(() => {
        validateSeedGuards({
          connectionString: validStagingDatabaseUrl,
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
          env: {
            APP_ENV: 'production',
            NODE_ENV: 'production',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: validSeedPhonesJson,
          },
        });
      }).toThrow(/cannot run when APP_ENV\/NODE_ENV resolves to production/);
    });

    it('refuses to run when NODE_ENV is production and APP_ENV is unset', () => {
      expect(() => {
        validateSeedGuards({
          connectionString: validStagingDatabaseUrl,
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
          env: {
            NODE_ENV: 'production',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: validSeedPhonesJson,
          },
        });
      }).toThrow(/cannot run when APP_ENV\/NODE_ENV resolves to production/);
    });

    it('refuses to run when environment is unset and defaults to fail-closed production', () => {
      expect(() => {
        validateSeedGuards({
          connectionString: validStagingDatabaseUrl,
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
          env: {
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: validSeedPhonesJson,
          },
        });
      }).toThrow(/cannot run when APP_ENV\/NODE_ENV resolves to production/);
    });

    it('refuses to run on conflicting configuration APP_ENV=production with NODE_ENV=staging', () => {
      expect(() => {
        validateSeedGuards({
          connectionString: validStagingDatabaseUrl,
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
          env: {
            APP_ENV: 'production',
            NODE_ENV: 'staging',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: validSeedPhonesJson,
          },
        });
      }).toThrow(/Conflicting environment configuration/);
    });
  });

  describe('5. SMS Allowlist & Seed Phones Guard', () => {
    it('refuses to run when a phone in STAGING_SEED_PHONES is not in STAGING_SMS_ALLOWLIST', () => {
      const unallowlistedPhonesJson = JSON.stringify({
        admin: '9876543210',
        msme_admin: '9876543211',
        intermediary: '9876543212',
        employer: '9876543213',
        job_seeker: '9999999999', // Not in allowlist!
      });

      expect(() => {
        validateSeedGuards({
          connectionString: validStagingDatabaseUrl,
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
          env: {
            APP_ENV: 'staging',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: unallowlistedPhonesJson,
          },
        });
      }).toThrow(/SECURITY ABORT: Seed phone for "job_seeker" is not in STAGING_SMS_ALLOWLIST/);
    });

    it('refuses to run when STAGING_SMS_ALLOWLIST is empty', () => {
      expect(() => {
        validateSeedGuards({
          connectionString: validStagingDatabaseUrl,
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
          env: {
            APP_ENV: 'staging',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: '',
            STAGING_SEED_PHONES: validSeedPhonesJson,
          },
        });
      }).toThrow(/STAGING_SMS_ALLOWLIST is empty/);
    });

    it('refuses to run when STAGING_SEED_PHONES is missing a required role', () => {
      const missingEmployerJson = JSON.stringify({
        admin: '9876543210',
        msme_admin: '9876543211',
        intermediary: '9876543212',
        job_seeker: '9876543214',
      });

      expect(() => {
        validateSeedGuards({
          connectionString: validStagingDatabaseUrl,
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
          env: {
            APP_ENV: 'staging',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: missingEmployerJson,
          },
        });
      }).toThrow(/missing required role: "employer"/);
    });
  });

  describe('6. TLS Enforcement and Dry-Run Execution', () => {
    it('enforces strict TLS rejectUnauthorized=true for remote staging target', () => {
      const validated = validateSeedGuards({
        connectionString: validStagingDatabaseUrl,
        confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
        env: {
          APP_ENV: 'staging',
          STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
          STAGING_SMS_ALLOWLIST: validStagingAllowlist,
          STAGING_SEED_PHONES: validSeedPhonesJson,
        },
      });

      expect(typeof validated.clientConfig.ssl).toBe('object');
      expect((validated.clientConfig.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized).toBe(true);
    });

    it('rejects DB_ALLOW_INSECURE_TLS in staging environment', () => {
      expect(() => {
        validateSeedGuards({
          connectionString: validStagingDatabaseUrl,
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
          env: {
            APP_ENV: 'staging',
            NODE_ENV: 'staging',
            DB_ALLOW_INSECURE_TLS: 'true',
            STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
            STAGING_SMS_ALLOWLIST: validStagingAllowlist,
            STAGING_SEED_PHONES: validSeedPhonesJson,
          },
        });
      }).toThrow(/DB_ALLOW_INSECURE_TLS is forbidden in production\/staging/);
    });

    it('successfully validates and executes in --dry-run mode without database connection', async () => {
      const summary = await runSeedStaging({
        connectionString: validStagingDatabaseUrl,
        confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
        dryRun: true,
        env: {
          APP_ENV: 'staging',
          STAGING_PROJECT_REF: TARGET_STAGING_PROJECT_REF,
          STAGING_SMS_ALLOWLIST: validStagingAllowlist,
          STAGING_SEED_PHONES: validSeedPhonesJson,
        },
      });

      expect(summary).toEqual({
        usersUpserted: 5,
        institutionProfilesUpserted: 1,
        studentsUpserted: 5,
        businessProfilesUpserted: 1,
        jobsUpserted: 4,
        applicationsUpserted: 4,
      });
    });
  });
});
