import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  UsePipes,
  Inject,
  BadRequestException,
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
    return this.sponsorshipService.getSponsorshipQuote(user.id, body);
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
  async createOrder(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSponsorshipOrderSchema)) body: CreateSponsorshipOrderDto,
  ) {
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
   * Legacy manual sponsorship activation endpoint completely deleted.
   * Direct activation without server order is blocked.
   */
  @Roles('institution', 'intermediary', 'admin')
  @Post(['institutions/:id/sponsorship/activate', 'institution/:id/sponsorship/activate'])
  @RequireFeatureFlag('ENABLE_P2_PAYMENTS')
  async activateSponsorshipDeprecated() {
    throw new BadRequestException({
      statusCode: 400,
      code: 'MANUAL_ACTIVATION_REMOVED',
      message: 'Direct sponsorship activation is disabled; please create an order via /institution/sponsorship/create-order',
    });
  }
}
