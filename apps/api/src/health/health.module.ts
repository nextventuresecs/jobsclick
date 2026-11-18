import { ProviderLifetimePolicy } from '../auth/provider-lifetime-policy.js';
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
  providers: [ProviderLifetimePolicy],
  exports: [ProviderLifetimePolicy],
})
export class HealthModule {}
