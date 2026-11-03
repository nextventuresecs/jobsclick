import { Module, Global } from '@nestjs/common';
import { TEST_AUTH_GUARD } from '../src/auth/guards/jwt-auth.guard.js';
import { TestAuthGuard } from './test-auth.guard.js';

@Global()
@Module({
  providers: [
    TestAuthGuard,
    {
      provide: TEST_AUTH_GUARD,
      useClass: TestAuthGuard,
    },
  ],
  exports: [TestAuthGuard, TEST_AUTH_GUARD],
})
export class TestAuthModule {}
