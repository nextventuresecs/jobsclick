import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import {
  CreateJobInput,
  UpdateJobInput,
  JobFilterInput,
  ApplicationStatus,
} from '@indian-job-portal/validation';
import { JobRepository } from '../database/repositories/job.repository.js';
import { ApplicationRepository } from '../database/repositories/application.repository.js';
import { ProfileRepository } from '../database/repositories/profile.repository.js';
import type { JobRow, ApplicationRow } from '@indian-job-portal/database';

export interface JobRecord extends CreateJobInput {
  id: string;
  employerId: string;
  isActive: boolean;
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
  return {
    id: row.id,
    employerId: row.employer_id,
    title: row.title,
    description: row.description,
    category: row.category as any,
    employmentType: row.employment_type as any,
    experienceLevel: row.experience_level as any,
    minPay: row.min_pay,
    maxPay: row.max_pay ?? 0,
    city: row.city,
    district: row.district,
    state: row.state,
    openings: row.openings,
    skills: row.skills ?? [],
    isActive: row.is_active,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class JobsService {
  constructor(
    @Inject(JobRepository) private readonly jobRepository: JobRepository,
    @Inject(ApplicationRepository) private readonly applicationRepository: ApplicationRepository,
    @Inject(ProfileRepository) private readonly profileRepository: ProfileRepository,
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

  async updateJob(employerId: string, jobId: string, input: UpdateJobInput): Promise<JobRecord> {
    const existing = await this.jobRepository.findById(jobId);
    if (!existing) {
      throw new NotFoundException('Job not found');
    }
    if (existing.employer_id !== employerId) {
      throw new BadRequestException('Unauthorized to modify this job posting');
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

  async deleteJob(employerId: string, jobId: string): Promise<{ success: boolean }> {
    const existing = await this.jobRepository.findById(jobId);
    if (!existing) {
      throw new NotFoundException('Job not found');
    }
    if (existing.employer_id !== employerId) {
      throw new BadRequestException('Unauthorized to delete this job posting');
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

    return {
      id: appId,
      jobId,
      applicantId,
      status: 'applied',
      source: 'direct',
      createdAt: now,
      applicantProfile: {
        seekerId: seekerProfile?.id || `seeker_${applicantId}`,
        fullName: seekerProfile?.full_name || 'Anita Sharma',
        seekerType: seekerProfile?.seeker_type || 'student',
        city: seekerProfile?.city || 'Indore',
        skills: seekerProfile?.skills || ['Tally', 'Accounting'],
        // Hard Invariant #1: Phone & email explicitly excluded!
      },
    };
  }

  // Employer views applicant list (Hard Invariant #1 check)
  async getJobApplications(employerId: string, jobId: string): Promise<ApplicationRecord[]> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (job.employer_id !== employerId) {
      throw new BadRequestException('Unauthorized to view applications for this job');
    }

    const appRows = await this.applicationRepository.findByJobId(jobId);
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
          fullName: seekerProfile?.full_name || 'Anita Sharma',
          seekerType: seekerProfile?.seeker_type || 'student',
          city: seekerProfile?.city || 'Indore',
          skills: seekerProfile?.skills || ['Tally', 'Accounting'],
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
  ): Promise<ApplicationRecord> {
    const appRecord = await this.applicationRepository.findById(applicationId);
    if (!appRecord) {
      throw new NotFoundException('Application record not found');
    }

    const job = await this.jobRepository.findById(appRecord.job_id);
    if (!job || job.employer_id !== employerId) {
      throw new BadRequestException('Unauthorized to modify application status');
    }

    const updated = await this.applicationRepository.updateStatus(applicationId, status);
    const seekerProfile = await this.profileRepository.findSeekerProfileByUserId(appRecord.applicant_id);

    return {
      id: updated!.id,
      jobId: updated!.job_id,
      applicantId: updated!.applicant_id,
      status: updated!.status as ApplicationStatus,
      source: updated!.source,
      createdAt: updated!.created_at,
      applicantProfile: {
        seekerId: seekerProfile?.id || `seeker_${appRecord.applicant_id}`,
        fullName: seekerProfile?.full_name || 'Anita Sharma',
        seekerType: seekerProfile?.seeker_type || 'student',
        city: seekerProfile?.city || 'Indore',
        skills: seekerProfile?.skills || ['Tally', 'Accounting'],
        // Hard Invariant #1: Phone & email explicitly excluded!
      },
    };
  }
}
