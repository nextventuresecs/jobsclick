import {
  Body,
  Controller,

  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  SendOtpSchema,
  VerifyOtpSchema,
  AddEmailSchema,
} from '@indian-job-portal/validation';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post(['otp/send', 'send-otp'])
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() rawBody: unknown, @Ip() clientIp: string) {
    const parsed = SendOtpSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.sendOtp(parsed.data, clientIp);
  }

  @Public()
  @Post(['otp/verify', 'verify-otp'])
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() rawBody: unknown, @Ip() clientIp: string) {
    const parsed = VerifyOtpSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.verifyOtp(parsed.data, clientIp);
  }

  @Post('email/add')
  @HttpCode(HttpStatus.OK)
  async addEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() rawBody: unknown
  ) {
    const parsed = AddEmailSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    // Strictly uses verified JWT user.id — never trusts x-user-id header
    return this.authService.addEmail(user.id, parsed.data.email);
  }

  @Post('sign-out-all')
  @HttpCode(HttpStatus.OK)
  async signOutAll(@CurrentUser() user: AuthenticatedUser) {
    // Revokes all tokens issued before now for this user in Redis
    return this.authService.revokeAllUserSessions(user.id);
  }
}