import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, CorporateTieUpRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

@Injectable()
export class CorporateTieUpRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] !== 'production' &&
    (process.env['NODE_ENV'] === 'test' ||
      !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
      process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key');

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async create(tieUp: CorporateTieUpRow): Promise<CorporateTieUpRow> {
    if (this.isTestMode) {
      this.persistentStore.setRow('corporate_tie_ups', tieUp.id, tieUp);
      return tieUp;
    }

    const { error } = await this.supabase.from('corporate_tie_ups').insert({
      id: tieUp.id,
      institution_id: tieUp.institution_id,
      employer_id: tieUp.employer_id ?? null,
      company_name: tieUp.company_name,
      sector: tieUp.sector,
      partnership_status: tieUp.partnership_status,
      preferred_trades: tieUp.preferred_trades,
      active_campus_drives: tieUp.active_campus_drives,
      total_offers_issued: tieUp.total_offers_issued,
      contact_person: tieUp.contact_person,
      partnered_since: tieUp.partnered_since,
      created_by: tieUp.created_by ?? null,
      created_at: tieUp.created_at,
      updated_at: tieUp.updated_at,
    });

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }

    return tieUp;
  }

  async findById(id: string): Promise<CorporateTieUpRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('corporate_tie_ups')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as CorporateTieUpRow) || null;
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }

    const table = this.persistentStore.getTable<CorporateTieUpRow>('corporate_tie_ups');
    return table[id] || null;
  }

  async findAll(): Promise<CorporateTieUpRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('corporate_tie_ups')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as CorporateTieUpRow[]) || [];
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }

    const table = this.persistentStore.getTable<CorporateTieUpRow>('corporate_tie_ups');
    return Object.values(table);
  }

  async findByInstitutionId(institutionId: string): Promise<CorporateTieUpRow[]> {
    const all = await this.findAll();
    return all.filter((t) => t.institution_id === institutionId);
  }

  async findByEmployerId(employerId: string): Promise<CorporateTieUpRow[]> {
    const all = await this.findAll();
    return all.filter((t) => t.employer_id === employerId);
  }

  async update(id: string, updates: Partial<CorporateTieUpRow>): Promise<CorporateTieUpRow | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: CorporateTieUpRow = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (this.isTestMode) {
      this.persistentStore.setRow('corporate_tie_ups', id, updated);
      return updated;
    }

    const { error } = await this.supabase.from('corporate_tie_ups').update(updates).eq('id', id);
    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }

    return updated;
  }
}
