import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { SmsGateway, SendInviteSmsOptions, SmsResponse } from '../src/auth/sms.service.js';
import { JobRepository } from '../src/database/repositories/job.repository.js';
import { ApplicationRepository } from '../src/database/repositories/application.repository.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { WalletService } from '../wallet/wallet.service.js';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import type { ApplicationRow, JobRow, UserRow } from '@indian-job-portal/database';

describe('In-Platform Interview Invite SMS (Hard Invariant #1 & JOB-03)', () => {
  let jobsService: JobsService;
  let mockSmsGateway: {
    sendOtp: ReturnType<typeof vi.fn>;
    sendInviteSms: ReturnType<typeof vi.fn>;
  };

  const sampleJob: JobRow = {
    id: 'job-123',
    public_slug: '123456789abc',
    employer_id: 'usr-employer-1',
    title: 'CNC Machine Operator',
    description: 'Operating Haas CNC machines in industrial facility',
    category: 'manufacturing',
    employment_type: 'full_time',
    experience_level: 'experienced',
    min_pay: 22000,
    max_pay: 30000,
    city: 'Pune',
    district: 'Pune',
    state: 'Maharashtra',
    openings: 3,
    skills: ['CNC', 'G-Code', 'M-Code'],
    is_active: true,
    is_featured: false,
    featured_until: null,
    source: 'direct',
    created_by: 'usr-employer-1',
    updated_by: 'usr-employer-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sampleApplication: ApplicationRow = {
    id: 'app-999',
    job_id: 'job-123',
    applicant_id: 'usr-seeker-456',
    status: 'shortlisted',
    source: 'direct',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sampleSeekerUser: UserRow = {
    id: 'usr-seeker-456',
    phone: '9876543210',
    email: 'confidential.seeker@example.com',
    role: 'job_seeker',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    mockSmsGateway = {
      sendOtp: vi.fn(),
      sendInviteSms: vi.fn().mockResolvedValue({
        success: true,
        message: 'Interview invite sent via SMS',
        messageId: 'mock-msg-123',
      } as SmsResponse),
    };

    const mockJobRepo = {
      findById: vi.fn(async (id: string) => (id === sampleJob.id ? sampleJob : null)),
    } as unknown as JobRepository;

    const mockAppRepo = {
      findById: vi.fn(async (id: string) => (id === sampleApplication.id ? sampleApplication : null)),
    } as unknown as ApplicationRepository;

    const mockProfileRepo = {
      findSeekerProfileByUserId: vi.fn(async () => ({ full_name: 'Rahul Sharma' })),
      findBusinessProfileByUserId: vi.fn(async () => ({ company_name: 'Bharat Precision Gears' })),
    } as unknown as ProfileRepository;

    const mockUserRepo = {
      findById: vi.fn(async (id: string) => (id === sampleSeekerUser.id ? sampleSeekerUser : null)),
    } as unknown as UserRepository;

    const mockWalletService = {} as unknown as WalletService;

    jobsService = new JobsService(
      mockJobRepo,
      mockAppRepo,
      mockProfileRepo,
      mockWalletService,
      mockUserRepo,
      mockSmsGateway as unknown as SmsGateway,
    );
  });

  it('dispatches SMS to candidate phone resolved purely server-side and strips PII from response', async () => {
    const response = await jobsService.sendInterviewInvite('usr-employer-1', 'app-999', 'employer');

    expect(response.success).toBe(true);
    expect(response.message).toContain('Interview invite');

    // Verify SMS Gateway was dispatched with candidate's unmasked phone
    expect(mockSmsGateway.sendInviteSms).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '9876543210',
        candidateName: 'Rahul Sharma',
        companyName: 'Bharat Precision Gears',
        jobTitle: 'CNC Machine Operator',
      } as SendInviteSmsOptions)
    );

    // Hard Invariant #1: Employer response strictly contains ZERO candidate phone or email
    const responseRecord = response as Record<string, unknown>;
    expect(responseRecord['phone']).toBeUndefined();
    expect(responseRecord['candidatePhone']).toBeUndefined();
    expect(responseRecord['email']).toBeUndefined();
    expect(responseRecord['candidateEmail']).toBeUndefined();
  });

  it('throws ForbiddenException when employer attempts to invite candidate for another employer job', async () => {
    await expect(
      jobsService.sendInterviewInvite('usr-unauthorized-employer', 'app-999', 'employer')
    ).rejects.toThrow(ForbiddenException);

    expect(mockSmsGateway.sendInviteSms).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when application does not exist', async () => {
    await expect(
      jobsService.sendInterviewInvite('usr-employer-1', 'non-existent-app', 'employer')
    ).rejects.toThrow(NotFoundException);

    expect(mockSmsGateway.sendInviteSms).not.toHaveBeenCalled();
  });

  it('throws BadRequestException if candidate user has no registered phone number', async () => {
    const userWithoutPhone: UserRow = {
      ...sampleSeekerUser,
      id: 'usr-no-phone',
      phone: null,
    };
    const appWithNoPhoneCandidate: ApplicationRow = {
      ...sampleApplication,
      id: 'app-no-phone',
      applicant_id: 'usr-no-phone',
    };

    const mockAppRepo = {
      findById: vi.fn(async (id: string) => (id === 'app-no-phone' ? appWithNoPhoneCandidate : null)),
    } as unknown as ApplicationRepository;

    const mockJobRepo = {
      findById: vi.fn(async () => sampleJob),
    } as unknown as JobRepository;

    const mockUserRepo = {
      findById: vi.fn(async (id: string) => (id === 'usr-no-phone' ? userWithoutPhone : null)),
    } as unknown as UserRepository;

    const service = new JobsService(
      mockJobRepo,
      mockAppRepo,
      {
        findSeekerProfileByUserId: vi.fn(async () => null),
        findBusinessProfileByUserId: vi.fn(async () => null),
      } as unknown as ProfileRepository,
      {} as unknown as WalletService,
      mockUserRepo,
      mockSmsGateway as unknown as SmsGateway,
    );

    await expect(
      service.sendInterviewInvite('usr-employer-1', 'app-no-phone', 'employer')
    ).rejects.toThrow(BadRequestException);
  });
});
