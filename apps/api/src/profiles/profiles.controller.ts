import { Controller, Get, Put, Body, Param, Headers, UsePipes, Inject } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { ProfilesService } from './profiles.service.js';
import {
  jobSeekerProfileSchema,
  businessProfileSchema,
  institutionProfileSchema,
  JobSeekerProfileInput,
  BusinessProfileInput,
  InstitutionProfileInput,
} from '@indian-job-portal/validation';

@Controller('profiles')
@UsePipes(ZodValidationPipe)
export class ProfilesController {
  constructor(@Inject(ProfilesService) private readonly profilesService: ProfilesService) {}

  // Job Seeker Endpoints (JS-01, JS-02, JS-05, JS-07)
  @Get('seeker/me')
  async getSeekerProfileMe(@Headers('x-user-id') userId: string) {
    return this.profilesService.getSeekerProfileMe(userId || 'usr_seeker_1');
  }

  @Put('seeker/me')
  async updateSeekerProfileMe(@Headers('x-user-id') userId: string, @Body() body: JobSeekerProfileInput) {
    // Pipe validates schema + DPDP consent rule
    const validated = jobSeekerProfileSchema.parse(body);
    return this.profilesService.updateSeekerProfileMe(userId || 'usr_seeker_1', validated);
  }

  // Employer / Public viewing candidate profile (Hard Invariant 1: Phone/Email stripped)
  @Get('seeker/:id')
  async getSeekerProfilePublic(@Param('id') id: string) {
    return this.profilesService.getSeekerProfilePublic(id);
  }

  // Business Profile Endpoints (EMP-01, EMP-02, EMP-03)
  @Get('business/me')
  async getBusinessProfileMe(@Headers('x-user-id') userId: string) {
    return this.profilesService.getBusinessProfileMe(userId || 'usr_employer_1');
  }

  @Put('business/me')
  async updateBusinessProfileMe(@Headers('x-user-id') userId: string, @Body() body: BusinessProfileInput) {
    const validated = businessProfileSchema.parse(body);
    return this.profilesService.updateBusinessProfileMe(userId || 'usr_employer_1', validated);
  }

  @Get('business/:id')
  async getBusinessProfilePublic(@Param('id') id: string) {
    return this.profilesService.getBusinessProfilePublic(id);
  }

  // QR Code Generation for Company Profile Page (EMP-03)
  @Get('business/:id/qr')
  async getBusinessQr(@Param('id') id: string) {
    return this.profilesService.generateBusinessQr(id);
  }

  // Institution Profile Endpoints (INT-01)
  @Get('institution/me')
  async getInstitutionProfileMe(@Headers('x-user-id') userId: string) {
    return this.profilesService.getInstitutionProfileMe(userId || 'usr_inst_1');
  }

  @Put('institution/me')
  async updateInstitutionProfileMe(@Headers('x-user-id') userId: string, @Body() body: InstitutionProfileInput) {
    const validated = institutionProfileSchema.parse(body);
    return this.profilesService.updateInstitutionProfileMe(userId || 'usr_inst_1', validated);
  }
}
