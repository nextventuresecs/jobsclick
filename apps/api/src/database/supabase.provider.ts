import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import fs from 'node:fs';
import path from 'node:path';

export const SUPABASE_CLIENT = Symbol('SUPABASE_CLIENT');

export interface DatabasePersistenceState {
  users: Record<string, unknown>;
  job_seeker_profiles: Record<string, unknown>;
  business_profiles: Record<string, unknown>;
  institution_profiles: Record<string, unknown>;
  jobs: Record<string, unknown>;
  applications: Record<string, unknown>;
  audit_logs: Record<string, unknown>;
  credit_ledgers: Record<string, unknown>;
  payments: Record<string, unknown>;
}

export class PersistentDatabaseStore {
  private static instance: PersistentDatabaseStore;
  private filePath: string;
  private state: DatabasePersistenceState = {
    users: {},
    job_seeker_profiles: {},
    business_profiles: {},
    institution_profiles: {},
    jobs: {},
    applications: {},
    audit_logs: {},
    credit_ledgers: {},
    payments: {},
  };

  private constructor() {
    const dir = path.resolve(process.cwd(), '.scratch');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // ignore
      }
    }
    this.filePath = path.join(dir, 'db-persistence.json');
    this.load();
  }

  public static getInstance(): PersistentDatabaseStore {
    if (!PersistentDatabaseStore.instance) {
      PersistentDatabaseStore.instance = new PersistentDatabaseStore();
    }
    return PersistentDatabaseStore.instance;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.state = {
          users: parsed.users || {},
          job_seeker_profiles: parsed.job_seeker_profiles || {},
          business_profiles: parsed.business_profiles || {},
          institution_profiles: parsed.institution_profiles || {},
          jobs: parsed.jobs || {},
          applications: parsed.applications || {},
          audit_logs: parsed.audit_logs || {},
          credit_ledgers: parsed.credit_ledgers || {},
          payments: parsed.payments || {},
        };
      }
    } catch {
      // ignore parse errors and start fresh
    }
  }

  public save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch {
      // ignore write errors in restricted environments
    }
  }

  public getTable<T = unknown>(table: keyof DatabasePersistenceState): Record<string, T> {
    return this.state[table] as Record<string, T>;
  }

  public setRow<T = unknown>(table: keyof DatabasePersistenceState, id: string, row: T): void {
    (this.state[table] as Record<string, T>)[id] = row;
    this.save();
  }

  public deleteRow(table: keyof DatabasePersistenceState, id: string): void {
    delete this.state[table][id];
    this.save();
  }
}

export function createSupabaseClient(): SupabaseClient<Database> {
  const url = process.env['SUPABASE_URL'] || 'http://localhost:54321';
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] || 'dummy-service-role-key';

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
