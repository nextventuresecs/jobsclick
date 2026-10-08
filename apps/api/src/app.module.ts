import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';

@Module({
  imports: [HealthModule, AuthModule, ProfilesModule],
})
export class AppModule {}
