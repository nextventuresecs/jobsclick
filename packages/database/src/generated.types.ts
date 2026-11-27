export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      alert_deliveries: {
        Row: {
          alert_id: string
          delivered_at: string
          id: string
          job_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          alert_id: string
          delivered_at?: string
          id?: string
          job_id: string
          user_id: string
        }
        Update: {
          alert_id?: string
          delivered_at?: string
          id?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_deliveries_alert_id_fkey"
            columns: ["alert_id"]
            referencedRelation: "job_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_deliveries_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_deliveries_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applicant_id: string
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          source: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          applicant_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          source?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          applicant_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          source?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_applicant_id_fkey"
            columns: ["applicant_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          meta: Json | null
          metadata: Json | null
        }
        ComputedFields: never
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          meta?: Json | null
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          meta?: Json | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_campaigns: {
        Row: {
          audience_digest: string | null
          confirmation_token: string | null
          created_at: string
          created_by: string
          dlt_template_id: string
          estimated_cost_paise: number
          id: string
          recipient_count: number
          segment_count: number
          status: string
          target_filters: NonNullable<Json>
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          audience_digest?: string | null
          confirmation_token?: string | null
          created_at?: string
          created_by: string
          dlt_template_id: string
          estimated_cost_paise: number
          id?: string
          recipient_count: number
          segment_count?: number
          status?: string
          target_filters?: NonNullable<Json>
          updated_at?: string
        }
        Update: {
          audience_digest?: string | null
          confirmation_token?: string | null
          created_at?: string
          created_by?: string
          dlt_template_id?: string
          estimated_cost_paise?: number
          id?: string
          recipient_count?: number
          segment_count?: number
          status?: string
          target_filters?: NonNullable<Json>
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_campaigns_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_deliveries: {
        Row: {
          business_profile_id: string
          campaign_id: string
          created_at: string
          gateway_message_id: string | null
          id: string
          idempotency_key: string
          phone_masked: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          business_profile_id: string
          campaign_id: string
          created_at?: string
          gateway_message_id?: string | null
          id?: string
          idempotency_key: string
          phone_masked: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_profile_id?: string
          campaign_id?: string
          created_at?: string
          gateway_message_id?: string | null
          id?: string
          idempotency_key?: string
          phone_masked?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_deliveries_business_profile_id_fkey"
            columns: ["business_profile_id"]
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            referencedRelation: "broadcast_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          csv_storage_path: string | null
          entity_type: string
          error_csv_storage_path: string | null
          error_rows: number
          failure_reason: string | null
          id: string
          institution_id: string | null
          processed_rows: number
          qstash_message_id: string | null
          retry_count: number
          source: string
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          total_rows: number
          valid_rows: number
        }
        ComputedFields: never
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          csv_storage_path?: string | null
          entity_type?: string
          error_csv_storage_path?: string | null
          error_rows?: number
          failure_reason?: string | null
          id?: string
          institution_id?: string | null
          processed_rows?: number
          qstash_message_id?: string | null
          retry_count?: number
          source: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          total_rows?: number
          valid_rows?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          csv_storage_path?: string | null
          entity_type?: string
          error_csv_storage_path?: string | null
          error_rows?: number
          failure_reason?: string | null
          id?: string
          institution_id?: string | null
          processed_rows?: number
          qstash_message_id?: string | null
          retry_count?: number
          source?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          total_rows?: number
          valid_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "bulk_import_batches_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_batches_institution_id_fkey"
            columns: ["institution_id"]
            referencedRelation: "institution_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_batches_institution_id_fkey"
            columns: ["institution_id"]
            referencedRelation: "public_institution_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          address: string | null
          city: string | null
          commencement_year: string | null
          company_name: string
          company_size: string
          created_at: string
          created_by: string | null
          designation: string | null
          director_photo_url: string | null
          district: string | null
          dpiit_number: string | null
          email: string | null
          founder_or_director: string | null
          id: string
          is_dpiit_startup: boolean | null
          is_msme: boolean | null
          know_my_business: string | null
          logo_url: string | null
          ownership_type: string
          phone: string | null
          products_brief: string | null
          public_slug: string
          sector: string | null
          services_brief: string | null
          social_media: Json | null
          source: string | null
          state: string | null
          udyam_number: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
          website: string | null
          year_of_registration: string | null
        }
        ComputedFields: never
        Insert: {
          address?: string | null
          city?: string | null
          commencement_year?: string | null
          company_name: string
          company_size: string
          created_at?: string
          created_by?: string | null
          designation?: string | null
          director_photo_url?: string | null
          district?: string | null
          dpiit_number?: string | null
          email?: string | null
          founder_or_director?: string | null
          id?: string
          is_dpiit_startup?: boolean | null
          is_msme?: boolean | null
          know_my_business?: string | null
          logo_url?: string | null
          ownership_type: string
          phone?: string | null
          products_brief?: string | null
          public_slug?: string
          sector?: string | null
          services_brief?: string | null
          social_media?: Json | null
          source?: string | null
          state?: string | null
          udyam_number?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          website?: string | null
          year_of_registration?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          commencement_year?: string | null
          company_name?: string
          company_size?: string
          created_at?: string
          created_by?: string | null
          designation?: string | null
          director_photo_url?: string | null
          district?: string | null
          dpiit_number?: string | null
          email?: string | null
          founder_or_director?: string | null
          id?: string
          is_dpiit_startup?: boolean | null
          is_msme?: boolean | null
          know_my_business?: string | null
          logo_url?: string | null
          ownership_type?: string
          phone?: string | null
          products_brief?: string | null
          public_slug?: string
          sector?: string | null
          services_brief?: string | null
          social_media?: Json | null
          source?: string | null
          state?: string | null
          udyam_number?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          website?: string | null
          year_of_registration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_profiles_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_profiles_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_tie_ups: {
        Row: {
          active_campus_drives: number
          company_name: string
          contact_person: string
          created_at: string
          created_by: string | null
          employer_id: string | null
          id: string
          institution_id: string
          partnered_since: string
          partnership_status: string
          preferred_trades: string[]
          sector: string
          total_offers_issued: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          active_campus_drives?: number
          company_name: string
          contact_person: string
          created_at?: string
          created_by?: string | null
          employer_id?: string | null
          id?: string
          institution_id: string
          partnered_since?: string
          partnership_status?: string
          preferred_trades?: string[]
          sector: string
          total_offers_issued?: number
          updated_at?: string
        }
        Update: {
          active_campus_drives?: number
          company_name?: string
          contact_person?: string
          created_at?: string
          created_by?: string | null
          employer_id?: string | null
          id?: string
          institution_id?: string
          partnered_since?: string
          partnership_status?: string
          preferred_trades?: string[]
          sector?: string
          total_offers_issued?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "corporate_tie_ups_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_tie_ups_employer_id_fkey"
            columns: ["employer_id"]
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_tie_ups_institution_id_fkey"
            columns: ["institution_id"]
            referencedRelation: "institution_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_tie_ups_institution_id_fkey"
            columns: ["institution_id"]
            referencedRelation: "public_institution_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_action_costs: {
        Row: {
          action: string
          cost: number
        }
        ComputedFields: never
        Insert: {
          action: string
          cost: number
        }
        Update: {
          action?: string
          cost?: number
        }
        Relationships: []
      }
      credit_ledgers: {
        Row: {
          actor_id: string | null
          amount: number
          created_at: string
          expires_at: string | null
          id: string
          payment_id: string | null
          reason: string
          ref_id: string | null
          source: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          actor_id?: string | null
          amount: number
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_id?: string | null
          reason: string
          ref_id?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          amount?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_id?: string | null
          reason?: string
          ref_id?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledgers_payment_id_fkey"
            columns: ["payment_id"]
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledgers_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      institution_inquiries: {
        Row: {
          city: string | null
          course_of_interest: string
          created_at: string
          id: string
          institution_id: string
          message: string | null
          qualification: string | null
          source: string
          state: string | null
          status: string
          student_email: string | null
          student_name: string
          student_phone: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          city?: string | null
          course_of_interest: string
          created_at?: string
          id?: string
          institution_id: string
          message?: string | null
          qualification?: string | null
          source?: string
          state?: string | null
          status?: string
          student_email?: string | null
          student_name: string
          student_phone: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          course_of_interest?: string
          created_at?: string
          id?: string
          institution_id?: string
          message?: string | null
          qualification?: string | null
          source?: string
          state?: string | null
          status?: string
          student_email?: string | null
          student_name?: string
          student_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institution_inquiries_institution_id_fkey"
            columns: ["institution_id"]
            referencedRelation: "institution_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_inquiries_institution_id_fkey"
            columns: ["institution_id"]
            referencedRelation: "public_institution_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      institution_profiles: {
        Row: {
          about: string | null
          address: string | null
          affiliation: string | null
          affiliation_code: string | null
          annual_capacity: number | null
          annual_sponsorship_fee: number
          city: string | null
          cms_data: Json | null
          contact_designation: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          district: string | null
          establishment_year: number | null
          id: string
          institution_name: string
          institution_type: string | null
          is_published: boolean
          is_sponsorship_active: boolean
          pincode: string | null
          placement_brochure_url: string | null
          principal_name: string | null
          public_slug: string
          source: string | null
          sponsorship_expires_at: string | null
          sponsorship_rate_per_student: number | null
          sponsorship_tier: string | null
          state: string | null
          total_sponsored_students: number
          trades_offered: string[] | null
          updated_at: string
          updated_by: string | null
          user_id: string
          website: string | null
        }
        ComputedFields: never
        Insert: {
          about?: string | null
          address?: string | null
          affiliation?: string | null
          affiliation_code?: string | null
          annual_capacity?: number | null
          annual_sponsorship_fee?: number
          city?: string | null
          cms_data?: Json | null
          contact_designation?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          district?: string | null
          establishment_year?: number | null
          id?: string
          institution_name: string
          institution_type?: string | null
          is_published?: boolean
          is_sponsorship_active?: boolean
          pincode?: string | null
          placement_brochure_url?: string | null
          principal_name?: string | null
          public_slug?: string
          source?: string | null
          sponsorship_expires_at?: string | null
          sponsorship_rate_per_student?: number | null
          sponsorship_tier?: string | null
          state?: string | null
          total_sponsored_students?: number
          trades_offered?: string[] | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          about?: string | null
          address?: string | null
          affiliation?: string | null
          affiliation_code?: string | null
          annual_capacity?: number | null
          annual_sponsorship_fee?: number
          city?: string | null
          cms_data?: Json | null
          contact_designation?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          district?: string | null
          establishment_year?: number | null
          id?: string
          institution_name?: string
          institution_type?: string | null
          is_published?: boolean
          is_sponsorship_active?: boolean
          pincode?: string | null
          placement_brochure_url?: string | null
          principal_name?: string | null
          public_slug?: string
          source?: string | null
          sponsorship_expires_at?: string | null
          sponsorship_rate_per_student?: number | null
          sponsorship_tier?: string | null
          state?: string | null
          total_sponsored_students?: number
          trades_offered?: string[] | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "institution_profiles_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_profiles_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_profiles_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      institution_sponsorships: {
        Row: {
          annual_fee: number
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          idempotency_key: string | null
          institution_id: string
          payment_id: string | null
          payment_reference: string | null
          rate_paise: number | null
          rate_per_student: number
          seats_used: number
          started_at: string
          status: string
          student_cap: number | null
          student_count: number
          tier: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          annual_fee?: number
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          idempotency_key?: string | null
          institution_id: string
          payment_id?: string | null
          payment_reference?: string | null
          rate_paise?: number | null
          rate_per_student?: number
          seats_used?: number
          started_at?: string
          status?: string
          student_cap?: number | null
          student_count?: number
          tier?: string
          updated_at?: string
        }
        Update: {
          annual_fee?: number
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          institution_id?: string
          payment_id?: string | null
          payment_reference?: string | null
          rate_paise?: number | null
          rate_per_student?: number
          seats_used?: number
          started_at?: string
          status?: string
          student_cap?: number | null
          student_count?: number
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institution_sponsorships_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_sponsorships_institution_id_fkey"
            columns: ["institution_id"]
            referencedRelation: "institution_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_sponsorships_institution_id_fkey"
            columns: ["institution_id"]
            referencedRelation: "public_institution_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_sponsorships_payment_id_fkey"
            columns: ["payment_id"]
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          batch_id: string | null
          created_at: string
          email: string | null
          id: string
          phone: string | null
          status: string
        }
        ComputedFields: never
        Insert: {
          batch_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          status?: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_batch_id_fkey"
            columns: ["batch_id"]
            referencedRelation: "bulk_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_waves: {
        Row: {
          batch_id: string
          completed_at: string | null
          cost_per_sms_inr: number
          created_at: string
          created_by: string | null
          failed_count: number
          failure_reason: string | null
          id: string
          qstash_message_id: string | null
          sent_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          total_cost_inr: number
          wave_size: number
        }
        ComputedFields: never
        Insert: {
          batch_id: string
          completed_at?: string | null
          cost_per_sms_inr: number
          created_at?: string
          created_by?: string | null
          failed_count?: number
          failure_reason?: string | null
          id?: string
          qstash_message_id?: string | null
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          total_cost_inr: number
          wave_size: number
        }
        Update: {
          batch_id?: string
          completed_at?: string | null
          cost_per_sms_inr?: number
          created_at?: string
          created_by?: string | null
          failed_count?: number
          failure_reason?: string | null
          id?: string
          qstash_message_id?: string | null
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          total_cost_inr?: number
          wave_size?: number
        }
        Relationships: [
          {
            foreignKeyName: "invite_waves_batch_id_fkey"
            columns: ["batch_id"]
            referencedRelation: "bulk_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_waves_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          billing_snapshot: NonNullable<Json>
          cgst_paise: number
          emailed_at: string | null
          fy: string
          id: string
          igst_paise: number
          issued_at: string
          kind: string
          number: string
          payment_id: string
          pdf_path: string | null
          sgst_paise: number
          taxable_paise: number
          total_paise: number
        }
        ComputedFields: never
        Insert: {
          billing_snapshot: NonNullable<Json>
          cgst_paise?: number
          emailed_at?: string | null
          fy: string
          id?: string
          igst_paise?: number
          issued_at?: string
          kind: string
          number: string
          payment_id: string
          pdf_path?: string | null
          sgst_paise?: number
          taxable_paise: number
          total_paise: number
        }
        Update: {
          billing_snapshot?: NonNullable<Json>
          cgst_paise?: number
          emailed_at?: string | null
          fy?: string
          id?: string
          igst_paise?: number
          issued_at?: string
          kind?: string
          number?: string
          payment_id?: string
          pdf_path?: string | null
          sgst_paise?: number
          taxable_paise?: number
          total_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      job_alerts: {
        Row: {
          created_at: string
          filters: NonNullable<Json>
          frequency: string
          id: string
          is_active: boolean
          title: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          filters?: NonNullable<Json>
          frequency?: string
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: NonNullable<Json>
          frequency?: string
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_alerts_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_seeker_profiles: {
        Row: {
          aadhaar_last_four: string | null
          aadhaar_verified: boolean
          apaar_id: string | null
          bio: string | null
          city: string | null
          created_at: string
          created_by: string | null
          current_role: string | null
          district: string | null
          dob: string | null
          dpdp_consent_given: boolean | null
          experience_years: number | null
          full_name: string
          gender: string | null
          graduation_year: string | null
          id: string
          institution: string | null
          institution_id: string | null
          is_sponsored: boolean
          languages: string[] | null
          photo_url: string | null
          pincode: string | null
          preferred_categories: string[] | null
          preferred_locations: string[] | null
          public_slug: string
          qualification: string | null
          seeker_type: string
          skills: string[] | null
          source: string | null
          sponsorship_id: string | null
          state: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
          willing_to_relocate: boolean | null
        }
        ComputedFields: never
        Insert: {
          aadhaar_last_four?: string | null
          aadhaar_verified?: boolean
          apaar_id?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          current_role?: string | null
          district?: string | null
          dob?: string | null
          dpdp_consent_given?: boolean | null
          experience_years?: number | null
          full_name: string
          gender?: string | null
          graduation_year?: string | null
          id?: string
          institution?: string | null
          institution_id?: string | null
          is_sponsored?: boolean
          languages?: string[] | null
          photo_url?: string | null
          pincode?: string | null
          preferred_categories?: string[] | null
          preferred_locations?: string[] | null
          public_slug?: string
          qualification?: string | null
          seeker_type?: string
          skills?: string[] | null
          source?: string | null
          sponsorship_id?: string | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          willing_to_relocate?: boolean | null
        }
        Update: {
          aadhaar_last_four?: string | null
          aadhaar_verified?: boolean
          apaar_id?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          current_role?: string | null
          district?: string | null
          dob?: string | null
          dpdp_consent_given?: boolean | null
          experience_years?: number | null
          full_name?: string
          gender?: string | null
          graduation_year?: string | null
          id?: string
          institution?: string | null
          institution_id?: string | null
          is_sponsored?: boolean
          languages?: string[] | null
          photo_url?: string | null
          pincode?: string | null
          preferred_categories?: string[] | null
          preferred_locations?: string[] | null
          public_slug?: string
          qualification?: string | null
          seeker_type?: string
          skills?: string[] | null
          source?: string | null
          sponsorship_id?: string | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          willing_to_relocate?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "job_seeker_profiles_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_seeker_profiles_institution_id_fkey"
            columns: ["institution_id"]
            referencedRelation: "institution_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_seeker_profiles_institution_id_fkey"
            columns: ["institution_id"]
            referencedRelation: "public_institution_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_seeker_profiles_sponsorship_id_fkey"
            columns: ["sponsorship_id"]
            referencedRelation: "institution_sponsorships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_seeker_profiles_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_seeker_profiles_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          category: Database["public"]["Enums"]["job_category"]
          city: string
          created_at: string
          created_by: string | null
          description: string
          district: string | null
          employer_id: string
          employment_type: string | null
          experience_level: string | null
          expiry_date: string | null
          featured_until: string | null
          fts: unknown
          id: string
          is_active: boolean
          is_featured: boolean
          max_pay: number | null
          min_pay: number | null
          openings: number
          public_slug: string
          skills: string[] | null
          source: string | null
          state: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          category?: Database["public"]["Enums"]["job_category"]
          city: string
          created_at?: string
          created_by?: string | null
          description: string
          district?: string | null
          employer_id: string
          employment_type?: string | null
          experience_level?: string | null
          expiry_date?: string | null
          featured_until?: string | null
          fts?: unknown
          id?: string
          is_active?: boolean
          is_featured?: boolean
          max_pay?: number | null
          min_pay?: number | null
          openings?: number
          public_slug?: string
          skills?: string[] | null
          source?: string | null
          state?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["job_category"]
          city?: string
          created_at?: string
          created_by?: string | null
          description?: string
          district?: string | null
          employer_id?: string
          employment_type?: string | null
          experience_level?: string | null
          expiry_date?: string | null
          featured_until?: string | null
          fts?: unknown
          id?: string
          is_active?: boolean
          is_featured?: boolean
          max_pay?: number | null
          min_pay?: number | null
          openings?: number
          public_slug?: string
          skills?: string[] | null
          source?: string | null
          state?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_employer_id_fkey"
            columns: ["employer_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      location_nodes: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          working_area: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          working_area?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          working_area?: string | null
        }
        Relationships: []
      }
      payment_refunds: {
        Row: {
          amount_paise: number
          created_at: string
          credits_reversed: number
          gateway_refund_id: string
          id: string
          payment_id: string
          unrecovered_credits: number
        }
        ComputedFields: never
        Insert: {
          amount_paise: number
          created_at?: string
          credits_reversed?: number
          gateway_refund_id: string
          id?: string
          payment_id: string
          unrecovered_credits?: number
        }
        Update: {
          amount_paise?: number
          created_at?: string
          credits_reversed?: number
          gateway_refund_id?: string
          id?: string
          payment_id?: string
          unrecovered_credits?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_payment_id_fkey"
            columns: ["payment_id"]
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_inr: number
          amount_paise: number
          billing_state_code: string | null
          created_at: string
          credits_added: number
          credits_to_grant: number
          currency: string
          gateway_order_id: string
          gateway_payment_id: string | null
          gateway_signature: string | null
          id: string
          invoice_number: string | null
          metadata: Json | null
          order_snapshot: NonNullable<Json>
          pack_id: string | null
          payment_method: string | null
          processed_at: string | null
          processed_by: string | null
          purpose: string
          refunded_at: string | null
          settled_at: string | null
          status: string
          tax_amount_inr: number
          terms_version: string | null
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          amount_inr: number
          amount_paise: number
          billing_state_code?: string | null
          created_at?: string
          credits_added?: number
          credits_to_grant?: number
          currency?: string
          gateway_order_id: string
          gateway_payment_id?: string | null
          gateway_signature?: string | null
          id?: string
          invoice_number?: string | null
          metadata?: Json | null
          order_snapshot?: NonNullable<Json>
          pack_id?: string | null
          payment_method?: string | null
          processed_at?: string | null
          processed_by?: string | null
          purpose: string
          refunded_at?: string | null
          settled_at?: string | null
          status: string
          tax_amount_inr?: number
          terms_version?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_inr?: number
          amount_paise?: number
          billing_state_code?: string | null
          created_at?: string
          credits_added?: number
          credits_to_grant?: number
          currency?: string
          gateway_order_id?: string
          gateway_payment_id?: string | null
          gateway_signature?: string | null
          id?: string
          invoice_number?: string | null
          metadata?: Json | null
          order_snapshot?: NonNullable<Json>
          pack_id?: string | null
          payment_method?: string | null
          processed_at?: string | null
          processed_by?: string | null
          purpose?: string
          refunded_at?: string | null
          settled_at?: string | null
          status?: string
          tax_amount_inr?: number
          terms_version?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      placement_applications: {
        Row: {
          created_at: string
          id: string
          institution_id: string
          interview_date: string | null
          job_id: string | null
          job_title: string
          offer_letter_url: string | null
          offer_package: string | null
          rejection_reason: string | null
          stage: string
          student_id: string
          tie_up_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          institution_id: string
          interview_date?: string | null
          job_id?: string | null
          job_title: string
          offer_letter_url?: string | null
          offer_package?: string | null
          rejection_reason?: string | null
          stage?: string
          student_id: string
          tie_up_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          institution_id?: string
          interview_date?: string | null
          job_id?: string | null
          job_title?: string
          offer_letter_url?: string | null
          offer_package?: string | null
          rejection_reason?: string | null
          stage?: string
          student_id?: string
          tie_up_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "placement_applications_institution_id_fkey"
            columns: ["institution_id"]
            referencedRelation: "institution_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placement_applications_institution_id_fkey"
            columns: ["institution_id"]
            referencedRelation: "public_institution_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placement_applications_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placement_applications_student_id_fkey"
            columns: ["student_id"]
            referencedRelation: "job_seeker_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placement_applications_tie_up_id_fkey"
            columns: ["tie_up_id"]
            referencedRelation: "corporate_tie_ups"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          value: NonNullable<Json>
        }
        ComputedFields: never
        Insert: {
          key: string
          value: NonNullable<Json>
        }
        Update: {
          key?: string
          value?: NonNullable<Json>
        }
        Relationships: []
      }
      search_logs: {
        Row: {
          created_at: string
          id: string
          query: string
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          query: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          query?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_logs_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          id: string
          pay_amount: number
          poster_id: string
          status: string
          title: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          pay_amount: number
          poster_id: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          pay_amount?: number
          poster_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_poster_id_fkey"
            columns: ["poster_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          email_verified_at: string | null
          id: string
          pending_email: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          source: string | null
          status: Database["public"]["Enums"]["user_status"]
          token_version: number
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_verified_at?: string | null
          id?: string
          pending_email?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          source?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          token_version?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_verified_at?: string | null
          id?: string
          pending_email?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          source?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          token_version?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_business_profiles: {
        Row: {
          city: string | null
          commencement_year: string | null
          company_name: string | null
          company_size: string | null
          created_at: string | null
          district: string | null
          is_dpiit_startup: boolean | null
          is_msme: boolean | null
          know_my_business: string | null
          logo_url: string | null
          ownership_type: string | null
          products_brief: string | null
          sector: string | null
          services_brief: string | null
          slug: string | null
          state: string | null
          website: string | null
          year_of_registration: string | null
        }
        ComputedFields: never
        Insert: {
          city?: string | null
          commencement_year?: string | null
          company_name?: string | null
          company_size?: string | null
          created_at?: string | null
          district?: string | null
          is_dpiit_startup?: boolean | null
          is_msme?: boolean | null
          know_my_business?: string | null
          logo_url?: string | null
          ownership_type?: string | null
          products_brief?: string | null
          sector?: string | null
          services_brief?: string | null
          slug?: string | null
          state?: string | null
          website?: string | null
          year_of_registration?: string | null
        }
        Update: {
          city?: string | null
          commencement_year?: string | null
          company_name?: string | null
          company_size?: string | null
          created_at?: string | null
          district?: string | null
          is_dpiit_startup?: boolean | null
          is_msme?: boolean | null
          know_my_business?: string | null
          logo_url?: string | null
          ownership_type?: string | null
          products_brief?: string | null
          sector?: string | null
          services_brief?: string | null
          slug?: string | null
          state?: string | null
          website?: string | null
          year_of_registration?: string | null
        }
        Relationships: []
      }
      public_institution_profiles: {
        Row: {
          about: string | null
          affiliation: string | null
          annual_capacity: number | null
          city: string | null
          created_at: string | null
          district: string | null
          establishment_year: number | null
          id: string | null
          institution_name: string | null
          institution_type: string | null
          placement_brochure_url: string | null
          slug: string | null
          state: string | null
          trades_offered: string[] | null
          website: string | null
        }
        ComputedFields: never
        Relationships: []
      }
      public_jobs: {
        Row: {
          category: Database["public"]["Enums"]["job_category"] | null
          city: string | null
          company_slug: string | null
          created_at: string | null
          description: string | null
          district: string | null
          employment_type: string | null
          experience_level: string | null
          expiry_date: string | null
          featured_until: string | null
          is_featured: boolean | null
          max_pay: number | null
          min_pay: number | null
          openings: number | null
          skills: string[] | null
          slug: string | null
          state: string | null
          title: string | null
        }
        ComputedFields: never
        Relationships: []
      }
    }
    Functions: {
      anonymise_user: { Args: { p_user_id: string }; Returns: Json }
      generate_public_slug: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_district_employment_reports: {
        Args: Record<PropertyKey, never>
        Returns: {
          active_jobs: number
          district: string
          onboarded_msmes: number
          total_hires: number
        }[]
      }
      grant_starter_credits: { Args: { p_user_id: string }; Returns: boolean }
      increment_token_version: {
        Args: { p_user_id: string }
        Returns: {
          id: string
          token_version: number
        }[]
      }
      promote_job_with_ledger: {
        Args: {
          p_cost: number
          p_duration_days: number
          p_job_id: string
          p_user_id: string
        }
        Returns: Json
      }
      read_public_institution_cms: { Args: { p_slug: string }; Returns: Json }
      rpc_apply_refund: {
        Args: {
          p_event_id?: string
          p_gateway_payment_id: string
          p_gateway_refund_id: string
          p_refund_paise: number
        }
        Returns: Json
      }
      rpc_charge_application: {
        Args: { p_applicant_id: string; p_job_id: string }
        Returns: Json
      }
      rpc_check_stuck_outbox: { Args: { p_minutes?: number }; Returns: number }
      rpc_claim_outbox_batch: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          done_at: string
          id: string
          kind: string
          payment_id: string
        }[]
      }
      rpc_claim_sponsorship_seats: {
        Args: { p_inst: string; p_profile_ids: string[] }
        Returns: number
      }
      rpc_complete_outbox: {
        Args: { p_attempts: number; p_done?: boolean; p_id: string }
        Returns: undefined
      }
      rpc_get_balance: { Args: { p_user_id: string }; Returns: number }
      rpc_issue_invoice: {
        Args: { p_kind?: string; p_payment_id: string }
        Returns: Json
      }
      rpc_record_dispute: {
        Args: {
          p_amount_paise: number
          p_dispute_id: string
          p_event_id?: string
          p_gateway_payment_id: string
          p_reason?: string
        }
        Returns: Json
      }
      rpc_settle_payment: {
        Args: {
          p_amount_paise: number
          p_currency: string
          p_event_id: string
          p_gateway_order_id: string
          p_gateway_payment_id: string
          p_method: string
          p_source: string
        }
        Returns: Json
      }
      search_jobs: {
        Args: {
          p_category?: string
          p_city?: string
          p_keyword?: string
          p_limit?: number
          p_min_pay?: number
          p_offset?: number
        }
        Returns: {
          category: Database["public"]["Enums"]["job_category"]
          city: string
          company_slug: string
          created_at: string
          description: string
          district: string
          employment_type: string
          experience_level: string
          expiry_date: string
          featured_until: string
          is_active: boolean
          is_featured: boolean
          max_pay: number
          min_pay: number
          openings: number
          skills: string[]
          slug: string
          state: string
          title: string
          total_count: number
          updated_at: string
        }[]
      }
      search_public_jobs: {
        Args: {
          p_category?: string
          p_city?: string
          p_company?: string
          p_keyword?: string
          p_limit?: number
          p_min_pay?: number
          p_offset?: number
        }
        Returns: Json
      }
      unlock_contact_with_ledger: {
        Args: { p_cost?: number; p_employer_id: string; p_seeker_id: string }
        Returns: Json
      }
    }
    Enums: {
      application_status:
        | "applied"
        | "shortlisted"
        | "rejected"
        | "hired"
        | "under_review"
        | "interview_scheduled"
        | "selected"
      job_category:
        | "blue"
        | "white"
        | "grey"
        | "open"
        | "technology"
        | "manufacturing"
        | "sales_operations"
        | "logistics_supply"
        | "creative_services"
        | "healthcare_services"
      task_status:
        | "queued"
        | "dispatched"
        | "processing"
        | "completed"
        | "failed"
      user_role:
        | "employer"
        | "intermediary"
        | "job_seeker"
        | "admin"
        | "msme_admin"
      user_status: "invited" | "active" | "disabled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      application_status: [
        "applied",
        "shortlisted",
        "rejected",
        "hired",
        "under_review",
        "interview_scheduled",
        "selected",
      ],
      job_category: [
        "blue",
        "white",
        "grey",
        "open",
        "technology",
        "manufacturing",
        "sales_operations",
        "logistics_supply",
        "creative_services",
        "healthcare_services",
      ],
      task_status: [
        "queued",
        "dispatched",
        "processing",
        "completed",
        "failed",
      ],
      user_role: [
        "employer",
        "intermediary",
        "job_seeker",
        "admin",
        "msme_admin",
      ],
      user_status: ["invited", "active", "disabled"],
    },
  },
} as const
