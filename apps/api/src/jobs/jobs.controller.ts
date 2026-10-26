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
  promoteJobSchema,
  createJobAlertSchema,
  PromoteJobInput,
  CreateJobAlertInput,
} from '@indian-job-portal/validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator.js';
import { RequireFeatureFlag } from '../auth/guards/feature-flag.guard.js';

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(ZodValidationPipe)
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobsService: JobsService) {}

  @Roles('employer', 'admin')
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

  @Roles('job_seeker', 'admin')
  @Get('applications/my')
  async getMyApplications(@CurrentUser() user: AuthUser) {
    return this.jobsService.getMyApplications(user.id);
  }

  @Roles('job_seeker', 'employer', 'admin')
  @Post('alerts')
  async createJobAlert(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateJobAlertInput,
  ) {
    const validated = createJobAlertSchema.parse(body);
    return this.jobsService.createJobAlert(user.id, validated);
  }

  @Roles('job_seeker', 'employer', 'admin')
  @Get('alerts')
  async getJobAlerts(@CurrentUser() user: AuthUser) {
    return this.jobsService.getJobAlerts(user.id);
  }

  @Public()
  @Get(':id')
  async getJobById(@Param('id') id: string) {
    return this.jobsService.getJobById(id);
  }

  @Roles('employer', 'admin')
  @Put(':id')
  async updateJob(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateJobInput,
  ) {
    const validated = updateJobSchema.parse(body);
    return this.jobsService.updateJob(user.id, id, validated, user.role);
  }

  @Roles('employer', 'admin')
  @Delete(':id')
  async deleteJob(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobsService.deleteJob(user.id, id, user.role);
  }

  @Roles('employer', 'admin', 'msme_admin')
  @Post(':id/promote')
  @RequireFeatureFlag('ENABLE_P2_FEATURED_PROMOTIONS')
  async promoteJob(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: PromoteJobInput,
  ) {
    const validated = promoteJobSchema.parse(body);
    return this.jobsService.promoteJob(user.id, id, validated, user.role);
  }

  // Application Endpoints (JOB-03)
  @Roles('job_seeker', 'admin')
  @Post(':id/apply')
  async applyToJob(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobsService.applyToJob(user.id, id);
  }

  @Roles('employer', 'admin')
  @Get(':id/applications')
  async getJobApplications(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobsService.getJobApplications(user.id, id, user.role);
  }

  @Roles('employer', 'admin')
  @Put('applications/:appId/status')
  async updateApplicationStatus(
    @CurrentUser() user: AuthUser,
    @Param('appId') appId: string,
    @Body() body: UpdateApplicationStatusInput,
  ) {
    const validated = updateApplicationStatusSchema.parse(body);
    return this.jobsService.updateApplicationStatus(user.id, appId, validated.status, user.role);
  }
}
