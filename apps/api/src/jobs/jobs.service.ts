import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  CreateJobInput,
  UpdateJobInput,
  JobFilterInput,
  ApplicationStatus,
} from '@indian-job-portal/validation';

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

@Injectable()
export class JobsService {
  private jobs = new Map<string, JobRecord>();
  private applications = new Map<string, ApplicationRecord>();

  async createJob(employerId: string, input: CreateJobInput): Promise<JobRecord> {
    const id = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    const record: JobRecord = {
      id,
      employerId,
      isActive: true,
      source: 'direct',
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    this.jobs.set(id, record);
    return record;
  }

  async getJobs(filters: JobFilterInput): Promise<{ jobs: JobRecord[]; total: number }> {
    let result = Array.from(this.jobs.values()).filter((j) => j.isActive);

    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(kw) ||
          j.description.toLowerCase().includes(kw) ||
          j.skills.some((s) => s.toLowerCase().includes(kw)),
      );
    }

    if (filters.city) {
      result = result.filter((j) => j.city.toLowerCase() === filters.city!.toLowerCase());
    }

    if (filters.category) {
      result = result.filter((j) => j.category === filters.category);
    }

    if (filters.minPay !== undefined) {
      result = result.filter((j) => j.maxPay >= filters.minPay!);
    }

    const total = result.length;
    const paginated = result.slice(filters.offset, filters.offset + filters.limit);
    return { jobs: paginated, total };
  }

  async getJobById(id: string): Promise<JobRecord> {
    const job = this.jobs.get(id);
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  async updateJob(employerId: string, jobId: string, input: UpdateJobInput): Promise<JobRecord> {
    const job = await this.getJobById(jobId);
    if (job.employerId !== employerId) {
      throw new BadRequestException('Unauthorized to modify this job posting');
    }
    const updated: JobRecord = {
      ...job,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, updated);
    return updated;
  }

  async deleteJob(employerId: string, jobId: string): Promise<{ success: boolean }> {
    const job = await this.getJobById(jobId);
    if (job.employerId !== employerId) {
      throw new BadRequestException('Unauthorized to delete this job posting');
    }
    job.isActive = false;
    return { success: true };
  }

  // JOB-03: Candidate applies to job
  async applyToJob(applicantId: string, jobId: string): Promise<ApplicationRecord> {
    const job = await this.getJobById(jobId);
    if (!job.isActive) {
      throw new BadRequestException('Job is no longer active');
    }

    const appId = `app_${jobId}_${applicantId}`;
    if (this.applications.has(appId)) {
      throw new BadRequestException('You have already applied to this job');
    }

    const appRecord: ApplicationRecord = {
      id: appId,
      jobId,
      applicantId,
      status: 'applied',
      source: 'direct',
      createdAt: new Date().toISOString(),
      applicantProfile: {
        seekerId: `seeker_${applicantId}`,
        fullName: 'Anita Sharma',
        seekerType: 'student',
        city: 'Indore',
        skills: ['Tally', 'Accounting'],
        // Hard Invariant #1: Phone & email explicitly excluded!
      },
    };

    this.applications.set(appId, appRecord);
    return appRecord;
  }

  // Employer views applicant list (Hard Invariant #1 check)
  async getJobApplications(employerId: string, jobId: string): Promise<ApplicationRecord[]> {
    const job = await this.getJobById(jobId);
    if (job.employerId !== employerId) {
      throw new BadRequestException('Unauthorized to view applications for this job');
    }

    return Array.from(this.applications.values()).filter((a) => a.jobId === jobId);
  }

  async updateApplicationStatus(
    employerId: string,
    applicationId: string,
    status: ApplicationStatus,
  ): Promise<ApplicationRecord> {
    const appRecord = this.applications.get(applicationId);
    if (!appRecord) {
      throw new NotFoundException('Application record not found');
    }

    const job = await this.getJobById(appRecord.jobId);
    if (job.employerId !== employerId) {
      throw new BadRequestException('Unauthorized to modify application status');
    }

    appRecord.status = status;
    return appRecord;
  }
}
