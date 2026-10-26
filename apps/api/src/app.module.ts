import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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

@Module({
  imports: [
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
      useClass: FeatureFlagGuard,
    },
  ],
})
export class AppModule {}
