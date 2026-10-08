import { Controller, Post, Body, Req, Headers, UsePipes, Inject } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import {
  SendOtpInput,
  VerifyOtpInput,
  AddEmailInput,
  VerifyEmailInput,
} from '@indian-job-portal/validation';

@Controller('auth')
@UsePipes(ZodValidationPipe)
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('send-otp')
  async sendOtp(@Body() body: SendOtpInput, @Req() req: FastifyRequest) {
    return this.authService.sendOtp(body, req.ip);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: VerifyOtpInput) {
    return this.authService.verifyOtp(body);
  }

  @Post('email/add')
  async addEmail(@Headers('x-user-id') userId: string, @Body() body: AddEmailInput) {
    return this.authService.addEmail(userId || 'usr_9876543210', body);
  }

  @Post('email/verify')
  async verifyEmail(@Body() body: VerifyEmailInput) {
    return this.authService.verifyEmail(body);
  }

  @Post('sign-out-all')
  async signOutAll(@Headers('x-user-id') userId: string) {
    return this.authService.signOutAll(userId || 'usr_9876543210');
  }
}
