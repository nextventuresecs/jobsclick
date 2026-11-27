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
} from '@indian-job-portal/validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator.js';
import { RequireFeatureFlag } from '../auth/guards/feature-flag.guard.js';
import { assertSponsorshipOrderEnabled, SponsorshipKillSwitchGuard } from '../config/rollout.js';
import { SponsorshipService } from './sponsorship.service.js';
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
}
