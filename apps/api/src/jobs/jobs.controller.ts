import { Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, UsePipes, Inject } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { JobsService } from './jobs.service.js';
import {
  createJobSchema,
  updateJobSchema,
  jobFilterSchema,
  updateApplicationStatusSchema,
  CreateJobInput,
  UpdateJobInput,
  JobFilterInput,
  UpdateApplicationStatusInput,
} from '@indian-job-portal/validation';

@Controller('jobs')
@UsePipes(ZodValidationPipe)
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobsService: JobsService) {}

  @Post()
  async createJob(@Headers('x-user-id') employerId: string, @Body() body: CreateJobInput) {
    const validated = createJobSchema.parse(body);
    return this.jobsService.createJob(employerId || 'usr_employer_1', validated);
  }

  @Get()
  async getJobs(@Query() query: JobFilterInput) {
    const validated = jobFilterSchema.parse(query);
    return this.jobsService.getJobs(validated);
  }

  @Get(':id')
  async getJobById(@Param('id') id: string) {
    return this.jobsService.getJobById(id);
  }

  @Put(':id')
  async updateJob(
    @Headers('x-user-id') employerId: string,
    @Param('id') id: string,
    @Body() body: UpdateJobInput,
  ) {
    const validated = updateJobSchema.parse(body);
    return this.jobsService.updateJob(employerId || 'usr_employer_1', id, validated);
  }

  @Delete(':id')
  async deleteJob(@Headers('x-user-id') employerId: string, @Param('id') id: string) {
    return this.jobsService.deleteJob(employerId || 'usr_employer_1', id);
  }

  // Application Endpoints (JOB-03)
  @Post(':id/apply')
  async applyToJob(@Headers('x-user-id') applicantId: string, @Param('id') id: string) {
    return this.jobsService.applyToJob(applicantId || 'usr_seeker_1', id);
  }

  @Get(':id/applications')
  async getJobApplications(@Headers('x-user-id') employerId: string, @Param('id') id: string) {
    return this.jobsService.getJobApplications(employerId || 'usr_employer_1', id);
  }

  @Put('applications/:appId/status')
  async updateApplicationStatus(
    @Headers('x-user-id') employerId: string,
    @Param('appId') appId: string,
    @Body() body: UpdateApplicationStatusInput,
  ) {
    const validated = updateApplicationStatusSchema.parse(body);
    return this.jobsService.updateApplicationStatus(employerId || 'usr_employer_1', appId, validated.status);
  }
}
