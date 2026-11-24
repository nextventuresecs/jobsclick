import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { BulkModule } from './bulk/bulk.module.js';
import { AdminModule } from './admin/admin.module.js';
import { QstashModule } from './qstash/qstash.module.js';
import { QueueModule } from './queue/queue.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { PlacementModule } from './placement/placement.module.js';
import { EmailModule } from './email/email.module.js';
import { FeatureFlagGuard } from './auth/guards/feature-flag.guard.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
      },
    ]),
    DatabaseModule,
    HealthModule,
    AuthModule,
    EmailModule,
    ProfilesModule,
    JobsModule,
    BulkModule,
    AdminModule,
    QstashModule,
    QueueModule,
    WalletModule,
    PlacementModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: FeatureFlagGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
