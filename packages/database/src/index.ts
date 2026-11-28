export * from './rls-helper.js';
export * from './generated.types.js';
export const STARTER_CREDIT_AMOUNT = 10;

export type TableDefinition<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};

export type ViewDefinition<T> = {
  Row: T;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      users: TableDefinition<{
        id: string;
        phone: string | null;
        email: string | null;
        pending_email?: string | null;
        email_verified_at?: string | null;
        role: 'employer' | 'intermediary' | 'job_seeker' | 'admin' | 'msme_admin';
        status: 'invited' | 'active' | 'disabled';
        source: string;
        token_version: number;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      job_seeker_profiles: TableDefinition<{
        id: string;
        user_id: string;
        public_slug: string;
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
        state_code?: number | null;
        district_id?: string | null;
        qualification?: string | null;
        institution?: string | null;
        graduation_year?: string | null;
        experience_years?: number | null;
        current_role?: string | null;
        languages?: string[];
        preferred_locations?: string[];
        willing_to_relocate?: boolean;
        bio?: string | null;
        is_sponsored?: boolean;
        sponsorship_id?: string | null;
        institution_id?: string | null;
        source: string;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      business_profiles: TableDefinition<{
        id: string;
        user_id: string;
        public_slug: string;
        company_name: string;
        ownership_type: string;
        company_size: string;
        sector: string | null;
        address?: string | null;
        city: string | null;
        district: string | null;
        state?: string | null;
        pincode?: string | null;
        state_code?: number | null;
        district_id?: string | null;
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
      }>;
      institution_profiles: TableDefinition<{
        id: string;
        user_id: string;
        public_slug: string;
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
        state_code?: number | null;
        district_id?: string | null;
        trades_offered?: string[];
        annual_capacity?: number | null;
        placement_brochure_url?: string | null;
        about?: string | null;
        is_published?: boolean;
        is_sponsorship_active?: boolean;
        sponsorship_tier?: 'Small' | 'Medium' | 'Large' | string;
        sponsorship_rate_per_student?: number;
        sponsorship_expires_at?: string | null;
        total_sponsored_students?: number;
        annual_sponsorship_fee?: number;
        cms_data?: Record<string, unknown> | null;
        source: string;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      jobs: TableDefinition<{
        id: string;
        public_slug: string;
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
        state_code?: number | null;
        district_id?: string | null;
        openings: number;
        skills?: string[];
        expiry_date?: string | null;
        is_featured?: boolean;
        featured_until?: string | null;
        is_active: boolean;
        source: string;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      applications: TableDefinition<{
        id: string;
        job_id: string;
        applicant_id: string;
        status: string;
        source: string;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      audit_logs: TableDefinition<{
        id: string;
        actor_id: string | null;
        action: string;
        meta: Record<string, unknown>;
        created_at: string;
        entity_type?: string | null;
        entity_id?: string | null;
        metadata?: Record<string, unknown> | null;
      }>;
      bulk_import_batches: TableDefinition<{
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
      }>;
      invite_waves: TableDefinition<{
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
      }>;
      credit_ledgers: TableDefinition<{
        id: string;
        user_id: string;
        amount: number;
        reason: string;
        actor_id: string | null;
        created_at: string;
        payment_id?: string | null;
        ref_id?: string | null;
        expires_at?: string | null;
        source?: string | null;
      }>;
      payments: TableDefinition<{
        id: string;
        user_id: string;
        gateway_order_id: string;
        gateway_payment_id?: string | null;
        gateway_signature?: string | null;
        pack_id?: string | null;
        credits_added?: number;
        credits_to_grant?: number;
        amount_paise?: number;
        amount_inr: number;
        tax_amount_inr?: number;
        currency?: string;
        purpose?: string;
        order_snapshot?: Record<string, unknown> | null;
        billing_state_code?: string | null;
        terms_version?: string | null;
        invoice_number?: string | null;
        status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed' | 'partially_refunded' | 'expired';
        metadata?: Record<string, unknown> | null;
        payment_method?: string | null;
        settled_at?: string | null;
        processed_at?: string | null;
        processed_by?: 'razorpay_webhook' | 'client_checkout' | 'admin' | string | null;
        created_at: string;
        updated_at?: string;
      }>;
      institution_inquiries: TableDefinition<{
        id: string;
        institution_id: string;
        student_name: string;
        student_phone: string;
        student_email?: string | null;
        course_of_interest: string;
        qualification?: string | null;
        city?: string | null;
        state?: string | null;
        message?: string | null;
        status: string;
        source: string;
        created_at: string;
        updated_at: string;
      }>;
      institution_sponsorships: TableDefinition<{
        id: string;
        institution_id: string;
        payment_id?: string | null;
        tier: string;
        rate_paise?: number | null;
        rate_per_student: number;
        annual_fee: number;
        student_cap?: number | null;
        student_count: number;
        seats_used?: number;
        status: string;
        payment_reference?: string | null;
        idempotency_key?: string | null;
        started_at: string;
        expires_at: string;
        created_by?: string | null;
        created_at: string;
        updated_at: string;
      }>;
      job_alerts: TableDefinition<{
        id: string;
        user_id: string;
        title: string;
        filters: Record<string, unknown>;
        frequency: 'daily' | 'weekly';
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      alert_deliveries: TableDefinition<{
        id: string;
        alert_id: string;
        user_id: string;
        job_id: string;
        delivered_at: string;
      }>;
      corporate_tie_ups: TableDefinition<{
        id: string;
        institution_id: string;
        employer_id?: string | null;
        company_name: string;
        sector: string;
        partnership_status: string;
        preferred_trades: string[];
        active_campus_drives: number;
        total_offers_issued: number;
        contact_person: string;
        partnered_since: string;
        created_by?: string | null;
        created_at: string;
        updated_at: string;
      }>;
      privacy_erasure_requests: TableDefinition<{
        id: string;
        user_id: string;
        status: 'pending' | 'processing' | 'done' | 'failed';
        reason: string | null;
        error_code: string | null;
        requested_at: string;
        processed_at: string | null;
        updated_at: string;
      }>;
      placement_applications: TableDefinition<{
        id: string;
        tie_up_id: string;
        institution_id: string;
        student_id: string;
        job_id?: string | null;
        job_title: string;
        stage: 'applied' | 'shortlisted' | 'interview' | 'offered' | 'placed' | 'rejected';
        offer_package?: string | null;
        offer_letter_url?: string | null;
        interview_date?: string | null;
        rejection_reason?: string | null;
        created_at: string;
        updated_at: string;
      }>;
      broadcast_campaigns: TableDefinition<{
        id: string;
        created_by: string;
        dlt_template_id: string;
        target_filters: Record<string, unknown>;
        recipient_count: number;
        segment_count: number;
        estimated_cost_paise: number;
        status: string;
        confirmation_token?: string | null;
        audience_digest?: string | null;
        created_at: string;
        updated_at: string;
      }>;
      broadcast_deliveries: TableDefinition<{
        id: string;
        campaign_id: string;
        business_profile_id: string;
        phone_masked: string;
        status: string;
        gateway_message_id?: string | null;
        idempotency_key: string;
        created_at: string;
        updated_at: string;
      }>;
      invitations: TableDefinition<{
        id: string;
        batch_id?: string | null;
        phone: string;
        status: string;
        created_at: string;
      }>;
      location_nodes: TableDefinition<{
        id: string;
        entity_id: string;
        entity_type: string;
        working_area?: string | null;
        created_at: string;
      }>;
      search_logs: TableDefinition<{
        id: string;
        user_id?: string | null;
        query: string;
        created_at: string;
      }>;
      tasks: TableDefinition<{
        id: string;
        poster_id: string;
        title: string;
        pay_amount: number;
        status: string;
        created_at: string;
      }>;
      platform_settings: TableDefinition<{
        key: string;
        value: Record<string, unknown>;
      }>;
      invoices: TableDefinition<{
        id: string;
        payment_id: string;
        kind: 'invoice' | 'credit_note';
        number: string;
        fy: string;
        taxable_paise: number;
        cgst_paise: number;
        sgst_paise: number;
        igst_paise: number;
        total_paise: number;
        billing_snapshot: Record<string, unknown>;
        pdf_path?: string | null;
        emailed_at?: string | null;
        issued_at: string;
      }>;
      payment_refunds: TableDefinition<{
        id: string;
        payment_id: string;
        gateway_refund_id: string;
        amount_paise: number;
        credits_reversed: number;
        unrecovered_credits: number;
        created_at: string;
      }>;
      states: TableDefinition<{
        lgd_code: number;
        name_en: string;
        name_hi: string | null;
        is_ut: boolean;
      }>;
      districts: TableDefinition<{
        id: string;
        lgd_code: number | null;
        state_code: number;
        name_en: string;
        name_hi: string | null;
        is_active: boolean;
        source: 'lgd' | 'manual-gazette';
        effective_from: string | null;
        notes: string | null;
      }>;
      pincodes: TableDefinition<{
        pincode: string;
        state_code: number | null;
        district_id: string | null;
        ambiguous: boolean;
        candidate_district_ids: string[];
      }>;
    };
    Views: {
      public_business_profiles: ViewDefinition<{
        slug: string | null;
        company_name: string | null;
        ownership_type: string | null;
        company_size: string | null;
        sector: string | null;
        city: string | null;
        district: string | null;
        state: string | null;
        logo_url: string | null;
        website: string | null;
        year_of_registration: string | null;
        commencement_year: string | null;
        know_my_business: string | null;
        products_brief: string | null;
        services_brief: string | null;
        is_msme: boolean | null;
        is_dpiit_startup: boolean | null;
        created_at: string | null;
      }>;
      public_institution_profiles: ViewDefinition<{
        slug: string | null;
        institution_name: string | null;
        institution_type: string | null;
        affiliation: string | null;
        establishment_year: number | null;
        website: string | null;
        city: string | null;
        district: string | null;
        state: string | null;
        trades_offered: string[] | null;
        annual_capacity: number | null;
        placement_brochure_url: string | null;
        about: string | null;
        cms_data: Record<string, unknown> | null;
        created_at: string | null;
      }>;
      public_jobs: ViewDefinition<{
        slug: string | null;
        company_slug: string | null;
        title: string | null;
        description: string | null;
        category: string | null;
        employment_type: string | null;
        experience_level: string | null;
        min_pay: number | null;
        max_pay: number | null;
        city: string | null;
        district: string | null;
        state: string | null;
        openings: number | null;
        skills: string[] | null;
        expiry_date: string | null;
        is_featured: boolean | null;
        featured_until: string | null;
        created_at: string | null;
      }>;
    };
    Functions: {
      anonymise_user: {
        Args: { p_user_id: string };
        Returns: Record<string, unknown>;
      };
      get_district_employment_reports: {
        Args: Record<PropertyKey, never>;
        Returns: { district: string; onboarded_msmes: number; active_jobs: number; total_hires: number }[];
      };
      rpc_settle_payment: {
        Args: {
          p_gateway_order_id: string;
          p_gateway_payment_id: string;
          p_amount_paise: number;
          p_currency: string;
          p_method: string;
          p_event_id?: string | null;
          p_source: string;
        };
        Returns: {
          status: 'settled' | 'already_settled' | 'duplicate_event' | 'amount_mismatch' | 'unknown_order' | 'duplicate_capture' | 'precondition_failed';
          payment_id?: string;
          purpose?: string;
        };
      };
      rpc_claim_sponsorship_seats: {
        Args: {
          p_inst: string;
          p_profile_ids: string[];
        };
        Returns: number;
      };
      rpc_charge_application: {
        Args: {
          p_applicant_id: string;
          p_job_id: string;
        };
        Returns: {
          charged: boolean;
          sponsored: boolean;
          balance: number;
        };
      };
      rpc_get_balance: {
        Args: {
          p_user_id: string;
        };
        Returns: number;
      };
      grant_starter_credits: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      increment_token_version: {
        Args: { p_user_id: string };
        Returns: { id: string; token_version: number }[];
      };
      promote_job_with_ledger: {
        Args: { p_user_id: string; p_job_id: string; p_duration_days: number; p_cost: number };
        Returns: PromoteJobRpcResult;
      };
      search_jobs: {
        Args: {
          p_keyword?: string | null;
          p_city?: string | null;
          p_category?: string | null;
          p_min_pay?: number | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: SearchJobsRpcResult[];
      };
      unlock_contact_with_ledger: {
        Args: { p_employer_id: string; p_seeker_id: string; p_cost?: number };
        Returns: Record<string, unknown>;
      };
      read_public_institution_cms: {
        Args: { p_slug: string };
        Returns: Record<string, unknown>;
      };
      search_public_jobs: {
        Args: {
          p_keyword?: string | null;
          p_city?: string | null;
          p_category?: string | null;
          p_min_pay?: number | null;
          p_company?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: { jobs: Record<string, unknown>[]; total: number };
      };
    };
  };
}

export type TaskStatus = 'queued' | 'dispatched' | 'processing' | 'completed' | 'failed';

export type UserRow = Database['public']['Tables']['users']['Row'];
export type JobSeekerProfileRow = Database['public']['Tables']['job_seeker_profiles']['Row'];
export type BusinessProfileRow = Database['public']['Tables']['business_profiles']['Row'];
export type InstitutionProfileRow = Database['public']['Tables']['institution_profiles']['Row'];
export type JobRow = Database['public']['Tables']['jobs']['Row'];
export type ApplicationRow = Database['public']['Tables']['applications']['Row'];
export type AuditLogRow = Database['public']['Tables']['audit_logs']['Row'];
export type BulkImportBatchRow = Database['public']['Tables']['bulk_import_batches']['Row'];
export type InviteWaveRow = Database['public']['Tables']['invite_waves']['Row'];
export type CreditLedgerRow = Database['public']['Tables']['credit_ledgers']['Row'];
export type PaymentRow = Database['public']['Tables']['payments']['Row'];
export type InstitutionInquiryRow = Database['public']['Tables']['institution_inquiries']['Row'];
export type InstitutionSponsorshipRow = Database['public']['Tables']['institution_sponsorships']['Row'];
export type JobAlertRow = Database['public']['Tables']['job_alerts']['Row'];
export type AlertDeliveryRow = Database['public']['Tables']['alert_deliveries']['Row'];
export type CorporateTieUpRow = Database['public']['Tables']['corporate_tie_ups']['Row'];
export type PlacementApplicationRow = Database['public']['Tables']['placement_applications']['Row'];

export type BroadcastCampaignRow = Database['public']['Tables']['broadcast_campaigns']['Row'];
export type BroadcastDeliveryRow = Database['public']['Tables']['broadcast_deliveries']['Row'];
export type InvitationRow = Database['public']['Tables']['invitations']['Row'];
export type PaymentRefundRow = Database['public']['Tables']['payment_refunds']['Row'];
export type StateRow = Database['public']['Tables']['states']['Row'];
export type DistrictRow = Database['public']['Tables']['districts']['Row'];
export type PincodeRow = Database['public']['Tables']['pincodes']['Row'];
export type LocationNodeRow = Database['public']['Tables']['location_nodes']['Row'];
export type SearchLogRow = Database['public']['Tables']['search_logs']['Row'];
export type TaskRow = Database['public']['Tables']['tasks']['Row'];

export type PublicBusinessProfileRow = Database['public']['Views']['public_business_profiles']['Row'];
export type PublicInstitutionProfileRow = Database['public']['Views']['public_institution_profiles']['Row'];
export type PublicJobRow = Database['public']['Views']['public_jobs']['Row'];

export interface PromoteJobRpcResult {
  success: boolean;
  cost: number;
  remaining_balance: number;
  featured_until: string;
}

export interface SearchJobsRpcResult {
  slug: string;
  company_slug?: string | null;
  title: string;
  description: string;
  category: JobRow['category'];
  city: string;
  openings: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  employment_type?: string | null;
  experience_level?: string | null;
  min_pay?: number | null;
  max_pay?: number | null;
  district?: string | null;
  state?: string | null;
  skills?: string[] | null;
  requirements?: string[] | null;
  expiry_date?: string | null;
  is_featured?: boolean | null;
  featured_until?: string | null;
  total_count?: string | number;
  is_currently_promoted?: boolean;
  relevance_score?: number;
}
