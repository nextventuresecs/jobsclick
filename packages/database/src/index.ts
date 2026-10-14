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
