import { Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException, ServiceUnavailableException, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CreateJobInput,
  UpdateJobInput,
  JobFilterInput,
  ApplicationStatus,
  IndustryCategory,
  EmploymentType,
  ExperienceLevel,
  PromoteJobInput,
  CreateJobAlertInput,
  JobAlertResponse,
  FEATURED_PROMOTION_PRICING,
  generatePublicSlug,
} from '@indian-job-portal/validation';
import { JobRepository } from '../database/repositories/job.repository.js';
import { ApplicationRepository } from '../database/repositories/application.repository.js';
import { ProfileRepository } from '../database/repositories/profile.repository.js';
import { UserRepository } from '../database/repositories/user.repository.js';
import { LocationRepository } from '../database/repositories/location.repository.js';
import { SmsGateway } from '../auth/sms.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { createActorAuthorizationContext } from '../auth/authorization-context.js';
import type { JobRow, ApplicationRow } from '@indian-job-portal/database';

export interface JobRecord extends CreateJobInput {
  id: string;
  slug?: string;
  employerId: string;
  isActive: boolean;
  isFeatured?: boolean;
  featuredUntil?: string | null;
  isPromoted?: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicJobRecord {
  slug: string;
  title: string;
  description: string;
  category: IndustryCategory;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  minPay: number;
  maxPay: number;
  city: string;
  district: string;
  state: string;
  openings: number;
  skills: string[];
  isFeatured: boolean;
  featuredUntil: string | null;
  isPromoted: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  companySlug?: string;
}

export interface ApplicationRecord {
  id: string;
  jobId: string;
  applicantId: string;
  status: ApplicationStatus;
  source: string;
  createdAt: string;
  applicantProfile: {
    seekerId: string;
    fullName: string;
    seekerType: string;
    city: string;
    skills: string[];
    // Hard Invariant #1: NO phone, NO email!
  };
}

function mapJobRowToRecord(row: JobRow): JobRecord {
  const isPromoted = Boolean(
    row.is_featured &&
    row.featured_until &&
    new Date(row.featured_until).getTime() > Date.now(),
  );
  return {
    id: row.id,
    slug: row.public_slug,
    employerId: row.employer_id,
    title: row.title,
    description: row.description,
    category: row.category as IndustryCategory,
    employmentType: row.employment_type as EmploymentType,
    experienceLevel: row.experience_level as ExperienceLevel,
    minPay: row.min_pay ?? 0,
    maxPay: row.max_pay ?? 0,
    city: row.city,
    district: row.district ?? '',
    state: row.state ?? '',
    stateCode: row.state_code ?? null,
    districtId: row.district_id ?? null,
    openings: row.openings,
    skills: row.skills ?? [],
    isFeatured: row.is_featured ?? false,
    featuredUntil: row.featured_until ?? null,
    isPromoted,
    isActive: row.is_active,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ID-02: Public job response shape.
// Strictly omits internal id, employerId, userId, and owner references.
export function mapJobRowToPublicRecord(row: JobRow, companySlug?: string): PublicJobRecord {
  const isPromoted = Boolean(
    row.is_featured &&
    row.featured_until &&
    new Date(row.featured_until).getTime() > Date.now(),
  );
  return {
    slug: row.public_slug || (row as unknown as { slug?: string }).slug || '',
    title: row.title,
    description: row.description,
    category: row.category as IndustryCategory,
    employmentType: row.employment_type as EmploymentType,
    experienceLevel: row.experience_level as ExperienceLevel,
    minPay: row.min_pay ?? 0,
    maxPay: row.max_pay ?? 0,
    city: row.city,
    district: row.district ?? '',
    state: row.state ?? '',
    openings: row.openings,
    skills: row.skills ?? [],
    isFeatured: row.is_featured ?? false,
    featuredUntil: row.featured_until ?? null,
    isPromoted,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(companySlug ? { companySlug } : {}),
  };
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  constructor(
    @Inject(JobRepository) private readonly jobRepository: JobRepository,
    @Inject(ApplicationRepository) private readonly applicationRepository: ApplicationRepository,
    @Inject(ProfileRepository) private readonly profileRepository: ProfileRepository,
    @Inject(WalletService) private readonly walletService: WalletService,
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Inject(SmsGateway) private readonly smsGateway: SmsGateway,
    @Optional() @Inject(LocationRepository) private readonly locationRepository?: LocationRepository,
  ) {}

  private async resolveLocationRefs(
    stateCode?: number | null,
    districtId?: string | null,
  ): Promise<{ stateCode: number | null; districtId: string | null }> {
    if (!this.locationRepository || (stateCode == null && districtId == null)) {
      return { stateCode: stateCode ?? null, districtId: districtId ?? null };
    }
    return this.locationRepository.validateDistrictForState(stateCode, districtId);
  }

  async createJob(employerId: string, input: CreateJobInput): Promise<JobRecord> {
    const locationRefs = await this.resolveLocationRefs(input.stateCode, input.districtId);
    const id = randomUUID();
    const now = new Date().toISOString();

    const row: JobRow = {
      id,
      public_slug: generatePublicSlug(),
      employer_id: employerId,
      title: input.title,
      description: input.description,
      category: input.category,
      employment_type: input.employmentType,
      experience_level: input.experienceLevel,
      min_pay: input.minPay,
      max_pay: input.maxPay,
      city: input.city,
      district: input.district,
      state: input.state,
      state_code: locationRefs.stateCode,
      district_id: locationRefs.districtId,
      openings: input.openings,
      skills: input.skills,
      is_active: true,
      source: 'direct',
      created_by: employerId,
      updated_by: employerId,
      created_at: now,
      updated_at: now,
    };

    await this.jobRepository.create(row);
    return mapJobRowToRecord(row);
  }

  // ID-02: Public job list returns opaque slugs, no internal database or employer IDs
  async getJobs(filters: JobFilterInput): Promise<{ jobs: PublicJobRecord[]; total: number }> {
    const { jobs: rows, total } = await this.jobRepository.findMany({
      keyword: filters.keyword,
      city: filters.city,
      category: filters.category,
      employmentType: filters.employmentType,
      minPay: filters.minPay,
      companyId: filters.companyId,
      limit: filters.limit,
      offset: filters.offset,
    });

    const publicJobs: PublicJobRecord[] = [];
    for (const row of rows) {
      const companySlug =
        (row as unknown as { company_slug?: string }).company_slug ||
        (row.employer_id ? (await this.profileRepository.findBusinessProfileByUserId(row.employer_id))?.public_slug : undefined);
      publicJobs.push(mapJobRowToPublicRecord(row, companySlug));
    }

    return {
      jobs: publicJobs,
      total,
    };
  }

  // ID-02: Employer job list carries public_slug on each job record
  async getEmployerJobs(employerId: string): Promise<JobRecord[]> {
    const rows = await this.jobRepository.findByEmployerId(employerId);
    return rows.map(mapJobRowToRecord);
  }

  // ID-02: Public job details looked up exclusively by public_slug
  async getJobBySlug(slug: string): Promise<PublicJobRecord> {
    const row = await this.jobRepository.findByPublicSlug(slug);
    if (!row) {
      throw new NotFoundException('Job not found');
    }
    const bizProfile = await this.profileRepository.findBusinessProfileByUserId(row.employer_id);
    return mapJobRowToPublicRecord(row, bizProfile?.public_slug);
  }

  async getJobById(id: string): Promise<JobRecord> {
    const row = await this.jobRepository.findById(id);
    if (!row) {
      throw new NotFoundException('Job not found');
    }
    return mapJobRowToRecord(row);
  }

  async updateJob(employerId: string, jobId: string, input: UpdateJobInput, role?: string): Promise<JobRecord> {
    const existing = await this.jobRepository.findById(jobId);
    if (!existing) {
      throw new NotFoundException('Job not found');
    }
    const ctx = createActorAuthorizationContext(employerId, role || 'employer');
    const nextStateCode = input.stateCode !== undefined ? input.stateCode : existing.state_code;
    const nextDistrictId = input.districtId !== undefined ? input.districtId : existing.district_id;
    const locationRefs = await this.resolveLocationRefs(nextStateCode, nextDistrictId);

    const updated = await this.jobRepository.updateForTenant(ctx, jobId, {
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      category: input.category ?? existing.category,
      employment_type: input.employmentType ?? existing.employment_type,
      experience_level: input.experienceLevel ?? existing.experience_level,
      min_pay: input.minPay ?? existing.min_pay,
      max_pay: input.maxPay ?? existing.max_pay,
      city: input.city ?? existing.city,
      district: input.district ?? existing.district,
      state: input.state ?? existing.state,
      state_code: locationRefs.stateCode,
      district_id: locationRefs.districtId,
      openings: input.openings ?? existing.openings,
      skills: input.skills ?? existing.skills,
      updated_by: employerId,
    });

    return mapJobRowToRecord(updated!);
  }

  async deleteJob(employerId: string, jobId: string, role?: string): Promise<{ success: boolean }> {
    const existing = await this.jobRepository.findById(jobId);
    if (!existing) {
      throw new NotFoundException('Job not found');
    }
    const ctx = createActorAuthorizationContext(employerId, role || 'employer');
    await this.jobRepository.softDeleteForTenant(ctx, jobId);
    return { success: true };
  }

  // JOB-03: Candidate applies to job (accepts either public_slug or internal UUID)
  async applyToJob(applicantId: string, jobIdOrSlug: string): Promise<ApplicationRecord> {
    let jobRow = await this.jobRepository.findByPublicSlug(jobIdOrSlug);
    if (!jobRow) {
      jobRow = await this.jobRepository.findById(jobIdOrSlug);
    }
    if (!jobRow) {
      throw new NotFoundException('Job not found');
    }
    if (!jobRow.is_active) {
      throw new BadRequestException('Job is no longer active');
    }
    const jobId = jobRow.id;

    const existingApp = await this.applicationRepository.findByJobAndApplicant(jobId, applicantId);
    if (existingApp) {
      throw new BadRequestException('You have already applied to this job');
    }

    // Deduct 1 credit for job application (WAL-02, Hard Invariant #7)
    const deduction = await this.walletService.deductForJobApplication(applicantId, jobId, jobRow.title);

    const appId = randomUUID();
    const now = new Date().toISOString();

    const appRow: ApplicationRow = {
      id: appId,
      job_id: jobId,
      applicant_id: applicantId,
      status: 'applied',
      source: 'direct',
      created_by: applicantId,
      updated_by: applicantId,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.applicationRepository.create(appRow);
    } catch {
      if (!deduction.isSponsored) {
        try {
          await this.walletService.recordTransaction({
            userId: applicantId,
            amount: 1,
            reason: `Refund for failed application submission: ${jobRow.title}`,
            actorId: 'system',
          });
        } catch (refundErr) {
          this.logger.error(`Failed to auto-refund credit for user ${applicantId}: ${refundErr}`);
        }
      }
      throw new BadRequestException('Application creation failed or already submitted. Any charged credits were refunded.');
    }

    const seekerProfile = await this.profileRepository.findSeekerProfileByUserId(applicantId);
    if (!seekerProfile) {
      this.logger.warn(`Applicant profile missing for user ${applicantId}; using generic applicant metadata without mock fallbacks`);
    }

    return {
      id: appId,
      jobId,
      applicantId,
      status: 'applied',
      source: 'direct',
      createdAt: now,
      applicantProfile: {
        seekerId: seekerProfile?.id || `seeker_${applicantId}`,
        fullName: seekerProfile?.full_name || 'Applicant',
        seekerType: seekerProfile?.seeker_type || 'individual',
        city: seekerProfile?.city || '',
        skills: seekerProfile?.skills || [],
        // Hard Invariant #1: Phone & email explicitly excluded!
      },
    };
  }

  // Employer views applicant list (Hard Invariant #1 check)
  async getJobApplications(employerId: string, jobId: string, role?: string): Promise<ApplicationRecord[]> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    const ctx = createActorAuthorizationContext(employerId, role || 'employer');
    const appRows = await this.applicationRepository.findByJobIdForEmployer(ctx, jobId, job.employer_id);
    const records: ApplicationRecord[] = [];

    for (const app of appRows) {
      const seekerProfile = await this.profileRepository.findSeekerProfileByUserId(app.applicant_id);
      if (!seekerProfile) {
        this.logger.warn(`Application ${app.id} references orphaned seeker profile for user ${app.applicant_id}`);
      }
      records.push({
        id: app.id,
        jobId: app.job_id,
        applicantId: app.applicant_id,
        status: app.status as ApplicationStatus,
        source: app.source,
        createdAt: app.created_at,
        applicantProfile: {
          seekerId: seekerProfile?.id || `seeker_${app.applicant_id}`,
          fullName: seekerProfile?.full_name || 'Applicant',
          seekerType: seekerProfile?.seeker_type || 'individual',
          city: seekerProfile?.city || '',
          skills: seekerProfile?.skills || [],
          // Hard Invariant #1: Phone & email explicitly excluded!
        },
      });
    }

    return records;
  }

  async updateApplicationStatus(
    employerId: string,
    applicationId: string,
    status: ApplicationStatus,
    role?: string,
  ): Promise<ApplicationRecord> {
    const appRecord = await this.applicationRepository.findById(applicationId);
    if (!appRecord) {
      throw new NotFoundException('Application record not found');
    }

    const job = await this.jobRepository.findById(appRecord.job_id);
    if (!job) {
      throw new ForbiddenException('Unauthorized to modify application status');
    }

    const ctx = createActorAuthorizationContext(employerId, role || 'employer');
    const updated = await this.applicationRepository.updateStatusForEmployer(
      ctx,
      applicationId,
      appRecord.job_id,
      job.employer_id,
      status,
    );
    const seekerProfile = await this.profileRepository.findSeekerProfileByUserId(appRecord.applicant_id);
    if (!seekerProfile) {
      this.logger.warn(`Application ${applicationId} references orphaned seeker profile for user ${appRecord.applicant_id}`);
    }

    return {
      id: updated!.id,
      jobId: updated!.job_id,
      applicantId: updated!.applicant_id,
      status: updated!.status as ApplicationStatus,
      source: updated!.source,
      createdAt: updated!.created_at,
      applicantProfile: {
        seekerId: seekerProfile?.id || `seeker_${appRecord.applicant_id}`,
        fullName: seekerProfile?.full_name || 'Applicant',
        seekerType: seekerProfile?.seeker_type || 'individual',
        city: seekerProfile?.city || '',
        skills: seekerProfile?.skills || [],
        // Hard Invariant #1: Phone & email explicitly excluded!
      },
    };
  }

  async getMyApplications(applicantId: string): Promise<ApplicationRecord[]> {
    const appRows = await this.applicationRepository.findByApplicantId(applicantId);
    const records: ApplicationRecord[] = [];

    for (const app of appRows) {
      const seekerProfile = await this.profileRepository.findSeekerProfileByUserId(app.applicant_id);
      records.push({
        id: app.id,
        jobId: app.job_id,
        applicantId: app.applicant_id,
        status: app.status as ApplicationStatus,
        source: app.source,
        createdAt: app.created_at,
        applicantProfile: {
          seekerId: seekerProfile?.id || `seeker_${app.applicant_id}`,
          fullName: seekerProfile?.full_name || 'Applicant',
          seekerType: seekerProfile?.seeker_type || 'individual',
          city: seekerProfile?.city || '',
          skills: seekerProfile?.skills || [],
          // Hard Invariant #1: Phone & email explicitly excluded!
        },
      });
    }

    return records;
  }

  async promoteJob(
    userId: string,
    jobId: string,
    input: PromoteJobInput,
    userRole?: string,
  ): Promise<{ success: boolean; job: JobRecord; cost: number; remainingBalance: number }> {
    const cost = FEATURED_PROMOTION_PRICING[input.durationDays] || 50;

    const result = await this.jobRepository.promoteJobAtomically({
      userId,
      jobId,
      durationDays: input.durationDays,
      cost,
      userRole,
    });

    return {
      success: true,
      job: mapJobRowToRecord(result.job),
      cost: result.cost,
      remainingBalance: result.remainingBalance,
    };
  }

  async createJobAlert(userId: string, input: CreateJobAlertInput): Promise<JobAlertResponse> {
    const row = await this.jobRepository.createAlert({
      userId,
      title: input.title,
      filters: input.filters,
      frequency: input.frequency,
    });

    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      filters: row.filters,
      frequency: row.frequency,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getJobAlerts(userId: string): Promise<JobAlertResponse[]> {
    const rows = await this.jobRepository.findAlertsByUserId(userId);
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      filters: row.filters,
      frequency: row.frequency,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Dispatches confidential interview invite SMS to candidate (Hard Invariant #1 & JOB-03).
   * Resolves candidate phone number purely server-side via UserRepository.
   * Strictly returns non-PII confirmation to employer to prevent contact data leakage.
   */
  async sendInterviewInvite(
    userId: string,
    applicationId: string,
    role: string,
  ): Promise<{ success: boolean; message: string }> {
    const application = await this.applicationRepository.findById(applicationId);
    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const job = await this.jobRepository.findById(application.job_id);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (role !== 'admin' && job.employer_id !== userId) {
      throw new ForbiddenException('You do not have permission to invite candidates for this job');
    }

    const candidateUser = await this.userRepository.findById(application.applicant_id);
    if (!candidateUser?.phone) {
      throw new BadRequestException('Candidate does not have a registered phone number');
    }

    const [seekerProfile, employerProfile] = await Promise.all([
      this.profileRepository.findSeekerProfileByUserId(application.applicant_id),
      this.profileRepository.findBusinessProfileByUserId(job.employer_id),
    ]);

    const candidateName = seekerProfile?.full_name || 'Candidate';
    const companyName = employerProfile?.company_name || 'Employer';

    const smsResult = await this.smsGateway.sendInviteSms({
      phone: candidateUser.phone,
      candidateName,
      companyName,
      jobTitle: job.title,
      language: 'hi',
    });

    if (!smsResult.success) {
      if (smsResult.message === 'no approved DLT template') {
        throw new ServiceUnavailableException('no approved DLT template');
      }
      throw new BadRequestException(smsResult.message || 'Failed to dispatch interview invite SMS');
    }

    this.logger.log(
      `[Interview Invite] In-platform interview invite dispatched for job "${job.id}" application "${application.id}"`,
    );

    return {
      success: true,
      message: 'Interview invite sent to candidate via confidential platform SMS',
    };
  }
}
