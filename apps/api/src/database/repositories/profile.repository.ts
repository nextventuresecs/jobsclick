import { Injectable, Inject, Optional, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { generatePublicSlug, isTestEnv, isStrictEnv } from '@indian-job-portal/validation';
import type {
  Database,
  JobSeekerProfileRow,
  BusinessProfileRow,
  InstitutionProfileRow,
  InstitutionSponsorshipRow,
} from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

@Injectable()
export class ProfileRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode = isTestEnv();

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>,
    @Optional() isTestMode?: boolean,
  ) {
    if (isTestEnv() && typeof isTestMode === 'boolean') {
      this.isTestMode = isTestMode;
    }
  }

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
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as JobSeekerProfileRow) || null;
      } catch (err) {
        if (isStrictEnv() || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
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
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as JobSeekerProfileRow) || null;
      } catch (err) {
        if (isStrictEnv() || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const profiles = this.persistentStore.getTable<JobSeekerProfileRow>('job_seeker_profiles');
    return profiles[id] || null;
  }

  async findSeekerProfileByPublicSlug(slug: string): Promise<JobSeekerProfileRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('job_seeker_profiles')
          .select('*')
          .eq('public_slug', slug)
          .maybeSingle();
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as JobSeekerProfileRow) || null;
      } catch (err) {
        if (isStrictEnv() || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const profiles = this.persistentStore.getTable<JobSeekerProfileRow>('job_seeker_profiles');
    return Object.values(profiles).find((p) => p.public_slug === slug) || null;
  }

  async saveSeekerProfile(profile: JobSeekerProfileRow): Promise<JobSeekerProfileRow> {
    if (!profile.public_slug) {
      profile.public_slug = generatePublicSlug();
    }
    this.persistentStore.setRow('job_seeker_profiles', profile.id, profile);

    try {
      const { error } = await this.supabase.from('job_seeker_profiles').upsert(profile);
      if (error && !this.isTestMode) {
        throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
      }
    } catch (err) {
      if (!this.isTestMode) throw err;
    }

    return profile;
  }

  async findStudentsByInstitution(institutionId: string): Promise<JobSeekerProfileRow[]> {
    const profiles = this.persistentStore.getTable<JobSeekerProfileRow>('job_seeker_profiles');
    const local = Object.values(profiles).filter((p) => p.institution_id === institutionId);

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('job_seeker_profiles')
          .select('*')
          .eq('institution_id', institutionId);
        if (error && !this.isTestMode) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        if (data && data.length > 0) {
          const dbRows = data as unknown as JobSeekerProfileRow[];
          const ids = new Set(local.map((p) => p.id));
          return [...local, ...dbRows.filter((r) => !ids.has(r.id))];
        }
      } catch (err) {
        if (isStrictEnv() || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    return local;
  }

  async updateStudentSponsorshipByInstitution(
    institutionIdOrName: string,
    isSponsored: boolean,
    sponsorshipId?: string,
  ): Promise<number> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(institutionIdOrName);
    const now = new Date().toISOString();
    const updatePayload: Database['public']['Tables']['job_seeker_profiles']['Update'] = {
      is_sponsored: isSponsored,
      updated_at: now,
    };
    if (sponsorshipId) {
      updatePayload.sponsorship_id = sponsorshipId;
    }

    const profiles = this.persistentStore.getTable<JobSeekerProfileRow>('job_seeker_profiles');
    let localCount = 0;
    for (const p of Object.values(profiles)) {
      if ((isUuid && p.institution_id === institutionIdOrName) || (!isUuid && p.institution === institutionIdOrName)) {
        p.is_sponsored = isSponsored;
        if (sponsorshipId) p.sponsorship_id = sponsorshipId;
        p.updated_at = now;
        this.persistentStore.setRow('job_seeker_profiles', p.id, p);
        localCount++;
      }
    }

    let query = this.supabase.from('job_seeker_profiles').update(updatePayload);
    if (isUuid) {
      query = query.eq('institution_id', institutionIdOrName);
    } else {
      query = query.eq('institution', institutionIdOrName);
    }

    const { data, error } = await query.select('id');

    if (error && !this.isTestMode) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }

    return Math.max(data?.length || 0, localCount);
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
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as BusinessProfileRow) || null;
      } catch (err) {
        if (isStrictEnv() || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
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
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as BusinessProfileRow) || null;
      } catch (err) {
        if (isStrictEnv() || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const profiles = this.persistentStore.getTable<BusinessProfileRow>('business_profiles');
    return profiles[id] || null;
  }

  async findBusinessProfileByPublicSlug(slug: string): Promise<BusinessProfileRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('business_profiles')
          .select('*')
          .eq('public_slug', slug)
          .maybeSingle();
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as BusinessProfileRow) || null;
      } catch (err) {
        if (isStrictEnv() || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const profiles = this.persistentStore.getTable<BusinessProfileRow>('business_profiles');
    return Object.values(profiles).find((p) => p.public_slug === slug) || null;
  }

  async saveBusinessProfile(profile: BusinessProfileRow): Promise<BusinessProfileRow> {
    if (!profile.public_slug) {
      profile.public_slug = generatePublicSlug();
    }
    if (this.isTestMode) {
      this.persistentStore.setRow('business_profiles', profile.id, profile);
      return profile;
    }

    const { error } = await this.supabase.from('business_profiles').upsert(profile);
    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }

    return profile;
  }

  async findBusinessProfilesByFilters(filters: {
    district?: string;
    sector?: string;
    companySize?: string;
  }): Promise<BusinessProfileRow[]> {
    if (!this.isTestMode) {
      try {
        let query = this.supabase.from('business_profiles').select('*');
        if (filters.district) query = query.ilike('district', filters.district);
        if (filters.sector) query = query.ilike('sector', filters.sector);
        if (filters.companySize) query = query.eq('company_size', filters.companySize);
        const { data, error } = await query;
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as unknown as BusinessProfileRow[]) || [];
      } catch (err) {
        if (isStrictEnv() || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const profiles = this.persistentStore.getTable<BusinessProfileRow>('business_profiles');
    return Object.values(profiles).filter((p) => {
      if (filters.district && p.district?.toLowerCase() !== filters.district.toLowerCase()) return false;
      if (filters.sector && p.sector?.toLowerCase() !== filters.sector.toLowerCase()) return false;
      if (filters.companySize && p.company_size?.toLowerCase() !== filters.companySize.toLowerCase()) return false;
      return true;
    });
  }

  async getAllBusinessProfiles(): Promise<BusinessProfileRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase.from('business_profiles').select('*');
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as unknown as BusinessProfileRow[]) || [];
      } catch (err) {
        if (isStrictEnv() || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const profiles = this.persistentStore.getTable<BusinessProfileRow>('business_profiles');
    return Object.values(profiles);
  }

  // ==========================================
  // Institution Profiles
  // ==========================================
  async findInstitutionProfileByUserId(userId: string): Promise<InstitutionProfileRow | null> {
    const profiles = this.persistentStore.getTable<InstitutionProfileRow>('institution_profiles');
    const local = Object.values(profiles).find((p) => p.user_id === userId);
    if (local) return local;

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('institution_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (error && !this.isTestMode) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        if (data) return data as InstitutionProfileRow;
      } catch (err) {
        if (isStrictEnv() || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    return null;
  }

  async findInstitutionProfileById(id: string): Promise<InstitutionProfileRow | null> {
    const profiles = this.persistentStore.getTable<InstitutionProfileRow>('institution_profiles');
    if (profiles[id]) return profiles[id];

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('institution_profiles')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error && !this.isTestMode) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        if (data) return data as InstitutionProfileRow;
      } catch (err) {
        if (isStrictEnv() || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    return null;
  }

  async findInstitutionProfileByPublicSlug(slug: string): Promise<InstitutionProfileRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('institution_profiles')
          .select('*')
          .eq('public_slug', slug)
          .maybeSingle();
        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as InstitutionProfileRow) || null;
      } catch (err) {
        if (isStrictEnv() || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }
    const profiles = this.persistentStore.getTable<InstitutionProfileRow>('institution_profiles');
    return Object.values(profiles).find((p) => p.public_slug === slug) || null;
  }

  async saveInstitutionProfile(profile: InstitutionProfileRow): Promise<InstitutionProfileRow> {
    if (!profile.public_slug) {
      profile.public_slug = generatePublicSlug();
    }
    this.persistentStore.setRow('institution_profiles', profile.id, profile);

    try {
      const { error } = await this.supabase.from('institution_profiles').upsert(profile);
      if (error && !this.isTestMode) {
        throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
      }
    } catch (err) {
      if (!this.isTestMode) throw err;
    }

    return profile;
  }

  // ==========================================
  // Concurrency & Sponsorship Persistence (WAL-05)
  // ==========================================
  async withLock<T>(institutionId: string, fn: () => Promise<T>): Promise<T> {
    return this.persistentStore.withLock(institutionId, fn);
  }

  async saveSponsorship(record: InstitutionSponsorshipRow): Promise<InstitutionSponsorshipRow> {
    const { error } = await this.supabase.from('institution_sponsorships').upsert(record);
    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }

    return record;
  }

  async findSponsorshipsByInstitutionId(institutionId: string): Promise<InstitutionSponsorshipRow[]> {
    const { data, error } = await this.supabase
      .from('institution_sponsorships')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }
    return (data as unknown as InstitutionSponsorshipRow[]) || [];
  }

  async findActiveSponsorshipByInstitutionId(institutionId: string): Promise<InstitutionSponsorshipRow | null> {
    const { data, error } = await this.supabase
      .from('institution_sponsorships')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }
    return (data as unknown as InstitutionSponsorshipRow) || null;
  }

  async findSponsorshipByIdempotencyKey(key: string): Promise<InstitutionSponsorshipRow | null> {
    const { data, error } = await this.supabase
      .from('institution_sponsorships')
      .select('*')
      .eq('idempotency_key', key)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }
    return (data as unknown as InstitutionSponsorshipRow) || null;
  }
}
