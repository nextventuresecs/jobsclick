import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UsePipes,
  UseGuards,
  Inject,
} from '@nestjs/common';
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator.js';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
@UsePipes(ZodValidationPipe)
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobsService: JobsService) {}

  @Post()
  async createJob(@CurrentUser() user: AuthUser, @Body() body: CreateJobInput) {
    const validated = createJobSchema.parse(body);
    return this.jobsService.createJob(user.id, validated);
  }

  @Public()
  @Get()
  async getJobs(@Query() query: JobFilterInput) {
    const validated = jobFilterSchema.parse(query);
    return this.jobsService.getJobs(validated);
  }

  @Get('applications/my')
  async getMyApplications(@CurrentUser() user: AuthUser) {
    return this.jobsService.getMyApplications(user.id);
  }

  @Public()
  @Get(':id')
  async getJobById(@Param('id') id: string) {
    return this.jobsService.getJobById(id);
  }

  @Put(':id')
  async updateJob(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateJobInput,
  ) {
    const validated = updateJobSchema.parse(body);
    return this.jobsService.updateJob(user.id, id, validated);
  }

  @Delete(':id')
  async deleteJob(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobsService.deleteJob(user.id, id);
  }

  // Application Endpoints (JOB-03)
  @Post(':id/apply')
  async applyToJob(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobsService.applyToJob(user.id, id);
  }

  @Get(':id/applications')
  async getJobApplications(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobsService.getJobApplications(user.id, id);
  }

  @Put('applications/:appId/status')
  async updateApplicationStatus(
    @CurrentUser() user: AuthUser,
    @Param('appId') appId: string,
    @Body() body: UpdateApplicationStatusInput,
  ) {
    const validated = updateApplicationStatusSchema.parse(body);
    return this.jobsService.updateApplicationStatus(user.id, appId, validated.status);
  }
}
