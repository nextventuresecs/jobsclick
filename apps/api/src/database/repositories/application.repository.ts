import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ApplicationRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

@Injectable()
export class ApplicationRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] !== 'production' &&
    (process.env['NODE_ENV'] === 'test' ||
      !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
      process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key');

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async create(application: ApplicationRow): Promise<ApplicationRow> {
    if (this.isTestMode) {
      this.persistentStore.setRow('applications', application.id, application);
      return application;
    }

    const { error } = await this.supabase.from('applications').insert(application);
    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
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
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as ApplicationRow) || null;
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
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
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as ApplicationRow) || null;
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
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
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as ApplicationRow[]) || [];
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const apps = this.persistentStore.getTable<ApplicationRow>('applications');
    return Object.values(apps).filter((a) => a.job_id === jobId);
  }

  async findByApplicantId(applicantId: string): Promise<ApplicationRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('applications')
          .select('*')
          .eq('applicant_id', applicantId);
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as ApplicationRow[]) || [];
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const apps = this.persistentStore.getTable<ApplicationRow>('applications');
    return Object.values(apps).filter((a) => a.applicant_id === applicantId);
  }

  async updateStatus(id: string, status: string): Promise<ApplicationRow | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: ApplicationRow = {
      ...existing,
      status,
      updated_at: new Date().toISOString(),
    };

    if (this.isTestMode) {
      this.persistentStore.setRow('applications', id, updated);
      return updated;
    }

    const { error } = await this.supabase.from('applications').update({ status, updated_at: updated.updated_at }).eq('id', id);
    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }

    return updated;
  }

  async findAll(limit = 1000): Promise<ApplicationRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('applications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as ApplicationRow[]) || [];
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const apps = this.persistentStore.getTable<ApplicationRow>('applications');
    return Object.values(apps).slice(0, limit);
  }
}
