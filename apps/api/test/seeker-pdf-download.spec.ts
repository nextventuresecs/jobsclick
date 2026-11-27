import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ProfilesController } from '../src/profiles/profiles.controller.js';
import { ProfilesService } from '../src/profiles/profiles.service.js';
import { InstitutionCmsService } from '../src/profiles/institution-cms.service.js';
import { QueueService } from '../src/queue/queue.service.js';
import { AuthUser } from '../src/auth/decorators/current-user.decorator.js';

describe('Seeker PDF Download Endpoint (JS-03 / Hard Invariant #8a)', () => {
  let controller: ProfilesController;

  beforeEach(async () => {
    const mockProfilesService = {
      getSeekerPdfDownload: async (userId: string) => ({
        downloadUrl: `https://storage.example.com/private/resumes/seeker_${userId}.pdf?token=mock`,
        cached: true,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        { provide: ProfilesService, useValue: mockProfilesService },
        { provide: InstitutionCmsService, useValue: {} },
        { provide: QueueService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ProfilesController>(ProfilesController);
  });

  it('delivers signed download URL for authenticated candidate CV PDF', async () => {
    const user: AuthUser = { id: 'usr-seeker-1', role: 'job_seeker', status: 'active' };
    const result = await controller.getSeekerPdfMe(user);

    expect(result.downloadUrl).toContain('resumes/seeker_usr-seeker-1.pdf');
    expect(result.cached).toBe(true);
  });

  describe('ProfilesService.getSeekerPdfDownload fail-closed behavior', () => {
    it('throws ServiceUnavailableException when createSignedUrl throws an error', async () => {
      const mockProfileRepo = {
        findSeekerProfileByUserId: async () => ({
          id: 'skr-123',
          full_name: 'Test Seeker',
          seeker_type: 'experienced',
          city: 'Delhi',
          skills: ['Welding'],
        }),
      } as unknown as import('../src/database/repositories/profile.repository.js').ProfileRepository;

      const mockSupabase = {
        storage: {
          from: () => ({
            createSignedUrl: async () => {
              throw new Error('Supabase network error');
            },
          }),
        },
      } as unknown as import('@supabase/supabase-js').SupabaseClient<import('@indian-job-portal/database').Database>;

      const service = new ProfilesService(
        mockProfileRepo,
        {} as import('../src/database/repositories/user.repository.js').UserRepository,
        {} as import('../src/database/repositories/location.repository.js').LocationRepository,
        undefined,
        mockSupabase,
      );

      await expect(service.getSeekerPdfDownload('usr-1')).rejects.toThrowError(
        /Storage service unavailable for signed URL generation/,
      );
    });

    it('queues a first-time PDF when storage reports a missing object', async () => {
      const mockProfileRepo = {
        findSeekerProfileByUserId: async () => ({
          id: 'skr-123',
          full_name: 'Test Seeker',
          seeker_type: 'experienced',
          city: 'Delhi',
          skills: ['Welding'],
        }),
      } as unknown as import('../src/database/repositories/profile.repository.js').ProfileRepository;

      const createSignedUrl = vi.fn()
        .mockResolvedValueOnce({ data: null, error: { status: 400, statusCode: '404', message: 'Object not found' } })
        .mockResolvedValueOnce({ data: { signedUrl: 'https://storage.example.test/resume.pdf' }, error: null });
      const publishPdfJob = vi.fn().mockResolvedValue({});
      const mockSupabase = {
        storage: {
          from: () => ({ createSignedUrl }),
        },
      } as unknown as import('@supabase/supabase-js').SupabaseClient<import('@indian-job-portal/database').Database>;

      const service = new ProfilesService(
        mockProfileRepo,
        {} as import('../src/database/repositories/user.repository.js').UserRepository,
        {} as import('../src/database/repositories/location.repository.js').LocationRepository,
        { publishPdfJob } as unknown as QueueService,
        mockSupabase,
      );

      await expect(service.getSeekerPdfDownload('usr-1')).resolves.toEqual({ downloadUrl: null, cached: false });
      expect(publishPdfJob).toHaveBeenCalledOnce();
      expect(publishPdfJob).toHaveBeenCalledWith(expect.objectContaining({ seekerId: 'skr-123' }));
      await expect(service.getSeekerPdfDownload('usr-1')).resolves.toEqual({
        downloadUrl: 'https://storage.example.test/resume.pdf',
        cached: true,
      });
      expect(publishPdfJob).toHaveBeenCalledOnce();
    });
  });
});
