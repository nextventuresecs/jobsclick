import { describe, it, expect } from 'vitest';
import {
  validateStagingTripwire,
  assertStagingTripwire,
  FORBIDDEN_PRODUCTION_PROJECT_REF,
  DEFAULT_STAGING_PROJECT_REF,
} from '../src/staging-tripwire';

const VALID_STAGING_BASE: Record<string, string> = {
  APP_ENV: 'staging',
  DATABASE_URL: `postgresql://postgres.${DEFAULT_STAGING_PROJECT_REF}:secret@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`,
  SUPABASE_URL: `https://${DEFAULT_STAGING_PROJECT_REF}.supabase.co`,
  WEB_URL: 'https://staging.jobsclick.live',
  APP_URL: 'https://staging.jobsclick.live',
  API_URL: 'https://api-staging.jobsclick.live',
  RAZORPAY_KEY_ID: 'rzp_test_1234567890abcdef',
  SENTRY_DSN: 'https://key@sentry.io/123456',
  NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: 'false',
};

describe('validateStagingTripwire', () => {
  it('returns no errors in non-staging environments (e.g. production, development)', () => {
    const prodSource = {
      APP_ENV: 'production',
      DATABASE_URL: `postgresql://postgres.${FORBIDDEN_PRODUCTION_PROJECT_REF}:secret@supabase.co:5432/postgres`,
      WEB_URL: 'https://jobsclick.live',
    };
    expect(validateStagingTripwire(prodSource)).toEqual([]);
  });

  it('passes cleanly with valid staging configuration', () => {
    const errors = validateStagingTripwire(VALID_STAGING_BASE);
    expect(errors).toEqual([]);
    expect(() => assertStagingTripwire(VALID_STAGING_BASE)).not.toThrow();
  });

  describe('DATABASE_URL & DIRECT_URL tripwires', () => {
    it('fails when DATABASE_URL is missing in staging (by default)', () => {
      const source = { ...VALID_STAGING_BASE, DATABASE_URL: '' };
      const errors = validateStagingTripwire(source);
      expect(errors).toContain('DATABASE_URL must be set in staging');
    });

    it('does not require DATABASE_URL if requireDatabaseUrl option is false', () => {
      const source = { ...VALID_STAGING_BASE, DATABASE_URL: '' };
      const errors = validateStagingTripwire(source, { requireDatabaseUrl: false });
      expect(errors).toEqual([]);
    });

    it('fails when DATABASE_URL contains forbidden production project ref', () => {
      const source = {
        ...VALID_STAGING_BASE,
        DATABASE_URL: `postgresql://postgres.${FORBIDDEN_PRODUCTION_PROJECT_REF}:password@aws-pooler.supabase.com:5432/postgres`,
      };
      const errors = validateStagingTripwire(source);
      expect(errors).toContain('DATABASE_URL contains forbidden production project ref in staging');
      // Assert value is never leaked in error
      for (const err of errors) {
        expect(err).not.toContain('password');
      }
    });

    it('fails when DATABASE_URL does not contain the staging project ref', () => {
      const source = {
        ...VALID_STAGING_BASE,
        DATABASE_URL: 'postgresql://postgres.someotherproject:password@aws-pooler.supabase.com:5432/postgres',
      };
      const errors = validateStagingTripwire(source);
      expect(errors).toContain('DATABASE_URL must contain staging project ref in staging');
    });

    it('fails when DIRECT_URL contains forbidden prod ref or missing staging ref', () => {
      const sourceWithForbidden = {
        ...VALID_STAGING_BASE,
        DIRECT_URL: `postgresql://postgres.${FORBIDDEN_PRODUCTION_PROJECT_REF}:secret@db.supabase.co:5432/postgres`,
      };
      expect(validateStagingTripwire(sourceWithForbidden)).toContain(
        'DIRECT_URL contains forbidden production project ref in staging',
      );

      const sourceWithWrongRef = {
        ...VALID_STAGING_BASE,
        DIRECT_URL: 'postgresql://postgres.wrongref:secret@db.supabase.co:5432/postgres',
      };
      expect(validateStagingTripwire(sourceWithWrongRef)).toContain(
        'DIRECT_URL must contain staging project ref in staging',
      );
    });
  });

  describe('SUPABASE_URL tripwires', () => {
    it('fails when SUPABASE_URL is missing', () => {
      const source = { ...VALID_STAGING_BASE, SUPABASE_URL: '' };
      expect(validateStagingTripwire(source)).toContain('SUPABASE_URL must be set in staging');
    });

    it('fails when SUPABASE_URL contains forbidden prod ref', () => {
      const source = {
        ...VALID_STAGING_BASE,
        SUPABASE_URL: `https://${FORBIDDEN_PRODUCTION_PROJECT_REF}.supabase.co`,
      };
      expect(validateStagingTripwire(source)).toContain(
        'SUPABASE_URL contains forbidden production project ref in staging',
      );
    });

    it('fails when SUPABASE_URL does not contain staging ref', () => {
      const source = {
        ...VALID_STAGING_BASE,
        SUPABASE_URL: 'https://unknownref.supabase.co',
      };
      expect(validateStagingTripwire(source)).toContain(
        'SUPABASE_URL must contain staging project ref in staging',
      );
    });
  });

  describe('Domain tripwires (WEB_URL, APP_URL, API_URL)', () => {
    it('fails when host is jobsclick.live', () => {
      const source = { ...VALID_STAGING_BASE, WEB_URL: 'https://jobsclick.live' };
      const errors = validateStagingTripwire(source);
      expect(errors).toContain('WEB_URL host must not be production domain in staging');
      // Offending value must not be logged
      expect(errors.join(' ')).not.toContain('https://jobsclick.live');
    });

    it('fails when host is unapproved subdomain like www or admin', () => {
      const source = { ...VALID_STAGING_BASE, WEB_URL: 'https://www.jobsclick.live' };
      expect(validateStagingTripwire(source)).toContain(
        'WEB_URL host must not be a non-staging subdomain in staging',
      );

      const sourceAdmin = { ...VALID_STAGING_BASE, API_URL: 'https://admin.jobsclick.live' };
      expect(validateStagingTripwire(sourceAdmin)).toContain(
        'API_URL host must not be a non-staging subdomain in staging',
      );
    });

    it('allows staging.jobsclick.live and api-staging.jobsclick.live', () => {
      const source = {
        ...VALID_STAGING_BASE,
        WEB_URL: 'https://staging.jobsclick.live',
        API_URL: 'https://api-staging.jobsclick.live',
      };
      expect(validateStagingTripwire(source)).toEqual([]);
    });
  });

  describe('RAZORPAY_KEY_ID tripwire', () => {
    it('fails when RAZORPAY_KEY_ID starts with rzp_live_', () => {
      const source = { ...VALID_STAGING_BASE, RAZORPAY_KEY_ID: 'rzp_live_secret123' };
      const errors = validateStagingTripwire(source);
      expect(errors).toContain('RAZORPAY_KEY_ID cannot use live key (rzp_live_*) in staging');
      expect(errors.join(' ')).not.toContain('rzp_live_secret123');
    });
  });

  describe('SENTRY_DSN tripwire', () => {
    it('fails when SENTRY_DSN is empty', () => {
      const source = { ...VALID_STAGING_BASE, SENTRY_DSN: '' };
      expect(validateStagingTripwire(source)).toContain('SENTRY_DSN must be set in staging');
    });
  });

  describe('Google OAuth tripwire', () => {
    it('does not require GOOGLE_CALLBACK_URL when NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN is false or unset', () => {
      const source = { ...VALID_STAGING_BASE, NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: 'false' };
      expect(validateStagingTripwire(source)).toEqual([]);
    });

    it('requires GOOGLE_CALLBACK_URL when NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN is true', () => {
      const source = {
        ...VALID_STAGING_BASE,
        NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: 'true',
        GOOGLE_CALLBACK_URL: '',
      };
      expect(validateStagingTripwire(source)).toContain(
        'GOOGLE_CALLBACK_URL must be set when NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN is enabled in staging',
      );
    });

    it('fails when GOOGLE_CALLBACK_URL contains forbidden prod ref', () => {
      const source = {
        ...VALID_STAGING_BASE,
        NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: 'true',
        GOOGLE_CALLBACK_URL: `https://${FORBIDDEN_PRODUCTION_PROJECT_REF}.supabase.co/auth/v1/callback`,
      };
      expect(validateStagingTripwire(source)).toContain(
        'GOOGLE_CALLBACK_URL contains forbidden production project ref in staging',
      );
    });

    it('fails when GOOGLE_CALLBACK_URL points to an api or api-staging host', () => {
      const source = {
        ...VALID_STAGING_BASE,
        GOOGLE_CALLBACK_URL: 'https://api-staging.jobsclick.live/auth/callback',
      };
      expect(validateStagingTripwire(source)).toContain(
        'GOOGLE_CALLBACK_URL must not point to api host in staging',
      );
    });

    it('fails when GOOGLE_CALLBACK_URL does not equal expected staging Supabase callback', () => {
      const source = {
        ...VALID_STAGING_BASE,
        GOOGLE_CALLBACK_URL: `https://${DEFAULT_STAGING_PROJECT_REF}.supabase.co/wrong/path`,
      };
      expect(validateStagingTripwire(source)).toContain(
        'GOOGLE_CALLBACK_URL must equal https://<STAGING_PROJECT_REF>.supabase.co/auth/v1/callback in staging',
      );
    });

    it('accepts correct GOOGLE_CALLBACK_URL in staging', () => {
      const source = {
        ...VALID_STAGING_BASE,
        NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: 'true',
        GOOGLE_CALLBACK_URL: `https://${DEFAULT_STAGING_PROJECT_REF}.supabase.co/auth/v1/callback`,
      };
      expect(validateStagingTripwire(source)).toEqual([]);
    });
  });

  describe('NODE_ENV=staging vs APP_ENV=staging', () => {
    it('triggers tripwire when only NODE_ENV=staging is set', () => {
      const source = {
        NODE_ENV: 'staging',
        DATABASE_URL: `postgresql://postgres.${FORBIDDEN_PRODUCTION_PROJECT_REF}:pass@db.supabase.co:5432/postgres`,
      };
      expect(validateStagingTripwire(source)).toContain(
        'DATABASE_URL contains forbidden production project ref in staging',
      );
    });

    it('triggers tripwire when NODE_ENV=production and APP_ENV=staging', () => {
      const source = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        DATABASE_URL: `postgresql://postgres.${FORBIDDEN_PRODUCTION_PROJECT_REF}:pass@db.supabase.co:5432/postgres`,
      };
      expect(validateStagingTripwire(source)).toContain(
        'DATABASE_URL contains forbidden production project ref in staging',
      );
    });
  });
});
