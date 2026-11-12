import { Module, Global } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import {
  SUPABASE_CLIENT,
  USER_SCOPED_SUPABASE_FACTORY,
  createSupabaseClient,
  createUserScopedSupabaseClient,
} from './supabase.provider.js';
import { UserRepository, USER_REPOSITORY } from './repositories/user.repository.js';
import { InMemoryUserRepository } from './repositories/in-memory-user.repository.js';
import { JobRepository } from './repositories/job.repository.js';
import { ProfileRepository } from './repositories/profile.repository.js';
import { ApplicationRepository } from './repositories/application.repository.js';
import { AuditLogRepository } from './repositories/audit-log.repository.js';
import { CreditLedgerRepository } from './repositories/credit-ledger.repository.js';
import { PaymentRepository } from './repositories/payment.repository.js';
import { CorporateTieUpRepository } from './repositories/corporate-tie-up.repository.js';
import { PlacementPipelineRepository } from './repositories/placement-pipeline.repository.js';
import { InquiryRepository } from './repositories/inquiry.repository.js';
import { isStrictEnv } from '../config/env.js';

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      useFactory: () => createSupabaseClient(),
    },
    {
      provide: USER_SCOPED_SUPABASE_FACTORY,
      useValue: (jwt?: string) => createUserScopedSupabaseClient(jwt),
    },
    {
      provide: USER_REPOSITORY,
      useFactory: (supabase: SupabaseClient<Database>) => {
        if (!isStrictEnv() && process.env['USE_JSON_STORE'] === '1') {
          return new InMemoryUserRepository();
        }
        return new UserRepository(supabase);
      },
      inject: [SUPABASE_CLIENT],
    },
    {
      provide: UserRepository,
      useExisting: USER_REPOSITORY,
    },
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
    USER_SCOPED_SUPABASE_FACTORY,
    USER_REPOSITORY,
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
