export * from './rls-helper.js';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          phone: string;
          email: string | null;
          role: 'employer' | 'intermediary' | 'job_seeker' | 'admin' | 'msme_admin';
          status: 'invited' | 'active' | 'disabled';
          source: string;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      job_seeker_profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          photo_url: string | null;
          seeker_type: 'student' | 'individual';
          apaar_id: string | null;
          aadhaar_last_four: string | null;
          aadhaar_verified: boolean;
          skills: string[];
          source: string;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      business_profiles: {
        Row: {
          id: string;
          user_id: string;
          company_name: string;
          ownership_type: string;
          company_size: string;
          sector: string | null;
          city: string | null;
          district: string | null;
          logo_url: string | null;
          source: string;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      institution_profiles: {
        Row: {
          id: string;
          user_id: string;
          institution_name: string;
          affiliation: string | null;
          address: string | null;
          source: string;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      jobs: {
        Row: {
          id: string;
          employer_id: string;
          title: string;
          description: string;
          category: 'blue' | 'white' | 'grey' | 'open';
          city: string;
          openings: number;
          is_active: boolean;
          source: string;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      applications: {
        Row: {
          id: string;
          job_id: string;
          applicant_id: string;
          status: 'applied' | 'shortlisted' | 'rejected' | 'hired';
          source: string;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          meta: Record<string, unknown>;
          created_at: string;
        };
      };
    };
  };
}
