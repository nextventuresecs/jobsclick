import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, InstitutionInquiryRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

@Injectable()
export class InquiryRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async saveInquiry(inquiry: InstitutionInquiryRow): Promise<InstitutionInquiryRow> {
    this.persistentStore.setRow('institution_inquiries', inquiry.id, inquiry);

    if (!this.isTestMode) {
      try {
        await this.supabase.from('institution_inquiries').upsert(inquiry);
      } catch {
        // Persisted in local store
      }
    }

    return inquiry;
  }

  async findInquiriesByInstitutionId(institutionId: string): Promise<InstitutionInquiryRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('institution_inquiries')
          .select('*')
          .eq('institution_id', institutionId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data as unknown as InstitutionInquiryRow[];
        }
      } catch {
        // Fall back to persistent local store
      }
    }

    const table = this.persistentStore.getTable<InstitutionInquiryRow>('institution_inquiries');
    return Object.values(table)
      .filter((inq) => inq.institution_id === institutionId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async findInquiryById(id: string): Promise<InstitutionInquiryRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('institution_inquiries')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return data as unknown as InstitutionInquiryRow;
        }
      } catch {
        // Fall back to persistent local store
      }
    }

    const table = this.persistentStore.getTable<InstitutionInquiryRow>('institution_inquiries');
    return table[id] || null;
  }

  async updateInquiryStatus(
    id: string,
    status: string,
  ): Promise<InstitutionInquiryRow | null> {
    const existing = await this.findInquiryById(id);
    if (!existing) return null;

    const updated: InstitutionInquiryRow = {
      ...existing,
      status,
      updated_at: new Date().toISOString(),
    };

    return this.saveInquiry(updated);
  }
}
