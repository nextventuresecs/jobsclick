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
          gender?: string | null;
          dob?: string | null;
          apaar_id: string | null;
          aadhaar_last_four: string | null;
          aadhaar_verified: boolean;
          dpdp_consent_given?: boolean;
          skills: string[];
          preferred_categories?: string[];
          city?: string | null;
          district?: string | null;
          state?: string | null;
          pincode?: string | null;
          qualification?: string | null;
          institution?: string | null;
          graduation_year?: string | null;
          experience_years?: number | null;
          current_role?: string | null;
          languages?: string[];
          preferred_locations?: string[];
          willing_to_relocate?: boolean;
          bio?: string | null;
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
          address?: string | null;
          city: string | null;
          district: string | null;
          state?: string | null;
          logo_url: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          year_of_registration?: string | null;
          commencement_year?: string | null;
          founder_or_director?: string | null;
          director_photo_url?: string | null;
          designation?: string | null;
          know_my_business?: string | null;
          products_brief?: string | null;
          services_brief?: string | null;
          social_media?: Record<string, unknown> | null;
          is_msme?: boolean;
          udyam_number?: string | null;
          is_dpiit_startup?: boolean;
          dpiit_number?: string | null;
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
          institution_type?: string;
          affiliation: string | null;
          affiliation_code?: string | null;
          establishment_year?: number | null;
          principal_name?: string | null;
          contact_person?: string | null;
          contact_designation?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          website?: string | null;
          address: string | null;
          city?: string | null;
          district?: string | null;
          state?: string | null;
          pincode?: string | null;
          trades_offered?: string[];
          annual_capacity?: number | null;
          placement_brochure_url?: string | null;
          about?: string | null;
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
          category: string;
          employment_type?: string;
          experience_level?: string;
          min_pay?: number;
          max_pay?: number;
          city: string;
          district?: string;
          state?: string;
          openings: number;
          skills?: string[];
          expiry_date?: string | null;
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
          status: string;
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
      bulk_import_batches: {
        Row: {
          id: string;
          source: string;
          entity_type: 'student' | 'employer';
          total_rows: number;
          processed_rows: number;
          valid_rows: number;
          error_rows: number;
          status: TaskStatus;
          csv_storage_path: string | null;
          error_csv_storage_path: string | null;
          qstash_message_id: string | null;
          failure_reason: string | null;
          retry_count: number;
          created_by: string | null;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
      };
      invite_waves: {
        Row: {
          id: string;
          batch_id: string;
          wave_size: number;
          cost_per_sms_inr: number;
          total_cost_inr: number;
          status: TaskStatus;
          sent_count: number;
          failed_count: number;
          qstash_message_id: string | null;
          failure_reason: string | null;
          created_by: string | null;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
      };
    };
  };
}

export type TaskStatus = 'queued' | 'dispatched' | 'processing' | 'completed' | 'failed';
