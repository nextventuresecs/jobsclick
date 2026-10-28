import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  UsePipes,
  UseGuards,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { ProfilesService } from './profiles.service.js';
import { InstitutionCmsService } from './institution-cms.service.js';
import {
  jobSeekerProfileSchema,
  businessProfileSchema,
  institutionProfileSchema,
  institutionCmsSchema,
  createInstitutionInquirySchema,
  updateInquiryStatusSchema,
  JobSeekerProfileInput,
  BusinessProfileInput,
  InstitutionProfileInput,
  InstitutionCmsInput,
  CreateInstitutionInquiryInput,
  UpdateInquiryStatusInput,
} from '@indian-job-portal/validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator.js';

@Controller('profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(ZodValidationPipe)
export class ProfilesController {
  constructor(
    @Inject(ProfilesService) private readonly profilesService: ProfilesService,
    @Inject(InstitutionCmsService) private readonly institutionCmsService: InstitutionCmsService,
  ) {}

  // Job Seeker Endpoints (JS-01, JS-02, JS-05, JS-07)
  @Get('seeker/me')
  async getSeekerProfileMe(@CurrentUser() user: AuthUser) {
    return this.profilesService.getSeekerProfileMe(user.id);
  }

  @Put('seeker/me')
  async updateSeekerProfileMe(
    @CurrentUser() user: AuthUser,
    @Body() body: JobSeekerProfileInput,
  ) {
    // Pipe validates schema + DPDP consent rule
    const validated = jobSeekerProfileSchema.parse(body);
    return this.profilesService.updateSeekerProfileMe(user.id, validated);
  }

  // Employer / Public viewing candidate profile (Hard Invariant 1: Phone/Email stripped)
  @Public()
  @Get('seeker/:id')
  async getSeekerProfilePublic(@Param('id') id: string) {
    return this.profilesService.getSeekerProfilePublic(id);
  }

  // Business Profile Endpoints (EMP-01, EMP-02, EMP-03)
  @Get('business/me')
  async getBusinessProfileMe(@CurrentUser() user: AuthUser) {
    return this.profilesService.getBusinessProfileMe(user.id);
  }

  @Put('business/me')
  async updateBusinessProfileMe(
    @CurrentUser() user: AuthUser,
    @Body() body: BusinessProfileInput,
  ) {
    const validated = businessProfileSchema.parse(body);
    return this.profilesService.updateBusinessProfileMe(user.id, validated);
  }

  @Public()
  @Get('business/:id')
  async getBusinessProfilePublic(@Param('id') id: string) {
    return this.profilesService.getBusinessProfilePublic(id);
  }

  // QR Code Generation for Company Profile Page (EMP-03)
  @Public()
  @Get('business/:id/qr')
  async getBusinessQr(@Param('id') id: string) {
    return this.profilesService.generateBusinessQr(id);
  }

  // Institution Profile Endpoints (INT-01)
  @Roles('institution', 'intermediary', 'admin')
  @Get('institution/students')
  async getInstitutionStudents(@CurrentUser() user: AuthUser) {
    return this.profilesService.getInstitutionStudents(user.id);
  }

  @Get('institution/me')
  async getInstitutionProfileMe(@CurrentUser() user: AuthUser) {
    return this.profilesService.getInstitutionProfileMe(user.id);
  }

  @Put('institution/me')
  async updateInstitutionProfileMe(
    @CurrentUser() user: AuthUser,
    @Body() body: InstitutionProfileInput,
  ) {
    const validated = institutionProfileSchema.parse(body);
    return this.profilesService.updateInstitutionProfileMe(user.id, validated);
  }

  @Public()
  @Get('institution/:id')
  async getInstitutionProfilePublic(@Param('id') id: string) {
    const profile = await this.profilesService.getInstitutionProfilePublic(id);
    if (!profile) {
      throw new NotFoundException('Institution profile not found');
    }
    return profile;
  }

  // Institution CMS Endpoints (INT-02, INT-03, T-18)
  @Public()
  @Get('institution/:id/cms')
  async getInstitutionCms(@Param('id') id: string) {
    return this.institutionCmsService.getCmsData(id);
  }

  @Put('institution/cms')
  async updateInstitutionCms(
    @CurrentUser() user: AuthUser,
    @Body() body: InstitutionCmsInput,
  ) {
    const validated = institutionCmsSchema.parse(body);
    return this.institutionCmsService.updateCmsData(user.id, validated);
  }

  @Public()
  @Post('institution/inquiries')
  async submitInstitutionInquiry(@Body() body: CreateInstitutionInquiryInput) {
    const validated = createInstitutionInquirySchema.parse(body);
    return this.institutionCmsService.submitInquiry(validated);
  }

  @Get('institution/inquiries')
  async getInstitutionInquiries(@CurrentUser() user: AuthUser) {
    return this.institutionCmsService.getInstitutionInquiries(user.id);
  }

  @Put('institution/inquiries/:id/status')
  async updateInquiryStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateInquiryStatusInput,
  ) {
    const validated = updateInquiryStatusSchema.parse(body);
    return this.institutionCmsService.updateInquiryStatus(user.id, id, validated.status);
  }
}
