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
        await this.supabase.from('job_seeker_profiles').upsert(profile);
      } catch {
        // Persisted locally
      }
    }

    return profile;
  }

  async findStudentsByInstitution(institutionIdOrName: string): Promise<JobSeekerProfileRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('job_seeker_profiles')
          .select('*')
          .or(`institution_id.eq.${institutionIdOrName},institution.eq.${institutionIdOrName}`);
        if (!error && data) return data as unknown as JobSeekerProfileRow[];
      } catch {
        // Fall back to persistent local store
      }
    }
    const profiles = this.persistentStore.getTable<JobSeekerProfileRow>('job_seeker_profiles');
    return Object.values(profiles).filter(
      (p) =>
        p.institution_id === institutionIdOrName ||
        p.institution === institutionIdOrName,
    );
  }

  async updateStudentSponsorshipByInstitution(
    institutionIdOrName: string,
    isSponsored: boolean,
  ): Promise<number> {
    const students = await this.findStudentsByInstitution(institutionIdOrName);
    let count = 0;
    const now = new Date().toISOString();

    for (const student of students) {
      student.is_sponsored = isSponsored;
      student.updated_at = now;
      this.persistentStore.setRow('job_seeker_profiles', student.id, student);
      count++;
    }

    if (!this.isTestMode && students.length > 0) {
      try {
        await this.supabase
          .from('job_seeker_profiles')
          .update({ is_sponsored: isSponsored, updated_at: now })
          .or(`institution_id.eq.${institutionIdOrName},institution.eq.${institutionIdOrName}`);
      } catch {
        // Fall back
      }
    }

    return count;
  }

  async markSeekerSponsored(
    seekerUserIdOrProfileId: string,
    isSponsored: boolean,
  ): Promise<JobSeekerProfileRow | null> {
    let profile = await this.findSeekerProfileByUserId(seekerUserIdOrProfileId);
    if (!profile) {
      profile = await this.findSeekerProfileById(seekerUserIdOrProfileId);
    }
    if (!profile) return null;

    profile.is_sponsored = isSponsored;
    profile.updated_at = new Date().toISOString();
    return this.saveSeekerProfile(profile);
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
        await this.supabase.from('business_profiles').upsert(profile);
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
        await this.supabase.from('institution_profiles').upsert(profile);
      } catch {
        // Persisted locally
      }
    }

    return profile;
  }
}
