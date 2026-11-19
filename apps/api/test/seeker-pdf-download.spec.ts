import { describe, it, expect, beforeEach } from 'vitest';
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
        downloadUrl: `https://storage.jobsclick.live/private/resumes/seeker_${userId}.pdf?token=mock`,
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
});
