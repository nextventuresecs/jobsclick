import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PlacementApplicationRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

@Injectable()
export class PlacementPipelineRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async create(app: PlacementApplicationRow): Promise<PlacementApplicationRow> {
    this.persistentStore.setRow('placement_applications', app.id, app);

    if (!this.isTestMode) {
      try {
        await this.supabase.from('placement_applications').insert({
          id: app.id,
          tie_up_id: app.tie_up_id,
          institution_id: app.institution_id,
          student_id: app.student_id,
          job_id: app.job_id ?? null,
          job_title: app.job_title,
          stage: app.stage,
          offer_package: app.offer_package ?? null,
          offer_letter_url: app.offer_letter_url ?? null,
          interview_date: app.interview_date ?? null,
          rejection_reason: app.rejection_reason ?? null,
          created_at: app.created_at,
          updated_at: app.updated_at,
        });
      } catch {
        // Maintained in local persistent store if remote DB unreachable
      }
    }

    return app;
  }

  async findById(id: string): Promise<PlacementApplicationRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('placement_applications')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (!error && data) return data as PlacementApplicationRow;
      } catch {
        // Fall back to persistent local store
      }
    }

    const table = this.persistentStore.getTable<PlacementApplicationRow>('placement_applications');
    return table[id] || null;
  }

  async findAll(): Promise<PlacementApplicationRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('placement_applications')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data && data.length > 0) return data as PlacementApplicationRow[];
      } catch {
        // Fall back to persistent local store
      }
    }

    const table = this.persistentStore.getTable<PlacementApplicationRow>('placement_applications');
    return Object.values(table);
  }

  async findByInstitutionId(institutionId: string): Promise<PlacementApplicationRow[]> {
    const all = await this.findAll();
    return all.filter((a) => a.institution_id === institutionId);
  }

  async findByStudentId(studentId: string): Promise<PlacementApplicationRow[]> {
    const all = await this.findAll();
    return all.filter((a) => a.student_id === studentId);
  }

  async findByTieUpId(tieUpId: string): Promise<PlacementApplicationRow[]> {
    const all = await this.findAll();
    return all.filter((a) => a.tie_up_id === tieUpId);
  }

  async update(id: string, updates: Partial<PlacementApplicationRow>): Promise<PlacementApplicationRow | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: PlacementApplicationRow = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    this.persistentStore.setRow('placement_applications', id, updated);

    if (!this.isTestMode) {
      try {
        await this.supabase.from('placement_applications').update(updates).eq('id', id);
      } catch {
        // Maintained in local persistent store
      }
    }

    return updated;
  }
}
