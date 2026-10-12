import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { BulkModule } from './bulk/bulk.module.js';
import { AdminModule } from './admin/admin.module.js';
import { QstashModule } from './qstash/qstash.module.js';

@Module({
  imports: [
    HealthModule,
    AuthModule,
    ProfilesModule,
    JobsModule,
    BulkModule,
    AdminModule,
    QstashModule,
  ],
})
export class AppModule {}
