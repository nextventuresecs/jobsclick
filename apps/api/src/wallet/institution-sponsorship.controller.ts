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

@Controller('institutions')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(ZodValidationPipe)
export class InstitutionSponsorshipController {
  constructor(
    @Inject(SponsorshipService)
    private readonly sponsorshipService: SponsorshipService,
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
   */
  @Roles('institution', 'intermediary', 'admin')
  @Post(':id/sponsorship/activate')
  async activateSponsorship(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ActivateSponsorshipInput,
  ) {
    const validated = activateSponsorshipSchema.parse(body || {});
    return this.sponsorshipService.activateSponsorship(id, validated, user?.id);
  }
}
