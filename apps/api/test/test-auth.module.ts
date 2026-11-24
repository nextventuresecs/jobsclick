import { Module, Global } from '@nestjs/common';
import { TEST_AUTH_GUARD } from '../src/auth/guards/jwt-auth.guard.js';
import { TestAuthGuard } from './test-auth.guard.js';
import { TurnstileVerifier } from '../src/auth/turnstile.service.js';
import { MockTurnstileVerifier } from './mocks/mock-turnstile.verifier.js';
import { SmsGateway, SmsService, Msg91SmsService } from '../src/auth/sms.service.js';
import { MockSmsGateway } from './mocks/mock-sms.gateway.js';

@Global()
@Module({
  providers: [
    TestAuthGuard,
    {
      provide: TEST_AUTH_GUARD,
      useClass: TestAuthGuard,
    },
    {
      provide: TurnstileVerifier,
      useClass: MockTurnstileVerifier,
    },
    {
      provide: SmsGateway,
      useClass: MockSmsGateway,
    },
    {
      provide: SmsService,
      useExisting: SmsGateway,
    },
    {
      provide: Msg91SmsService,
      useExisting: SmsGateway,
    },
    MockTurnstileVerifier,
    MockSmsGateway,
  ],
  exports: [
    TestAuthGuard,
    TEST_AUTH_GUARD,
    TurnstileVerifier,
    SmsGateway,
    SmsService,
    Msg91SmsService,
    MockTurnstileVerifier,
    MockSmsGateway,
  ],
})
export class TestAuthModule {}
