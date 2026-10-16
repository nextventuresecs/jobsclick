import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, JobRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

export interface JobFilterParams {
  keyword?: string;
  city?: string;
  category?: string;
  minPay?: number;
  limit?: number;
  offset?: number;
}

@Injectable()
export class JobRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async create(job: JobRow): Promise<JobRow> {
    this.persistentStore.setRow('jobs', job.id, job);

    if (!this.isTestMode) {
      try {
        await this.supabase.from('jobs').insert(job as any);
      } catch {
        // Persisted locally
      }
    }

    return job;
  }

  async findById(id: string): Promise<JobRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase.from('jobs').select('*').eq('id', id).maybeSingle();
        if (!error && data) return data as JobRow;
      } catch {
        // Fall back to persistent local store
      }
    }
    const jobs = this.persistentStore.getTable<JobRow>('jobs');
    return jobs[id] || null;
  }

  async findMany(filters: JobFilterParams): Promise<{ jobs: JobRow[]; total: number }> {
    if (!this.isTestMode) {
      try {
        let query = this.supabase.from('jobs').select('*', { count: 'exact' }).eq('is_active', true);
        if (filters.city) {
          query = query.ilike('city', filters.city);
        }
        if (filters.category) {
          query = query.eq('category', filters.category);
        }
        if (filters.minPay !== undefined) {
          query = query.gte('max_pay', filters.minPay);
        }
        if (filters.keyword) {
          query = query.or(`title.ilike.%${filters.keyword}%,description.ilike.%${filters.keyword}%`);
        }
        const offset = filters.offset ?? 0;
        const limit = filters.limit ?? 20;
        query = query.range(offset, offset + limit - 1);

        const { data, count, error } = await query;
        if (!error && data) {
          return { jobs: data as JobRow[], total: count ?? data.length };
        }
      } catch {
        // Fall back to persistent local store
      }
    }

    const jobsMap = this.persistentStore.getTable<JobRow>('jobs');
    let list = Object.values(jobsMap).filter((j) => j.is_active);

    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(kw) ||
          j.description.toLowerCase().includes(kw) ||
          (j.skills && j.skills.some((s) => s.toLowerCase().includes(kw))),
      );
    }

    if (filters.city) {
      list = list.filter((j) => j.city.toLowerCase() === filters.city!.toLowerCase());
    }

    if (filters.category) {
      list = list.filter((j) => j.category === filters.category);
    }

    if (filters.minPay !== undefined) {
      list = list.filter((j) => (j.max_pay ?? 0) >= filters.minPay!);
    }

    const total = list.length;
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 20;
    const paginated = list.slice(offset, offset + limit);

    return { jobs: paginated, total };
  }

  async update(id: string, updates: Partial<JobRow>): Promise<JobRow | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: JobRow = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    this.persistentStore.setRow('jobs', id, updated);

    if (!this.isTestMode) {
      try {
        await (this.supabase.from('jobs') as any).update(updates).eq('id', id);
      } catch {
        // Persisted locally
      }
    }

    return updated;
  }

  async softDelete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;

    await this.update(id, { is_active: false });
    return true;
  }
}
