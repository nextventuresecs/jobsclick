import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  UsePipes,
  Inject,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  SPONSORSHIP_TIERS,
  sponsorshipQuoteInputSchema,
  createSponsorshipOrderSchema,
} from '@indian-job-portal/validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator.js';
import { SponsorshipService } from './sponsorship.service.js';
import {
  SponsorshipQuoteDto,
  CreateSponsorshipOrderDto,
} from './dto/wallet.dto.js';

@Controller(['institution/sponsorship', 'institutions/sponsorship'])
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
  @Get('tiers')
  async getTiers() {
    return Object.values(SPONSORSHIP_TIERS);
  }

  /**
   * Get sponsorship quote for institution
   * POST /institution/sponsorship/quote
   */
  @Roles('intermediary', 'institution', 'admin')
  @Post('quote')
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
  @Post('create-order')
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
  @Get()
  async getSponsorshipStatus(
    @CurrentUser() user: AuthUser,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.sponsorshipService.getSponsorship(user.id, institutionId);
  }
}
