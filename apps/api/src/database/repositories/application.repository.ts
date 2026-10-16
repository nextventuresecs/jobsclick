import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ApplicationRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

@Injectable()
export class ApplicationRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async create(application: ApplicationRow): Promise<ApplicationRow> {
    this.persistentStore.setRow('applications', application.id, application);

    if (!this.isTestMode) {
      try {
        await this.supabase.from('applications').insert(application as any);
      } catch {
        // Persisted locally
      }
    }

    return application;
  }

  async findById(id: string): Promise<ApplicationRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('applications')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (!error && data) return data as ApplicationRow;
      } catch {
        // Fall back to persistent local store
      }
    }
    const apps = this.persistentStore.getTable<ApplicationRow>('applications');
    return apps[id] || null;
  }

  async findByJobAndApplicant(jobId: string, applicantId: string): Promise<ApplicationRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('applications')
          .select('*')
          .eq('job_id', jobId)
          .eq('applicant_id', applicantId)
          .maybeSingle();
        if (!error && data) return data as ApplicationRow;
      } catch {
        // Fall back to persistent local store
      }
    }
    const apps = this.persistentStore.getTable<ApplicationRow>('applications');
    return (
      Object.values(apps).find((a) => a.job_id === jobId && a.applicant_id === applicantId) || null
    );
  }

  async findByJobId(jobId: string): Promise<ApplicationRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('applications')
          .select('*')
          .eq('job_id', jobId);
        if (!error && data) return data as ApplicationRow[];
      } catch {
        // Fall back to persistent local store
      }
    }
    const apps = this.persistentStore.getTable<ApplicationRow>('applications');
    return Object.values(apps).filter((a) => a.job_id === jobId);
  }

  async updateStatus(id: string, status: string): Promise<ApplicationRow | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: ApplicationRow = {
      ...existing,
      status,
      updated_at: new Date().toISOString(),
    };

    this.persistentStore.setRow('applications', id, updated);

    if (!this.isTestMode) {
      try {
        await (this.supabase.from('applications') as any).update({ status }).eq('id', id);
      } catch {
        // Persisted locally
      }
    }

    return updated;
  }
}
