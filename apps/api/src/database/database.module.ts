import { Module, Global } from '@nestjs/common';
import { SUPABASE_CLIENT, createSupabaseClient } from './supabase.provider.js';
import { UserRepository } from './repositories/user.repository.js';
import { JobRepository } from './repositories/job.repository.js';
import { ProfileRepository } from './repositories/profile.repository.js';
import { ApplicationRepository } from './repositories/application.repository.js';
import { AuditLogRepository } from './repositories/audit-log.repository.js';
import { CreditLedgerRepository } from './repositories/credit-ledger.repository.js';
import { PaymentRepository } from './repositories/payment.repository.js';
import { CorporateTieUpRepository } from './repositories/corporate-tie-up.repository.js';
import { PlacementPipelineRepository } from './repositories/placement-pipeline.repository.js';
import { InquiryRepository } from './repositories/inquiry.repository.js';

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      useFactory: () => createSupabaseClient(),
    },
    UserRepository,
    JobRepository,
    ProfileRepository,
    ApplicationRepository,
    AuditLogRepository,
    CreditLedgerRepository,
    PaymentRepository,
    CorporateTieUpRepository,
    PlacementPipelineRepository,
    InquiryRepository,
  ],
  exports: [
    SUPABASE_CLIENT,
    UserRepository,
    JobRepository,
    ProfileRepository,
    ApplicationRepository,
    AuditLogRepository,
    CreditLedgerRepository,
    PaymentRepository,
    CorporateTieUpRepository,
    PlacementPipelineRepository,
    InquiryRepository,
  ],
})
export class DatabaseModule {}
