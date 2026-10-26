import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, Logger } from '@nestjs/common';
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
} from '@indian-job-portal/validation';
import { JobRepository } from '../database/repositories/job.repository.js';
import { ApplicationRepository } from '../database/repositories/application.repository.js';
import { ProfileRepository } from '../database/repositories/profile.repository.js';
import { WalletService } from '../wallet/wallet.service.js';
import type { JobRow, ApplicationRow } from '@indian-job-portal/database';

export interface JobRecord extends CreateJobInput {
  id: string;
  employerId: string;
  isActive: boolean;
  isFeatured?: boolean;
  featuredUntil?: string | null;
  isPromoted?: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
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

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  constructor(
    @Inject(JobRepository) private readonly jobRepository: JobRepository,
    @Inject(ApplicationRepository) private readonly applicationRepository: ApplicationRepository,
    @Inject(ProfileRepository) private readonly profileRepository: ProfileRepository,
    @Inject(WalletService) private readonly walletService: WalletService,
  ) {}

  async createJob(employerId: string, input: CreateJobInput): Promise<JobRecord> {
    const id = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    const row: JobRow = {
      id,
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

  async getJobs(filters: JobFilterInput): Promise<{ jobs: JobRecord[]; total: number }> {
    const { jobs: rows, total } = await this.jobRepository.findMany({
      keyword: filters.keyword,
      city: filters.city,
      category: filters.category,
      minPay: filters.minPay,
      limit: filters.limit,
      offset: filters.offset,
    });

    return {
      jobs: rows.map(mapJobRowToRecord),
      total,
    };
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
    if (role !== 'admin' && existing.employer_id !== employerId) {
      throw new ForbiddenException('Unauthorized to modify this job posting');
    }

    const updated = await this.jobRepository.update(jobId, {
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
    if (role !== 'admin' && existing.employer_id !== employerId) {
      throw new ForbiddenException('Unauthorized to delete this job posting');
    }

    await this.jobRepository.softDelete(jobId);
    return { success: true };
  }

  // JOB-03: Candidate applies to job
  async applyToJob(applicantId: string, jobId: string): Promise<ApplicationRecord> {
    const job = await this.getJobById(jobId);
    if (!job.isActive) {
      throw new BadRequestException('Job is no longer active');
    }

    const existingApp = await this.applicationRepository.findByJobAndApplicant(jobId, applicantId);
    if (existingApp) {
      throw new BadRequestException('You have already applied to this job');
    }

    // Deduct 1 credit for job application (WAL-02, Hard Invariant #7)
    await this.walletService.deductForJobApplication(applicantId, jobId, job.title);

    const appId = `app_${jobId}_${applicantId}`;
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

    await this.applicationRepository.create(appRow);

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
    if (role !== 'admin' && job.employer_id !== employerId) {
      throw new ForbiddenException('Unauthorized to view applications for this job');
    }

    const appRows = await this.applicationRepository.findByJobId(jobId);
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
    if (!job || (role !== 'admin' && job.employer_id !== employerId)) {
      throw new ForbiddenException('Unauthorized to modify application status');
    }

    const updated = await this.applicationRepository.updateStatus(applicationId, status);
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
}
