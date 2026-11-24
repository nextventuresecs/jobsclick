import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { getAppEnv, isStrictEnv } from '@indian-job-portal/validation';
import { JobRepository } from '../src/database/repositories/job.repository.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { ApplicationRepository } from '../src/database/repositories/application.repository.js';
import { AuditLogRepository } from '../src/database/repositories/audit-log.repository.js';
import { InquiryRepository } from '../src/database/repositories/inquiry.repository.js';
import { PlacementPipelineRepository } from '../src/database/repositories/placement-pipeline.repository.js';
import { CorporateTieUpRepository } from '../src/database/repositories/corporate-tie-up.repository.js';

describe('Task 2c: Repositories Fail-Closed in Staging', () => {
  const originalEnv = { ...process.env };

  // Create a rejecting Supabase mock that fails with a generic Error
  function createRejectingSupabaseMock(): SupabaseClient<Database> {
    const rejectError = new Error('Database connection terminated abruptly (upstream network failure)');
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockRejectedValue(rejectError),
      then: (resolve: (v: unknown) => unknown, reject: (err: unknown) => unknown) =>
        Promise.reject(rejectError).then(resolve, reject),
    };

    return {
      from: vi.fn().mockReturnValue(builder),
      rpc: vi.fn().mockRejectedValue(rejectError),
    } as unknown as SupabaseClient<Database>;
  }

  beforeEach(() => {
    process.env['NODE_ENV'] = 'production';
    process.env['APP_ENV'] = 'staging';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('verifies environment is recognized as staging and strict', () => {
    expect(getAppEnv()).toBe('staging');
    expect(isStrictEnv()).toBe(true);
  });

  const repositories = [
    {
      name: 'JobRepository',
      create: (mock: SupabaseClient<Database>) => new JobRepository(mock),
      invoke: (repo: JobRepository) => repo.findActiveAlerts(),
    },
    {
      name: 'ProfileRepository',
      create: (mock: SupabaseClient<Database>) => new ProfileRepository(mock),
      invoke: (repo: ProfileRepository) => repo.findSeekerProfileByUserId('usr_test_fail_closed'),
    },
    {
      name: 'ApplicationRepository',
      create: (mock: SupabaseClient<Database>) => new ApplicationRepository(mock),
      invoke: (repo: ApplicationRepository) => repo.findById('app_test_fail_closed'),
    },
    {
      name: 'AuditLogRepository',
      create: (mock: SupabaseClient<Database>) => new AuditLogRepository(mock),
      invoke: (repo: AuditLogRepository) => repo.findAll(5),
    },
    {
      name: 'InquiryRepository',
      create: (mock: SupabaseClient<Database>) => new InquiryRepository(mock),
      invoke: (repo: InquiryRepository) => repo.findInquiriesByInstitutionId('inst_test_fail_closed'),
    },
    {
      name: 'PlacementPipelineRepository',
      create: (mock: SupabaseClient<Database>) => new PlacementPipelineRepository(mock),
      invoke: (repo: PlacementPipelineRepository) => repo.findById('placement_test_fail_closed'),
    },
    {
      name: 'CorporateTieUpRepository',
      create: (mock: SupabaseClient<Database>) => new CorporateTieUpRepository(mock),
      invoke: (repo: CorporateTieUpRepository) => repo.findById('tieup_test_fail_closed'),
    },
  ];

  repositories.forEach(({ name, create, invoke }) => {
    it(`${name} throws InternalServerErrorException on upstream failure in staging (never falls back to in-memory fake data)`, async () => {
      const mock = createRejectingSupabaseMock();
      const repo = create(mock);

      await expect(invoke(repo as never)).rejects.toThrow(InternalServerErrorException);
    });

    it(`${name} throws on upstream failure when NODE_ENV=staging alone (without APP_ENV)`, async () => {
      delete process.env['APP_ENV'];
      process.env['NODE_ENV'] = 'staging';

      const mock = createRejectingSupabaseMock();
      const repo = create(mock);

      await expect(invoke(repo as never)).rejects.toThrow(InternalServerErrorException);
    });
  });
});
