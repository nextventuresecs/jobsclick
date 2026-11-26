import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  JobRow,
  ApplicationRow,
  CorporateTieUpRow,
  PlacementApplicationRow,
} from '@indian-job-portal/database';
import {
  createActorAuthorizationContext,
  createWorkerAuthorizationContext,
  requirePermission,
  requireTenantScope,
  assertTenantMatchOrAdmin,
  isPlatformAdminContext,
} from '../src/auth/authorization-context.js';
import { JobRepository } from '../src/database/repositories/job.repository.js';
import { ApplicationRepository } from '../src/database/repositories/application.repository.js';
import { CorporateTieUpRepository } from '../src/database/repositories/corporate-tie-up.repository.js';
import { PlacementPipelineRepository } from '../src/database/repositories/placement-pipeline.repository.js';

function createDummySupabase(): SupabaseClient<Database> {
  return {} as unknown as SupabaseClient<Database>;
}

describe('ADR 0002 (AUTHZ-02, AUTHZ-03, AUTHZ-04): AuthorizationContext & Tenant-Scoped Repositories', () => {
  describe('AuthorizationContext builders & fail-closed guards', () => {
    it('constructs frozen server-derived tenant contexts and rejects empty/unknown actors', () => {
      const empCtx = createActorAuthorizationContext('emp_1', 'employer');
      expect(empCtx.actorType).toBe('user');
      expect(empCtx.tenant).toEqual({ type: 'business', id: 'emp_1' });
      expect(Object.isFrozen(empCtx)).toBe(true);
      expect(Object.isFrozen(empCtx.tenant)).toBe(true);

      const instCtx = createActorAuthorizationContext('inst_1', 'intermediary');
      expect(instCtx.tenant).toEqual({ type: 'institution', id: 'inst_1' });

      expect(() => createActorAuthorizationContext('', 'employer')).toThrow(ForbiddenException);
      expect(() => createActorAuthorizationContext('emp_1', 'unknown_role')).toThrow(ForbiddenException);
    });

    it('separates worker identities from end-user & platform admin privileges', () => {
      const workerCtx = createWorkerAuthorizationContext('bulk-import-worker', ['bulk:write']);
      expect(workerCtx.actorType).toBe('worker');
      expect(workerCtx.actorId).toBe('worker:bulk-import-worker');
      expect(isPlatformAdminContext(workerCtx)).toBe(false);
      expect(() => requirePermission(workerCtx, 'jobs:write')).toThrow(ForbiddenException);
      expect(() => requireTenantScope(workerCtx, ['business'])).toThrow(ForbiddenException);
      expect(() => assertTenantMatchOrAdmin(workerCtx, 'emp_1')).toThrow(ForbiddenException);
    });
  });

  describe('JobRepository & ApplicationRepository scoped operations', () => {
    it('prevents cross-employer reads/updates/soft-deletes and leaves rows unmodified', async () => {
      const jobRepo = new JobRepository(createDummySupabase(), true);
      const appRepo = new ApplicationRepository(createDummySupabase(), true);
      const now = new Date().toISOString();

      const job: JobRow = {
        id: 'job_scoped_1',
        public_slug: 'jobscoped123',
        employer_id: 'emp_owner_a',
        title: 'Owner A Machinist',
        description: 'CNC machining operator',
        category: 'blue',
        city: 'Pune',
        openings: 2,
        is_active: true,
        source: 'direct',
        created_by: 'emp_owner_a',
        updated_by: 'emp_owner_a',
        created_at: now,
        updated_at: now,
      };
      await jobRepo.create(job);

      const application: ApplicationRow = {
        id: 'app_scoped_1',
        job_id: job.id,
        applicant_id: 'seeker_1',
        status: 'applied',
        source: 'direct',
        created_by: 'seeker_1',
        updated_by: 'seeker_1',
        created_at: now,
        updated_at: now,
      };
      await appRepo.create(application);

      const intruderCtx = createActorAuthorizationContext('emp_intruder_b', 'employer');
      const ownerCtx = createActorAuthorizationContext('emp_owner_a', 'employer');

      await expect(jobRepo.findByIdForTenant(intruderCtx, job.id)).rejects.toThrow(ForbiddenException);
      await expect(jobRepo.updateForTenant(intruderCtx, job.id, { title: 'Hijacked' })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(jobRepo.softDeleteForTenant(intruderCtx, job.id)).rejects.toThrow(ForbiddenException);
      await expect(appRepo.findByJobIdForEmployer(intruderCtx, job.id, job.employer_id)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        appRepo.updateStatusForEmployer(intruderCtx, application.id, job.id, job.employer_id, 'shortlisted'),
      ).rejects.toThrow(ForbiddenException);

      // Zero side effects on stored job or application after rejected cross-tenant attempts
      const intactJob = await jobRepo.findByIdForTenant(ownerCtx, job.id);
      expect(intactJob?.title).toBe('Owner A Machinist');
      expect(intactJob?.is_active).toBe(true);

      const intactApps = await appRepo.findByJobIdForEmployer(ownerCtx, job.id, job.employer_id);
      expect(intactApps).toHaveLength(1);
      expect(intactApps[0]?.status).toBe('applied');
    });
  });

  describe('CorporateTieUpRepository & PlacementPipelineRepository scoped SQL & isolation', () => {
    it('pushes institution_id equality filter directly to Supabase SQL rather than calling findAll()', async () => {
      const eqSpy = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      const selectSpy = vi.fn().mockReturnValue({ eq: eqSpy });
      const fromSpy = vi.fn().mockReturnValue({ select: selectSpy });
      const mockClient = { from: fromSpy } as unknown as SupabaseClient<Database>;

      const tieUpRepo = new CorporateTieUpRepository(mockClient, false);
      const pipelineRepo = new PlacementPipelineRepository(mockClient, false);

      await tieUpRepo.findByInstitutionId('inst_sql_only');
      expect(fromSpy).toHaveBeenCalledWith('corporate_tie_ups');
      expect(eqSpy).toHaveBeenCalledWith('institution_id', 'inst_sql_only');

      await pipelineRepo.findByInstitutionId('inst_sql_only');
      expect(fromSpy).toHaveBeenCalledWith('placement_applications');
      expect(eqSpy).toHaveBeenCalledWith('institution_id', 'inst_sql_only');
    });

    it('rejects cross-institution reads and updates with zero side effects', async () => {
      const tieUpRepo = new CorporateTieUpRepository(createDummySupabase(), true);
      const pipelineRepo = new PlacementPipelineRepository(createDummySupabase(), true);
      const now = new Date().toISOString();

      const tieUp: CorporateTieUpRow = {
        id: 'tieup_scoped_1',
        institution_id: 'inst_alpha',
        employer_id: 'emp_alpha',
        company_name: 'Alpha Forgings',
        sector: 'Manufacturing',
        partnership_status: 'mou_signed',
        preferred_trades: ['Welder'],
        active_campus_drives: 1,
        total_offers_issued: 0,
        contact_person: 'HR Alpha',
        partnered_since: '2026-11-01',
        created_at: now,
        updated_at: now,
      };
      await tieUpRepo.create(tieUp);

      const placementApp: PlacementApplicationRow = {
        id: 'papp_scoped_1',
        tie_up_id: tieUp.id,
        institution_id: 'inst_alpha',
        student_id: 'stu_alpha_1',
        job_id: 'job_campus_1',
        job_title: 'Welder Trainee',
        stage: 'applied',
        created_at: now,
        updated_at: now,
      };
      await pipelineRepo.create(placementApp);

      const alphaCtx = createActorAuthorizationContext('inst_alpha', 'institution');
      const betaCtx = createActorAuthorizationContext('inst_beta', 'institution');

      await expect(tieUpRepo.findByIdScoped(betaCtx, tieUp.id)).rejects.toThrow(ForbiddenException);
      await expect(pipelineRepo.findByIdScoped(betaCtx, placementApp.id)).rejects.toThrow(ForbiddenException);
      await expect(pipelineRepo.updateScoped(betaCtx, placementApp.id, { stage: 'rejected' })).rejects.toThrow(
        ForbiddenException,
      );

      // Original records remain completely untouched
      const unchangedApp = await pipelineRepo.findByIdScoped(alphaCtx, placementApp.id);
      expect(unchangedApp?.stage).toBe('applied');
    });
  });
});
