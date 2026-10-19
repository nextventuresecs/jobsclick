import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  UsePipes,
  Inject,
  ForbiddenException,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  activateSponsorshipSchema,
  SPONSORSHIP_TIERS,
  type ActivateSponsorshipInput,
} from '@indian-job-portal/validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator.js';
import { SponsorshipService } from './sponsorship.service.js';
import { ProfileRepository } from '../database/repositories/profile.repository.js';

@Controller('institutions')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(ZodValidationPipe)
export class InstitutionSponsorshipController {
  constructor(
    @Inject(SponsorshipService)
    private readonly sponsorshipService: SponsorshipService,
    @Inject(ProfileRepository)
    private readonly profileRepository: ProfileRepository,
  ) {}

  /**
   * Get all defined pricing tiers (WAL-05, Section 10.1)
   */
  @Get('sponsorship/tiers')
  async getTiers() {
    return Object.values(SPONSORSHIP_TIERS);
  }

  /**
   * Get sponsorship quote for an institution
   * Endpoint: GET /institutions/:id/sponsorship-quote
   */
  @Get(':id/sponsorship-quote')
  async getSponsorshipQuote(
    @Param('id') id: string,
    @Query('students') students?: string,
  ) {
    const studentCountOverride = students ? parseInt(students, 10) : undefined;
    return this.sponsorshipService.getSponsorshipQuote(id, studentCountOverride);
  }

  /**
   * Activate annual sponsorship for an institution (WAL-05)
   * Enrolled students become sponsored and gain unlimited applications.
   * Fast-reject ownership check (Controller-level gate)
   */
  @Roles('institution', 'intermediary', 'admin')
  @Post(':id/sponsorship/activate')
  async activateSponsorship(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ActivateSponsorshipInput,
  ) {
    // 1. Fast reject ownership check before forwarding to service
    let inst = await this.profileRepository.findInstitutionProfileById(id);
    if (!inst) {
      inst = await this.profileRepository.findInstitutionProfileByUserId(id);
    }

    if (inst) {
      const isOwner = inst.user_id === user.id;
      const isIntermediaryAdmin =
        (user.role === 'intermediary' || (user.role as string) === 'institution') &&
        (inst.created_by === user.id || inst.user_id === user.id);
      const isPlatformAdmin = user.role === 'admin' || (user.role as string) === 'msme_admin';

      if (!(isOwner || isIntermediaryAdmin || isPlatformAdmin)) {
        throw new ForbiddenException(
          'You are not authorized to activate sponsorship for this institution',
        );
      }
    } else {
      const isSelfUser = user.id === id;
      const isIntermediary =
        user.role === 'intermediary' || (user.role as string) === 'institution';
      const isPlatformAdmin = user.role === 'admin' || (user.role as string) === 'msme_admin';

      if (!(isSelfUser || isIntermediary || isPlatformAdmin)) {
        throw new ForbiddenException(
          'You are not authorized to activate sponsorship for this institution',
        );
      }
    }

    const validated = activateSponsorshipSchema.parse(body || {});
    // Pass user to service for authoritative secondary check + transactional execution + audit logging
    return this.sponsorshipService.activateSponsorship(id, validated, user);
  }
}
