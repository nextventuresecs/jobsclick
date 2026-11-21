import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  UsePipes,
  Inject,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { Throttle } from '@nestjs/throttler';
import {
  SPONSORSHIP_TIERS,
  sponsorshipQuoteInputSchema,
  createSponsorshipOrderSchema,
  activateSponsorshipSchema,
  type ActivateSponsorshipInput,
} from '@indian-job-portal/validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator.js';
import { RequireFeatureFlag } from '../auth/guards/feature-flag.guard.js';
import { assertSponsorshipOrderEnabled, SponsorshipKillSwitchGuard } from '../config/rollout.js';
import { SponsorshipService } from './sponsorship.service.js';
import { ProfileRepository } from '../database/repositories/profile.repository.js';
import {
  SponsorshipQuoteDto,
  CreateSponsorshipOrderDto,
} from './dto/wallet.dto.js';

@Controller()
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
   * Defined sponsorship pricing tiers (WAL-05, Section 10.1)
   */
  @Get([
    'institution/sponsorship/tiers',
    'institutions/sponsorship/tiers',
    'institutions/sponsorship-tiers',
  ])
  async getTiers() {
    return Object.values(SPONSORSHIP_TIERS);
  }

  /**
   * Get sponsorship quote for institution
   * POST /institution/sponsorship/quote
   */
  @Roles('intermediary', 'institution', 'admin')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @Post(['institution/sponsorship/quote', 'institutions/sponsorship/quote'])
  async getQuote(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(sponsorshipQuoteInputSchema)) body: SponsorshipQuoteDto,
  ) {
    return this.sponsorshipService.getSponsorshipQuote(user.id, body, user.role === 'admin');
  }

  /**
   * Get sponsorship quote by institution ID parameter (WAL-05)
   * GET /institutions/:id/sponsorship-quote
   */
  @Roles('intermediary', 'institution', 'admin')
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  @Get([
    'institution/:id/sponsorship-quote',
    'institutions/:id/sponsorship-quote',
    'institutions/:id/sponsorship/quote',
    'institution/:id/sponsorship/quote',
  ])
  async getQuoteByParam(
    @CurrentUser() user: AuthUser,
    @Param('id') institutionId: string,
    @Query('students') students?: string,
  ) {
    const declaredCount = students ? parseInt(students, 10) : undefined;
    try {
      return await this.sponsorshipService.getSponsorshipQuote(
        user.id,
        {
          institutionId,
          declaredStudentCount: declaredCount,
        },
        user.role === 'admin',
      );
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Caller is not authorized to access this institution',
        });
      }
      throw err;
    }
  }

  /**
   * Create Razorpay payment order for sponsorship
   * POST /institution/sponsorship/create-order
   * Rejects with 409 if active unexpired grant exists
   */
  @Roles('intermediary', 'institution', 'admin')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @Post(['institution/sponsorship/create-order', 'institutions/sponsorship/create-order'])
  @RequireFeatureFlag('ENABLE_P2_PAYMENTS')
  @UseGuards(SponsorshipKillSwitchGuard)
  async createOrder(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSponsorshipOrderSchema)) body: CreateSponsorshipOrderDto,
  ) {
    assertSponsorshipOrderEnabled();
    return this.sponsorshipService.createOrder(user.id, body);
  }

  /**
   * Get active sponsorship grant status
   * GET /institution/sponsorship
   */
  @Roles('intermediary', 'institution', 'admin')
  @Get(['institution/sponsorship', 'institutions/sponsorship'])
  async getSponsorshipStatus(
    @CurrentUser() user: AuthUser,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.sponsorshipService.getSponsorship(user.id, institutionId);
  }

  /**
   * Activate annual sponsorship for an institution (WAL-05)
   * Enrolled students become sponsored and gain unlimited applications.
   * Fast-reject ownership check (Controller-level gate)
   */
  @Roles('institution', 'intermediary', 'admin')
  @Post([':id/sponsorship/activate', 'institutions/:id/sponsorship/activate', 'institution/:id/sponsorship/activate'])
  @RequireFeatureFlag('ENABLE_P2_PAYMENTS')
  async activateSponsorship(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ActivateSponsorshipInput,
  ) {
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
    return this.sponsorshipService.activateSponsorship(id, validated, user);
  }
}
