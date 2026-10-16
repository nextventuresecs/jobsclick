import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  JobSeekerProfileRow,
  BusinessProfileRow,
  InstitutionProfileRow,
} from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

@Injectable()
export class ProfileRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  // ==========================================
  // Job Seeker Profiles
  // ==========================================
  async findSeekerProfileByUserId(userId: string): Promise<JobSeekerProfileRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('job_seeker_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (!error && data) return data as JobSeekerProfileRow;
      } catch {
        // Fall back to persistent local store
      }
    }
    const profiles = this.persistentStore.getTable<JobSeekerProfileRow>('job_seeker_profiles');
    return Object.values(profiles).find((p) => p.user_id === userId) || null;
  }

  async findSeekerProfileById(id: string): Promise<JobSeekerProfileRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('job_seeker_profiles')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (!error && data) return data as JobSeekerProfileRow;
      } catch {
        // Fall back to persistent local store
      }
    }
    const profiles = this.persistentStore.getTable<JobSeekerProfileRow>('job_seeker_profiles');
    return profiles[id] || null;
  }

  async saveSeekerProfile(profile: JobSeekerProfileRow): Promise<JobSeekerProfileRow> {
    this.persistentStore.setRow('job_seeker_profiles', profile.id, profile);

    if (!this.isTestMode) {
      try {
        await this.supabase.from('job_seeker_profiles').upsert(profile as any);
      } catch {
        // Persisted locally
      }
    }

    return profile;
  }

  // ==========================================
  // Business Profiles
  // ==========================================
  async findBusinessProfileByUserId(userId: string): Promise<BusinessProfileRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('business_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (!error && data) return data as BusinessProfileRow;
      } catch {
        // Fall back to persistent local store
      }
    }
    const profiles = this.persistentStore.getTable<BusinessProfileRow>('business_profiles');
    return Object.values(profiles).find((p) => p.user_id === userId) || null;
  }

  async findBusinessProfileById(id: string): Promise<BusinessProfileRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('business_profiles')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (!error && data) return data as BusinessProfileRow;
      } catch {
        // Fall back to persistent local store
      }
    }
    const profiles = this.persistentStore.getTable<BusinessProfileRow>('business_profiles');
    return profiles[id] || null;
  }

  async saveBusinessProfile(profile: BusinessProfileRow): Promise<BusinessProfileRow> {
    this.persistentStore.setRow('business_profiles', profile.id, profile);

    if (!this.isTestMode) {
      try {
        await this.supabase.from('business_profiles').upsert(profile as any);
      } catch {
        // Persisted locally
      }
    }

    return profile;
  }

  // ==========================================
  // Institution Profiles
  // ==========================================
  async findInstitutionProfileByUserId(userId: string): Promise<InstitutionProfileRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('institution_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (!error && data) return data as InstitutionProfileRow;
      } catch {
        // Fall back to persistent local store
      }
    }
    const profiles = this.persistentStore.getTable<InstitutionProfileRow>('institution_profiles');
    return Object.values(profiles).find((p) => p.user_id === userId) || null;
  }

  async findInstitutionProfileById(id: string): Promise<InstitutionProfileRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('institution_profiles')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (!error && data) return data as InstitutionProfileRow;
      } catch {
        // Fall back to persistent local store
      }
    }
    const profiles = this.persistentStore.getTable<InstitutionProfileRow>('institution_profiles');
    return profiles[id] || null;
  }

  async saveInstitutionProfile(profile: InstitutionProfileRow): Promise<InstitutionProfileRow> {
    this.persistentStore.setRow('institution_profiles', profile.id, profile);

    if (!this.isTestMode) {
      try {
        await this.supabase.from('institution_profiles').upsert(profile as any);
      } catch {
        // Persisted locally
      }
    }

    return profile;
  }
}
