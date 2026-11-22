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
import { Throttle } from '@nestjs/throttler';
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
  isUuid,
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

  // JS-03 / Hard Invariant #8a: Authenticated digital CV vector PDF download
  @Roles('job_seeker', 'admin')
  @Get('seeker/me/pdf')
  async getSeekerPdfMe(@CurrentUser() user: AuthUser) {
    return this.profilesService.getSeekerPdfDownload(user.id);
  }

  // Employer / Public viewing candidate profile (Hard Invariant 1 + ID-02: Public slug lookup only)
  // UUIDs are rejected with 404 (no redirect) to prevent confirming internal IDs.
  @Public()
  @Get('seeker/:slug')
  async getSeekerProfilePublic(@Param('slug') slug: string) {
    if (isUuid(slug)) {
      throw new NotFoundException('Job seeker profile not found');
    }
    return this.profilesService.getSeekerProfilePublic(slug);
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
  @Get('business/:slug')
  async getBusinessProfilePublic(@Param('slug') slug: string) {
    if (isUuid(slug)) {
      throw new NotFoundException('Business profile not found');
    }
    return this.profilesService.getBusinessProfilePublic(slug);
  }

  // QR Code Generation for Company Profile Page (EMP-03 / ID-02)
  @Public()
  @Get('business/:slug/qr')
  async getBusinessQr(@Param('slug') slug: string) {
    if (isUuid(slug)) {
      throw new NotFoundException('Business profile not found');
    }
    return this.profilesService.generateBusinessQr(slug);
  }

  // Institution Profile Endpoints (INT-01)
  @Roles('institution', 'intermediary', 'admin')
  @Get('institution/students')
  async getInstitutionStudents(@CurrentUser() user: AuthUser) {
    return this.profilesService.getInstitutionStudents(user.id, user.role);
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
  @Get('institution/:slug')
  async getInstitutionProfilePublic(@Param('slug') slug: string) {
    if (isUuid(slug)) {
      throw new NotFoundException('Institution profile not found');
    }
    const profile = await this.profilesService.getInstitutionProfilePublic(slug);
    if (!profile) {
      throw new NotFoundException('Institution profile not found');
    }
    return profile;
  }

  // Institution CMS Endpoints (INT-02, INT-03, T-18, ID-02)
  @Public()
  @Get('institution/:slug/cms')
  async getInstitutionCms(@Param('slug') slug: string) {
    if (isUuid(slug)) {
      throw new NotFoundException('Institution profile not found');
    }
    return this.institutionCmsService.getCmsData(slug);
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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
