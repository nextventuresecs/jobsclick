import { Module, Global } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SmsService, Msg91SmsService } from './sms.service.js';
import { OtpRedisService } from './otp-redis.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { OtpGenerator } from './otp-generator.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { EmailModule } from '../email/email.module.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Global()
@Module({
  imports: [DatabaseModule, WalletModule, EmailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SmsService,
    Msg91SmsService,
    OtpRedisService,
    RateLimitService,
    OtpGenerator,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    SmsService,
    Msg91SmsService,
    OtpRedisService,
    RateLimitService,
    OtpGenerator,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
