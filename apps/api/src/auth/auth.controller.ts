import {
  Body,
  Controller,
  Ip,
  Post,
  UseGuards,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import {
  SendOtpSchema,
  VerifyOtpSchema,
  AddEmailSchema,
} from '@indian-job-portal/validation';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Post(['otp/send', 'send-otp'])
  async sendOtp(@Body() rawBody: unknown, @Ip() clientIp: string) {
    const parsed = SendOtpSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.sendOtp(parsed.data, clientIp);
  }

  @Public()
  @Post(['otp/verify', 'verify-otp'])
  async verifyOtp(@Body() rawBody: unknown, @Ip() clientIp: string) {
    const body = (rawBody && typeof rawBody === 'object' ? { ...rawBody } : {}) as Record<string, unknown>;
    if (!body['code'] && body['otp']) {
      body['code'] = body['otp'];
    }
    const parsed = VerifyOtpSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.verifyOtp(parsed.data, clientIp);
  }

  @Post('email/add')
  async addEmail(@CurrentUser() user: AuthenticatedUser, @Body() rawBody: unknown) {
    const parsed = AddEmailSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.addEmail(user.id, parsed.data);
  }

  @Post('email/verify')
  async verifyEmail(@Body('token') token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is required');
    }
    return this.authService.verifyEmail({ token });
  }

  @Post('sign-out-all')
  async signOutAll(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.revokeAllUserSessions(user.id);
  }
}
