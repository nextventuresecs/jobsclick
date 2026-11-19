import {
  Body,
  Controller,
  Req,
  Post,
  UseGuards,
  BadRequestException,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { FastifyRequest } from 'fastify';
import { getClientIp } from '../common/ip-normalizer.js';
import {
  SendOtpSchema,
  VerifyOtpSchema,
  AddEmailSchema,
  SendEmailOtpSchema,
  VerifyEmailOtpSchema,
  OAuthExchangeSchema,
  LinkPhoneSchema,
  VerifyLinkPhoneSchema,
} from '@indian-job-portal/validation';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Post(['otp/send', 'send-otp'])
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() rawBody: unknown, @Req() req: FastifyRequest) {
    const clientIp = getClientIp(req);
    const parsed = SendOtpSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.sendOtp(parsed.data, clientIp);
  }

  @Public()
  @Post(['otp/verify', 'verify-otp'])
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() rawBody: unknown, @Req() req: FastifyRequest) {
    const clientIp = getClientIp(req);
    const body = (rawBody && typeof rawBody === 'object' ? { ...rawBody } : {}) as Record<string, unknown>;
    if (!body['code'] && body['otp']) {
      body['code'] = body['otp'];
      delete body['otp'];
    }
    const parsed = VerifyOtpSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.verifyOtp(parsed.data, clientIp);
  }

  @Public()
  @Post('email/send-otp')
  @HttpCode(HttpStatus.OK)
  async sendEmailOtp(@Body() rawBody: unknown, @Req() req: FastifyRequest) {
    const clientIp = getClientIp(req);
    const parsed = SendEmailOtpSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.sendEmailOtp(parsed.data, clientIp);
  }

  @Public()
  @Post('email/verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyEmailOtp(@Body() rawBody: unknown, @Req() req: FastifyRequest) {
    const clientIp = getClientIp(req);
    const parsed = VerifyEmailOtpSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.verifyEmailOtp(parsed.data, clientIp);
  }

  @Public()
  @Post('oauth/exchange')
  @HttpCode(HttpStatus.OK)
  async oauthExchange(@Body() rawBody: unknown, @Req() req: FastifyRequest) {
    const clientIp = getClientIp(req);
    const parsed = OAuthExchangeSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.oauthExchange(parsed.data, clientIp);
  }

  @Post('link-phone/send')
  @HttpCode(HttpStatus.OK)
  async linkPhoneSend(
    @CurrentUser() user: AuthenticatedUser,
    @Body() rawBody: unknown,
    @Req() req: FastifyRequest,
  ) {
    const clientIp = getClientIp(req);
    const parsed = LinkPhoneSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.linkPhoneSendOtp(user.id, parsed.data, clientIp);
  }

  @Post('link-phone/verify')
  @HttpCode(HttpStatus.OK)
  async linkPhoneVerify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() rawBody: unknown,
    @Req() req: FastifyRequest,
  ) {
    const clientIp = getClientIp(req);
    const parsed = VerifyLinkPhoneSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.linkPhoneVerifyOtp(user.id, parsed.data, clientIp);
  }

  @Post('email/add')
  @HttpCode(HttpStatus.OK)
  async addEmail(@CurrentUser() user: AuthenticatedUser, @Body() rawBody: unknown) {
    const parsed = AddEmailSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.addEmail(user.id, parsed.data);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body('token') token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is required');
    }
    return this.authService.verifyEmail({ token });
  }

  @Post('sign-out-all')
  @HttpCode(HttpStatus.OK)
  async signOutAll(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.revokeAllUserSessions(user.id);
  }
}
