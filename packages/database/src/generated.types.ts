export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  _realtime: {
    Tables: {
      extensions: {
        Row: {
          id: string
          inserted_at: string
          settings: Json | null
          tenant_external_id: string | null
          type: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          id: string
          inserted_at: string
          settings?: Json | null
          tenant_external_id?: string | null
          type?: string | null
          updated_at: string
        }
        Update: {
          id?: string
          inserted_at?: string
          settings?: Json | null
          tenant_external_id?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extensions_tenant_external_id_fkey"
            columns: ["tenant_external_id"]
            referencedRelation: "tenants"
            referencedColumns: ["external_id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          bucket_key: string | null
          enabled: boolean
          id: string
          inserted_at: string
          name: string
          rollout_percentage: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          bucket_key?: string | null
          enabled?: boolean
          id: string
          inserted_at: string
          name: string
          rollout_percentage?: number
          updated_at: string
        }
        Update: {
          bucket_key?: string | null
          enabled?: boolean
          id?: string
          inserted_at?: string
          name?: string
          rollout_percentage?: number
          updated_at?: string
        }
        Relationships: []
      }
      schema_migrations: {
        Row: {
          inserted_at: string | null
          version: number
        }
        ComputedFields: never
        Insert: {
          inserted_at?: string | null
          version: number
        }
        Update: {
          inserted_at?: string | null
          version?: number
        }
        Relationships: []
      }
      tenants: {
        Row: {
          broadcast_adapter: string | null
          client_presence_window_ms: number | null
          external_id: string | null
          feature_flags: NonNullable<Json>
          gcm_migrated_at: string | null
          id: string
          inserted_at: string
          jwt_jwks: Json | null
          jwt_secret: string | null
          max_bytes_per_second: number
          max_channels_per_client: number
          max_client_presence_events_per_window: number | null
          max_concurrent_users: number
          max_events_per_second: number
          max_joins_per_second: number
          max_payload_size_in_kb: number | null
          max_presence_events_per_second: number | null
          migrations_ran: number | null
          name: string | null
          notify_private_alpha: boolean | null
          postgres_cdc_default: string | null
          presence_enabled: boolean
          private_only: boolean
          suspend: boolean | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          broadcast_adapter?: string | null
          client_presence_window_ms?: number | null
          external_id?: string | null
          feature_flags?: NonNullable<Json>
          gcm_migrated_at?: string | null
          id: string
          inserted_at: string
          jwt_jwks?: Json | null
          jwt_secret?: string | null
          max_bytes_per_second?: number
          max_channels_per_client?: number
          max_client_presence_events_per_window?: number | null
          max_concurrent_users?: number
          max_events_per_second?: number
          max_joins_per_second?: number
          max_payload_size_in_kb?: number | null
          max_presence_events_per_second?: number | null
          migrations_ran?: number | null
          name?: string | null
          notify_private_alpha?: boolean | null
          postgres_cdc_default?: string | null
          presence_enabled?: boolean
          private_only?: boolean
          suspend?: boolean | null
          updated_at: string
        }
        Update: {
          broadcast_adapter?: string | null
          client_presence_window_ms?: number | null
          external_id?: string | null
          feature_flags?: NonNullable<Json>
          gcm_migrated_at?: string | null
          id?: string
          inserted_at?: string
          jwt_jwks?: Json | null
          jwt_secret?: string | null
          max_bytes_per_second?: number
          max_channels_per_client?: number
          max_client_presence_events_per_window?: number | null
          max_concurrent_users?: number
          max_events_per_second?: number
          max_joins_per_second?: number
          max_payload_size_in_kb?: number | null
          max_presence_events_per_second?: number | null
          migrations_ran?: number | null
          name?: string | null
          notify_private_alpha?: boolean | null
          postgres_cdc_default?: string | null
          presence_enabled?: boolean
          private_only?: boolean
          suspend?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  auth: {
    Tables: {
      audit_log_entries: {
        Row: {
          created_at: string | null
          id: string
          instance_id: string | null
          ip_address: string
          payload: Json | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string | null
          id: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Relationships: []
      }
      custom_oauth_providers: {
        Row: {
          acceptable_client_ids: string[]
          attribute_mapping: NonNullable<Json>
          authorization_params: NonNullable<Json>
          authorization_url: string | null
          cached_discovery: Json | null
          client_id: string
          client_secret: string
          created_at: string
          custom_claims_allowlist: string[]
          discovery_cached_at: string | null
          discovery_url: string | null
          email_optional: boolean
          enabled: boolean
          id: string
          identifier: string
          issuer: string | null
          jwks_uri: string | null
          name: string
          pkce_enabled: boolean
          provider_type: string
          scopes: string[]
          skip_nonce_check: boolean
          token_url: string | null
          updated_at: string
          userinfo_url: string | null
        }
        ComputedFields: never
        Insert: {
          acceptable_client_ids?: string[]
          attribute_mapping?: NonNullable<Json>
          authorization_params?: NonNullable<Json>
          authorization_url?: string | null
          cached_discovery?: Json | null
          client_id: string
          client_secret: string
          created_at?: string
          custom_claims_allowlist?: string[]
          discovery_cached_at?: string | null
          discovery_url?: string | null
          email_optional?: boolean
          enabled?: boolean
          id?: string
          identifier: string
          issuer?: string | null
          jwks_uri?: string | null
          name: string
          pkce_enabled?: boolean
          provider_type: string
          scopes?: string[]
          skip_nonce_check?: boolean
          token_url?: string | null
          updated_at?: string
          userinfo_url?: string | null
        }
        Update: {
          acceptable_client_ids?: string[]
          attribute_mapping?: NonNullable<Json>
          authorization_params?: NonNullable<Json>
          authorization_url?: string | null
          cached_discovery?: Json | null
          client_id?: string
          client_secret?: string
          created_at?: string
          custom_claims_allowlist?: string[]
          discovery_cached_at?: string | null
          discovery_url?: string | null
          email_optional?: boolean
          enabled?: boolean
          id?: string
          identifier?: string
          issuer?: string | null
          jwks_uri?: string | null
          name?: string
          pkce_enabled?: boolean
          provider_type?: string
          scopes?: string[]
          skip_nonce_check?: boolean
          token_url?: string | null
          updated_at?: string
          userinfo_url?: string | null
        }
        Relationships: []
      }
      flow_state: {
        Row: {
          auth_code: string | null
          auth_code_issued_at: string | null
          authentication_method: string
          code_challenge: string | null
          code_challenge_method:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at: string | null
          email_optional: boolean
          id: string
          invite_token: string | null
          linking_target_id: string | null
          oauth_client_state_id: string | null
          provider_access_token: string | null
          provider_refresh_token: string | null
          provider_type: string
          referrer: string | null
          updated_at: string | null
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          auth_code?: string | null
          auth_code_issued_at?: string | null
          authentication_method: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string | null
          email_optional?: boolean
          id: string
          invite_token?: string | null
          linking_target_id?: string | null
          oauth_client_state_id?: string | null
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type: string
          referrer?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auth_code?: string | null
          auth_code_issued_at?: string | null
          authentication_method?: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string | null
          email_optional?: boolean
          id?: string
          invite_token?: string | null
          linking_target_id?: string | null
          oauth_client_state_id?: string | null
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type?: string
          referrer?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      identities: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          identity_data: NonNullable<Json>
          last_sign_in_at: string | null
          provider: string
          provider_id: string
          updated_at: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string | null
          email?: never
          id?: string
          identity_data: NonNullable<Json>
          last_sign_in_at?: string | null
          provider: string
          provider_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: never
          id?: string
          identity_data?: NonNullable<Json>
          last_sign_in_at?: string | null
          provider?: string
          provider_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identities_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          created_at: string | null
          id: string
          raw_base_config: string | null
          updated_at: string | null
          uuid: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string | null
          id: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Relationships: []
      }
      mfa_amr_claims: {
        Row: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Update: {
          authentication_method?: string
          created_at?: string
          id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfa_amr_claims_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_challenges: {
        Row: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code: string | null
          verified_at: string | null
          web_authn_session_data: Json | null
        }
        ComputedFields: never
        Insert: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code?: string | null
          verified_at?: string | null
          web_authn_session_data?: Json | null
        }
        Update: {
          created_at?: string
          factor_id?: string
          id?: string
          ip_address?: unknown
          otp_code?: string | null
          verified_at?: string | null
          web_authn_session_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_challenges_auth_factor_id_fkey"
            columns: ["factor_id"]
            referencedRelation: "mfa_factors"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_factors: {
        Row: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name: string | null
          id: string
          last_challenged_at: string | null
          last_webauthn_challenge_data: Json | null
          phone: string | null
          secret: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
          web_authn_aaguid: string | null
          web_authn_credential: Json | null
        }
        ComputedFields: never
        Insert: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id: string
          last_challenged_at?: string | null
          last_webauthn_challenge_data?: Json | null
          phone?: string | null
          secret?: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
          web_authn_aaguid?: string | null
          web_authn_credential?: Json | null
        }
        Update: {
          created_at?: string
          factor_type?: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id?: string
          last_challenged_at?: string | null
          last_webauthn_challenge_data?: Json | null
          phone?: string | null
          secret?: string | null
          status?: Database["auth"]["Enums"]["factor_status"]
          updated_at?: string
          user_id?: string
          web_authn_aaguid?: string | null
          web_authn_credential?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_factors_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_code_sets: {
        Row: {
          created_at: string
          failed_verification_count: number
          id: string
          mfa_factor_id: string
          updated_at: string
          user_id: string
          verification_locked_until: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          failed_verification_count?: number
          id: string
          mfa_factor_id: string
          updated_at?: string
          user_id: string
          verification_locked_until?: string | null
        }
        Update: {
          created_at?: string
          failed_verification_count?: number
          id?: string
          mfa_factor_id?: string
          updated_at?: string
          user_id?: string
          verification_locked_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_recovery_code_sets_mfa_factor_id_fkey"
            columns: ["mfa_factor_id"]
            referencedRelation: "mfa_factors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfa_recovery_code_sets_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          consumed_at: string | null
          created_at: string
          id: string
          mfa_recovery_code_set_id: string
        }
        ComputedFields: never
        Insert: {
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          id: string
          mfa_recovery_code_set_id: string
        }
        Update: {
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          id?: string
          mfa_recovery_code_set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfa_recovery_codes_mfa_recovery_code_set_id_fkey"
            columns: ["mfa_recovery_code_set_id"]
            referencedRelation: "mfa_recovery_code_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_authorizations: {
        Row: {
          approved_at: string | null
          authorization_code: string | null
          authorization_id: string
          client_id: string
          code_challenge: string | null
          code_challenge_method:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at: string
          expires_at: string
          id: string
          nonce: string | null
          redirect_uri: string
          resource: string | null
          response_type: Database["auth"]["Enums"]["oauth_response_type"]
          scope: string
          state: string | null
          status: Database["auth"]["Enums"]["oauth_authorization_status"]
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          approved_at?: string | null
          authorization_code?: string | null
          authorization_id: string
          client_id: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string
          expires_at?: string
          id: string
          nonce?: string | null
          redirect_uri: string
          resource?: string | null
          response_type?: Database["auth"]["Enums"]["oauth_response_type"]
          scope: string
          state?: string | null
          status?: Database["auth"]["Enums"]["oauth_authorization_status"]
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          authorization_code?: string | null
          authorization_id?: string
          client_id?: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string
          expires_at?: string
          id?: string
          nonce?: string | null
          redirect_uri?: string
          resource?: string | null
          response_type?: Database["auth"]["Enums"]["oauth_response_type"]
          scope?: string
          state?: string | null
          status?: Database["auth"]["Enums"]["oauth_authorization_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oauth_authorizations_client_id_fkey"
            columns: ["client_id"]
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_authorizations_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_client_states: {
        Row: {
          code_verifier: string | null
          created_at: string
          id: string
          provider_type: string
        }
        ComputedFields: never
        Insert: {
          code_verifier?: string | null
          created_at: string
          id: string
          provider_type: string
        }
        Update: {
          code_verifier?: string | null
          created_at?: string
          id?: string
          provider_type?: string
        }
        Relationships: []
      }
      oauth_clients: {
        Row: {
          client_name: string | null
          client_secret_hash: string | null
          client_type: Database["auth"]["Enums"]["oauth_client_type"]
          client_uri: string | null
          created_at: string
          deleted_at: string | null
          grant_types: string
          id: string
          logo_uri: string | null
          redirect_uris: string
          registration_type: Database["auth"]["Enums"]["oauth_registration_type"]
          token_endpoint_auth_method: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          client_name?: string | null
          client_secret_hash?: string | null
          client_type?: Database["auth"]["Enums"]["oauth_client_type"]
          client_uri?: string | null
          created_at?: string
          deleted_at?: string | null
          grant_types: string
          id: string
          logo_uri?: string | null
          redirect_uris: string
          registration_type: Database["auth"]["Enums"]["oauth_registration_type"]
          token_endpoint_auth_method: string
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          client_secret_hash?: string | null
          client_type?: Database["auth"]["Enums"]["oauth_client_type"]
          client_uri?: string | null
          created_at?: string
          deleted_at?: string | null
          grant_types?: string
          id?: string
          logo_uri?: string | null
          redirect_uris?: string
          registration_type?: Database["auth"]["Enums"]["oauth_registration_type"]
          token_endpoint_auth_method?: string
          updated_at?: string
        }
        Relationships: []
      }
      oauth_consents: {
        Row: {
          client_id: string
          granted_at: string
          id: string
          revoked_at: string | null
          scopes: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          client_id: string
          granted_at?: string
          id: string
          revoked_at?: string | null
          scopes: string
          user_id: string
        }
        Update: {
          client_id?: string
          granted_at?: string
          id?: string
          revoked_at?: string | null
          scopes?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_consents_client_id_fkey"
            columns: ["client_id"]
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_consents_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      one_time_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          expires_at?: string | null
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          relates_to?: string
          token_hash?: string
          token_type?: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_time_tokens_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      refresh_tokens: {
        Row: {
          created_at: string | null
          id: number
          instance_id: string | null
          parent: string | null
          revoked: boolean | null
          session_id: string | null
          token: string | null
          updated_at: string | null
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refresh_tokens_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_providers: {
        Row: {
          attribute_mapping: Json | null
          created_at: string | null
          entity_id: string
          id: string
          metadata_url: string | null
          metadata_xml: string
          name_id_format: string | null
          sso_provider_id: string
          updated_at: string | null
        }
        ComputedFields: never
        Insert: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id: string
          id: string
          metadata_url?: string | null
          metadata_xml: string
          name_id_format?: string | null
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id?: string
          id?: string
          metadata_url?: string | null
          metadata_xml?: string
          name_id_format?: string | null
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_providers_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_relay_states: {
        Row: {
          created_at: string | null
          flow_state_id: string | null
          for_email: string | null
          id: string
          redirect_to: string | null
          request_id: string
          sso_provider_id: string
          updated_at: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id: string
          redirect_to?: string | null
          request_id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id?: string
          redirect_to?: string | null
          request_id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_relay_states_flow_state_id_fkey"
            columns: ["flow_state_id"]
            referencedRelation: "flow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saml_relay_states_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          version: string
        }
        ComputedFields: never
        Insert: {
          version: string
        }
        Update: {
          version?: string
        }
        Relationships: []
      }
      scim_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          prefix: string
          revoked_at: string | null
          sso_provider_id: string
          token_hash: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          expires_at?: string | null
          id: string
          last_used_at?: string | null
          prefix: string
          revoked_at?: string | null
          sso_provider_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          prefix?: string
          revoked_at?: string | null
          sso_provider_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "scim_tokens_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      scim_users: {
        Row: {
          active: boolean
          created_at: string
          deleted_at: string | null
          external_id: string | null
          id: string
          resource: NonNullable<Json>
          sso_provider_id: string
          updated_at: string
          user_id: string | null
          user_name: string
        }
        ComputedFields: never
        Insert: {
          active?: never
          created_at?: string
          deleted_at?: string | null
          external_id?: never
          id: string
          resource: NonNullable<Json>
          sso_provider_id: string
          updated_at?: string
          user_id?: string | null
          user_name?: never
        }
        Update: {
          active?: never
          created_at?: string
          deleted_at?: string | null
          external_id?: never
          id?: string
          resource?: NonNullable<Json>
          sso_provider_id?: string
          updated_at?: string
          user_id?: string | null
          user_name?: never
        }
        Relationships: [
          {
            foreignKeyName: "scim_users_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scim_users_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          aal: Database["auth"]["Enums"]["aal_level"] | null
          created_at: string | null
          factor_id: string | null
          id: string
          ip: unknown
          not_after: string | null
          oauth_client_id: string | null
          refresh_token_counter: number | null
          refresh_token_hmac_key: string | null
          refreshed_at: string | null
          scopes: string | null
          tag: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id: string
          ip?: unknown
          not_after?: string | null
          oauth_client_id?: string | null
          refresh_token_counter?: number | null
          refresh_token_hmac_key?: string | null
          refreshed_at?: string | null
          scopes?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id?: string
          ip?: unknown
          not_after?: string | null
          oauth_client_id?: string | null
          refresh_token_counter?: number | null
          refresh_token_hmac_key?: string | null
          refreshed_at?: string | null
          scopes?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_oauth_client_id_fkey"
            columns: ["oauth_client_id"]
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_domains: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sso_domains_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_providers: {
        Row: {
          created_at: string | null
          disabled: boolean | null
          id: string
          resource_id: string | null
          updated_at: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string | null
          disabled?: boolean | null
          id: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          disabled?: boolean | null
          id?: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          aud: string | null
          banned_until: string | null
          confirmation_sent_at: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          email_change: string | null
          email_change_confirm_status: number | null
          email_change_sent_at: string | null
          email_change_token_current: string | null
          email_change_token_new: string | null
          email_confirmed_at: string | null
          encrypted_password: string | null
          id: string
          instance_id: string | null
          invited_at: string | null
          is_anonymous: boolean
          is_sso_user: boolean
          is_super_admin: boolean | null
          last_sign_in_at: string | null
          phone: string | null
          phone_change: string | null
          phone_change_sent_at: string | null
          phone_change_token: string | null
          phone_confirmed_at: string | null
          raw_app_meta_data: Json | null
          raw_user_meta_data: Json | null
          reauthentication_sent_at: string | null
          reauthentication_token: string | null
          recovery_sent_at: string | null
          recovery_token: string | null
          role: string | null
          updated_at: string | null
        }
        ComputedFields: never
        Insert: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: never
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: never
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id?: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      webauthn_challenges: {
        Row: {
          challenge_type: string
          created_at: string
          expires_at: string
          id: string
          session_data: NonNullable<Json>
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          challenge_type: string
          created_at?: string
          expires_at: string
          id?: string
          session_data: NonNullable<Json>
          user_id?: string | null
        }
        Update: {
          challenge_type?: string
          created_at?: string
          expires_at?: string
          id?: string
          session_data?: NonNullable<Json>
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webauthn_challenges_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_credentials: {
        Row: {
          aaguid: string | null
          attestation_type: string
          backed_up: boolean
          backup_eligible: boolean
          created_at: string
          credential_id: string
          friendly_name: string
          id: string
          last_used_at: string | null
          public_key: string
          sign_count: number
          transports: NonNullable<Json>
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          aaguid?: string | null
          attestation_type?: string
          backed_up?: boolean
          backup_eligible?: boolean
          created_at?: string
          credential_id: string
          friendly_name?: string
          id?: string
          last_used_at?: string | null
          public_key: string
          sign_count?: number
          transports?: NonNullable<Json>
          updated_at?: string
          user_id: string
        }
        Update: {
          aaguid?: string | null
          attestation_type?: string
          backed_up?: boolean
          backup_eligible?: boolean
          created_at?: string
          credential_id?: string
          friendly_name?: string
          id?: string
          last_used_at?: string | null
          public_key?: string
          sign_count?: number
          transports?: NonNullable<Json>
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webauthn_credentials_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      email: { Args: Record<PropertyKey, never>; Returns: string }
      jwt: { Args: Record<PropertyKey, never>; Returns: Json }
      role: { Args: Record<PropertyKey, never>; Returns: string }
      uid: { Args: Record<PropertyKey, never>; Returns: string }
    }
    Enums: {
      aal_level: "aal1" | "aal2" | "aal3"
      code_challenge_method: "s256" | "plain"
      factor_status: "unverified" | "verified"
      factor_type: "totp" | "webauthn" | "phone" | "recovery_code"
      oauth_authorization_status: "pending" | "approved" | "denied" | "expired"
      oauth_client_type: "public" | "confidential"
      oauth_registration_type: "dynamic" | "manual"
      oauth_response_type: "code"
      one_time_token_type:
        | "confirmation_token"
        | "reauthentication_token"
        | "recovery_token"
        | "email_change_token_new"
        | "email_change_token_current"
        | "phone_change_token"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  extensions: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      pg_stat_statements: {
        Row: {
          calls: number | null
          dbid: unknown
          jit_deform_count: number | null
          jit_deform_time: number | null
          jit_emission_count: number | null
          jit_emission_time: number | null
          jit_functions: number | null
          jit_generation_time: number | null
          jit_inlining_count: number | null
          jit_inlining_time: number | null
          jit_optimization_count: number | null
          jit_optimization_time: number | null
          local_blk_read_time: number | null
          local_blk_write_time: number | null
          local_blks_dirtied: number | null
          local_blks_hit: number | null
          local_blks_read: number | null
          local_blks_written: number | null
          max_exec_time: number | null
          max_plan_time: number | null
          mean_exec_time: number | null
          mean_plan_time: number | null
          min_exec_time: number | null
          min_plan_time: number | null
          minmax_stats_since: string | null
          plans: number | null
          query: string | null
          queryid: number | null
          rows: number | null
          shared_blk_read_time: number | null
          shared_blk_write_time: number | null
          shared_blks_dirtied: number | null
          shared_blks_hit: number | null
          shared_blks_read: number | null
          shared_blks_written: number | null
          stats_since: string | null
          stddev_exec_time: number | null
          stddev_plan_time: number | null
          temp_blk_read_time: number | null
          temp_blk_write_time: number | null
          temp_blks_read: number | null
          temp_blks_written: number | null
          toplevel: boolean | null
          total_exec_time: number | null
          total_plan_time: number | null
          userid: unknown
          wal_bytes: number | null
          wal_fpi: number | null
          wal_records: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      pg_stat_statements_info: {
        Row: {
          dealloc: number | null
          stats_reset: string | null
        }
        ComputedFields: never
        Relationships: []
      }
    }
    Functions: {
      dearmor: { Args: { "": string }; Returns: string }
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string }
      gen_salt: { Args: { "": string }; Returns: string }
      pg_stat_statements: {
        Args: { showtext: boolean }
        Returns: Record<string, unknown>[]
      }
      pg_stat_statements_info: {
        Args: Record<PropertyKey, never>
        Returns: Record<string, unknown>
      }
      pg_stat_statements_reset: {
        Args: {
          dbid?: unknown
          minmax_only?: boolean
          queryid?: number
          userid?: unknown
        }
        Returns: string
      }
      pgp_armor_headers: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      uuid_generate_v1: { Args: Record<PropertyKey, never>; Returns: string }
      uuid_generate_v1mc: { Args: Record<PropertyKey, never>; Returns: string }
      uuid_generate_v3: {
        Args: { name: string; namespace: string }
        Returns: string
      }
      uuid_generate_v4: { Args: Record<PropertyKey, never>; Returns: string }
      uuid_generate_v5: {
        Args: { name: string; namespace: string }
        Returns: string
      }
      uuid_nil: { Args: Record<PropertyKey, never>; Returns: string }
      uuid_ns_dns: { Args: Record<PropertyKey, never>; Returns: string }
      uuid_ns_oid: { Args: Record<PropertyKey, never>; Returns: string }
      uuid_ns_url: { Args: Record<PropertyKey, never>; Returns: string }
      uuid_ns_x500: { Args: Record<PropertyKey, never>; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  graphql: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  pgbouncer: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_auth: {
        Args: { p_usename: string }
        Returns: {
          password: string
          username: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
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
            foreignKeyName: "alert_deliveries_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "public_jobs"
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
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "public_jobs"
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
          id: string
          meta: Json | null
        }
        ComputedFields: never
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json | null
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
            foreignKeyName: "broadcast_deliveries_business_profile_id_fkey"
            columns: ["business_profile_id"]
            referencedRelation: "public_business_profiles"
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
            foreignKeyName: "corporate_tie_ups_employer_id_fkey"
            columns: ["employer_id"]
            referencedRelation: "public_business_profiles"
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
      credit_ledgers: {
        Row: {
          actor_id: string | null
          amount: number
          created_at: string
          id: string
          reason: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          actor_id?: string | null
          amount: number
          created_at?: string
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
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
          is_sponsorship_active: boolean
          pincode: string | null
          placement_brochure_url: string | null
          principal_name: string | null
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
          is_sponsorship_active?: boolean
          pincode?: string | null
          placement_brochure_url?: string | null
          principal_name?: string | null
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
          is_sponsorship_active?: boolean
          pincode?: string | null
          placement_brochure_url?: string | null
          principal_name?: string | null
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
          payment_reference: string | null
          rate_per_student: number
          started_at: string
          status: string
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
          payment_reference?: string | null
          rate_per_student?: number
          started_at?: string
          status?: string
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
          payment_reference?: string | null
          rate_per_student?: number
          started_at?: string
          status?: string
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
        ]
      }
      invitations: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          phone: string
          status: string
        }
        ComputedFields: never
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          phone: string
          status?: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          phone?: string
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
          qualification: string | null
          seeker_type: string
          skills: string[] | null
          source: string | null
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
          qualification?: string | null
          seeker_type?: string
          skills?: string[] | null
          source?: string | null
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
          qualification?: string | null
          seeker_type?: string
          skills?: string[] | null
          source?: string | null
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
      payments: {
        Row: {
          amount_inr: number
          created_at: string
          credits_added: number
          currency: string
          gateway_order_id: string
          gateway_payment_id: string | null
          gateway_signature: string | null
          id: string
          invoice_number: string | null
          metadata: Json | null
          pack_id: string | null
          processed_at: string | null
          processed_by: string | null
          status: string
          tax_amount_inr: number
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          amount_inr: number
          created_at?: string
          credits_added?: number
          currency?: string
          gateway_order_id: string
          gateway_payment_id?: string | null
          gateway_signature?: string | null
          id?: string
          invoice_number?: string | null
          metadata?: Json | null
          pack_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status: string
          tax_amount_inr?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_inr?: number
          created_at?: string
          credits_added?: number
          currency?: string
          gateway_order_id?: string
          gateway_payment_id?: string | null
          gateway_signature?: string | null
          id?: string
          invoice_number?: string | null
          metadata?: Json | null
          pack_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          tax_amount_inr?: number
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
            foreignKeyName: "placement_applications_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "public_jobs"
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
          phone: string
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
          phone: string
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
          phone?: string
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
          id: string | null
          is_dpiit_startup: boolean | null
          is_msme: boolean | null
          know_my_business: string | null
          logo_url: string | null
          ownership_type: string | null
          products_brief: string | null
          sector: string | null
          services_brief: string | null
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
          id?: string | null
          is_dpiit_startup?: boolean | null
          is_msme?: boolean | null
          know_my_business?: string | null
          logo_url?: string | null
          ownership_type?: string | null
          products_brief?: string | null
          sector?: string | null
          services_brief?: string | null
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
          id?: string | null
          is_dpiit_startup?: boolean | null
          is_msme?: boolean | null
          know_my_business?: string | null
          logo_url?: string | null
          ownership_type?: string | null
          products_brief?: string | null
          sector?: string | null
          services_brief?: string | null
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
          cms_data: Json | null
          created_at: string | null
          district: string | null
          establishment_year: number | null
          id: string | null
          institution_name: string | null
          institution_type: string | null
          placement_brochure_url: string | null
          state: string | null
          trades_offered: string[] | null
          website: string | null
        }
        ComputedFields: never
        Insert: {
          about?: string | null
          affiliation?: string | null
          annual_capacity?: number | null
          city?: string | null
          cms_data?: Json | null
          created_at?: string | null
          district?: string | null
          establishment_year?: number | null
          id?: string | null
          institution_name?: string | null
          institution_type?: string | null
          placement_brochure_url?: string | null
          state?: string | null
          trades_offered?: string[] | null
          website?: string | null
        }
        Update: {
          about?: string | null
          affiliation?: string | null
          annual_capacity?: number | null
          city?: string | null
          cms_data?: Json | null
          created_at?: string | null
          district?: string | null
          establishment_year?: number | null
          id?: string | null
          institution_name?: string | null
          institution_type?: string | null
          placement_brochure_url?: string | null
          state?: string | null
          trades_offered?: string[] | null
          website?: string | null
        }
        Relationships: []
      }
      public_jobs: {
        Row: {
          category: Database["public"]["Enums"]["job_category"] | null
          city: string | null
          created_at: string | null
          description: string | null
          district: string | null
          employer_id: string | null
          employment_type: string | null
          experience_level: string | null
          expiry_date: string | null
          featured_until: string | null
          id: string | null
          is_featured: boolean | null
          max_pay: number | null
          min_pay: number | null
          openings: number | null
          skills: string[] | null
          state: string | null
          title: string | null
        }
        ComputedFields: never
        Insert: {
          category?: Database["public"]["Enums"]["job_category"] | null
          city?: string | null
          created_at?: string | null
          description?: string | null
          district?: string | null
          employer_id?: string | null
          employment_type?: string | null
          experience_level?: string | null
          expiry_date?: string | null
          featured_until?: string | null
          id?: string | null
          is_featured?: boolean | null
          max_pay?: number | null
          min_pay?: number | null
          openings?: number | null
          skills?: string[] | null
          state?: string | null
          title?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["job_category"] | null
          city?: string | null
          created_at?: string | null
          description?: string | null
          district?: string | null
          employer_id?: string | null
          employment_type?: string | null
          experience_level?: string | null
          expiry_date?: string | null
          featured_until?: string | null
          id?: string | null
          is_featured?: boolean | null
          max_pay?: number | null
          min_pay?: number | null
          openings?: number | null
          skills?: string[] | null
          state?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_employer_id_fkey"
            columns: ["employer_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      anonymise_user: { Args: { p_user_id: string }; Returns: Json }
      deduct_application_credit_with_ledger: {
        Args: {
          p_applicant_id: string
          p_cost?: number
          p_job_id: string
          p_job_title: string
        }
        Returns: Json
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
      get_user_credit_balance: { Args: { p_user_id: string }; Returns: Json }
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
          created_at: string
          created_by: string
          description: string
          district: string
          employer_id: string
          employment_type: string
          experience_level: string
          expiry_date: string
          featured_until: string
          id: string
          is_active: boolean
          is_featured: boolean
          max_pay: number
          min_pay: number
          openings: number
          skills: string[]
          source: string
          state: string
          title: string
          total_count: number
          updated_at: string
          updated_by: string
        }[]
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
  realtime: {
    Tables: {
      messages: {
        Row: {
          binary_payload: string | null
          event: string | null
          expires_at: string | null
          extension: string
          id: string
          inserted_at: string
          payload: Json | null
          private: boolean | null
          skip_broadcast: boolean
          topic: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          binary_payload?: string | null
          event?: string | null
          expires_at?: string | null
          extension: string
          id?: string
          inserted_at?: string
          payload?: Json | null
          private?: boolean | null
          skip_broadcast?: boolean
          topic: string
          updated_at?: string
        }
        Update: {
          binary_payload?: string | null
          event?: string | null
          expires_at?: string | null
          extension?: string
          id?: string
          inserted_at?: string
          payload?: Json | null
          private?: boolean | null
          skip_broadcast?: boolean
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages_2026_11_10: {
        Row: {
          binary_payload: string | null
          event: string | null
          expires_at: string | null
          extension: string
          id: string
          inserted_at: string
          payload: Json | null
          private: boolean | null
          skip_broadcast: boolean
          topic: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          binary_payload?: string | null
          event?: string | null
          expires_at?: string | null
          extension: string
          id?: string
          inserted_at?: string
          payload?: Json | null
          private?: boolean | null
          skip_broadcast?: boolean
          topic: string
          updated_at?: string
        }
        Update: {
          binary_payload?: string | null
          event?: string | null
          expires_at?: string | null
          extension?: string
          id?: string
          inserted_at?: string
          payload?: Json | null
          private?: boolean | null
          skip_broadcast?: boolean
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages_2026_11_11: {
        Row: {
          binary_payload: string | null
          event: string | null
          expires_at: string | null
          extension: string
          id: string
          inserted_at: string
          payload: Json | null
          private: boolean | null
          skip_broadcast: boolean
          topic: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          binary_payload?: string | null
          event?: string | null
          expires_at?: string | null
          extension: string
          id?: string
          inserted_at?: string
          payload?: Json | null
          private?: boolean | null
          skip_broadcast?: boolean
          topic: string
          updated_at?: string
        }
        Update: {
          binary_payload?: string | null
          event?: string | null
          expires_at?: string | null
          extension?: string
          id?: string
          inserted_at?: string
          payload?: Json | null
          private?: boolean | null
          skip_broadcast?: boolean
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages_2026_11_12: {
        Row: {
          binary_payload: string | null
          event: string | null
          expires_at: string | null
          extension: string
          id: string
          inserted_at: string
          payload: Json | null
          private: boolean | null
          skip_broadcast: boolean
          topic: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          binary_payload?: string | null
          event?: string | null
          expires_at?: string | null
          extension: string
          id?: string
          inserted_at?: string
          payload?: Json | null
          private?: boolean | null
          skip_broadcast?: boolean
          topic: string
          updated_at?: string
        }
        Update: {
          binary_payload?: string | null
          event?: string | null
          expires_at?: string | null
          extension?: string
          id?: string
          inserted_at?: string
          payload?: Json | null
          private?: boolean | null
          skip_broadcast?: boolean
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages_2026_11_13: {
        Row: {
          binary_payload: string | null
          event: string | null
          expires_at: string | null
          extension: string
          id: string
          inserted_at: string
          payload: Json | null
          private: boolean | null
          skip_broadcast: boolean
          topic: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          binary_payload?: string | null
          event?: string | null
          expires_at?: string | null
          extension: string
          id?: string
          inserted_at?: string
          payload?: Json | null
          private?: boolean | null
          skip_broadcast?: boolean
          topic: string
          updated_at?: string
        }
        Update: {
          binary_payload?: string | null
          event?: string | null
          expires_at?: string | null
          extension?: string
          id?: string
          inserted_at?: string
          payload?: Json | null
          private?: boolean | null
          skip_broadcast?: boolean
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages_2026_11_14: {
        Row: {
          binary_payload: string | null
          event: string | null
          expires_at: string | null
          extension: string
          id: string
          inserted_at: string
          payload: Json | null
          private: boolean | null
          skip_broadcast: boolean
          topic: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          binary_payload?: string | null
          event?: string | null
          expires_at?: string | null
          extension: string
          id?: string
          inserted_at?: string
          payload?: Json | null
          private?: boolean | null
          skip_broadcast?: boolean
          topic: string
          updated_at?: string
        }
        Update: {
          binary_payload?: string | null
          event?: string | null
          expires_at?: string | null
          extension?: string
          id?: string
          inserted_at?: string
          payload?: Json | null
          private?: boolean | null
          skip_broadcast?: boolean
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      schema_migrations: {
        Row: {
          inserted_at: string | null
          version: number
        }
        ComputedFields: never
        Insert: {
          inserted_at?: string | null
          version: number
        }
        Update: {
          inserted_at?: string | null
          version?: number
        }
        Relationships: []
      }
      subscription: {
        Row: {
          action_filter: string | null
          claims: NonNullable<Json>
          claims_role: unknown
          created_at: string
          entity: unknown
          filters: Database["realtime"]["CompositeTypes"]["user_defined_filter"][]
          id: number
          selected_columns: string[] | null
          subscription_id: string
        }
        ComputedFields: never
        Insert: {
          action_filter?: string | null
          claims: NonNullable<Json>
          claims_role?: never
          created_at?: string
          entity: unknown
          filters?: Database["realtime"]["CompositeTypes"]["user_defined_filter"][]
          id?: never
          selected_columns?: string[] | null
          subscription_id: string
        }
        Update: {
          action_filter?: string | null
          claims?: NonNullable<Json>
          claims_role?: never
          created_at?: string
          entity?: unknown
          filters?: Database["realtime"]["CompositeTypes"]["user_defined_filter"][]
          id?: never
          selected_columns?: string[] | null
          subscription_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_rls: {
        Args: { max_record_bytes?: number; wal: Json }
        Returns: Database["realtime"]["CompositeTypes"]["wal_rls"][]
        SetofOptions: {
          from: "*"
          to: "wal_rls"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      authorize: {
        Args: {
          claims: string
          headers: string
          read_extensions: string[]
          role_name: string
          sub: string
          topic_name: string
          write_extensions: string[]
        }
        Returns: Record<string, unknown>
      }
      broadcast_changes: {
        Args: {
          event_name: string
          level?: string
          new: Record<string, unknown>
          old: Record<string, unknown>
          operation: string
          table_name: string
          table_schema: string
          topic_name: string
        }
        Returns: undefined
      }
      build_prepared_statement_sql: {
        Args: {
          columns: Database["realtime"]["CompositeTypes"]["wal_column"][]
          entity: unknown
          prepared_statement_name: string
        }
        Returns: string
      }
      cast: { Args: { type_: unknown; val: string }; Returns: Json }
      check_equality_op:
        | {
            Args: {
              op: Database["realtime"]["Enums"]["equality_op"]
              type_: unknown
              val_1: string
              val_2: string
            }
            Returns: boolean
          }
        | {
            Args: {
              negate: boolean
              op: Database["realtime"]["Enums"]["equality_op"]
              type_: unknown
              val_1: string
              val_2: string
            }
            Returns: boolean
          }
      filters_hash: {
        Args: {
          filters: Database["realtime"]["CompositeTypes"]["user_defined_filter"][]
        }
        Returns: string
      }
      is_visible_through_filters: {
        Args: {
          columns: Database["realtime"]["CompositeTypes"]["wal_column"][]
          filters: Database["realtime"]["CompositeTypes"]["user_defined_filter"][]
        }
        Returns: boolean
      }
      list_changes: {
        Args: {
          max_changes: number
          max_record_bytes: number
          publication: unknown
          slot_name: unknown
        }
        Returns: {
          errors: string[]
          is_rls_enabled: boolean
          slot_changes_count: number
          subscription_ids: string[]
          wal: Json
        }[]
      }
      list_changes_sync: {
        Args: {
          max_changes: number
          max_record_bytes: number
          publication: unknown
          slot_name: unknown
        }
        Returns: {
          errors: string[]
          is_rls_enabled: boolean
          slot_changes_count: number
          subscription_ids: string[]
          wal: Json
        }[]
      }
      quote_wal2json: { Args: { entity: unknown }; Returns: string }
      send: {
        Args: { event: string; payload: Json; private?: boolean; topic: string }
        Returns: undefined
      }
      send_binary: {
        Args: {
          event: string
          payload: string
          private?: boolean
          topic: string
        }
        Returns: undefined
      }
      settled_changes: {
        Args: { max_changes: number; opts: string[]; slot_name: unknown }
        Returns: {
          data: string
          lsn: unknown
          xid: unknown
        }[]
      }
      to_regrole: { Args: { role_name: string }; Returns: unknown }
      topic: { Args: Record<PropertyKey, never>; Returns: string }
      wal2json_escape_identifier: { Args: { name: string }; Returns: string }
    }
    Enums: {
      action: "INSERT" | "UPDATE" | "DELETE" | "TRUNCATE" | "ERROR"
      equality_op:
        | "eq"
        | "neq"
        | "lt"
        | "lte"
        | "gt"
        | "gte"
        | "in"
        | "like"
        | "ilike"
        | "is"
        | "match"
        | "imatch"
        | "isdistinct"
    }
    CompositeTypes: {
      user_defined_filter: {
        column_name: string | null
        op: Database["realtime"]["Enums"]["equality_op"] | null
        value: string | null
        negate: boolean | null
      }
      wal_column: {
        name: string | null
        type_name: string | null
        type_oid: unknown
        value: Json | null
        is_pkey: boolean | null
        is_selectable: boolean | null
      }
      wal_rls: {
        wal: Json | null
        is_rls_enabled: boolean | null
        subscription_ids: string[] | null
        errors: string[] | null
      }
    }
  }
  storage: {
    Tables: {
      bucket_lifecycle_states: {
        Row: {
          bucket_id: string
          claim_id: string | null
          claim_until: string | null
          continuation: Json | null
          failure_count: number
          generation: string | null
          last_completed_at: string | null
          last_error: Json | null
          last_result: Json | null
          last_started_at: string | null
          last_success_at: string | null
          next_run_at: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          bucket_id: string
          claim_id?: string | null
          claim_until?: string | null
          continuation?: Json | null
          failure_count?: number
          generation?: string | null
          last_completed_at?: string | null
          last_error?: Json | null
          last_result?: Json | null
          last_started_at?: string | null
          last_success_at?: string | null
          next_run_at?: string | null
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          claim_id?: string | null
          claim_until?: string | null
          continuation?: Json | null
          failure_count?: number
          generation?: string | null
          last_completed_at?: string | null
          last_error?: Json | null
          last_result?: Json | null
          last_started_at?: string | null
          last_success_at?: string | null
          next_run_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bucket_lifecycle_states_bucket_id_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          lifecycle_configuration: Json | null
          lifecycle_configuration_generation: string | null
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
          versioning_status: string
        }
        ComputedFields: never
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          lifecycle_configuration?: Json | null
          lifecycle_configuration_generation?: string | null
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          lifecycle_configuration?: Json | null
          lifecycle_configuration_generation?: string | null
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: NonNullable<Json>
          name: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: NonNullable<Json>
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: NonNullable<Json>
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_abandoned_artifacts: {
        Row: {
          attempted_at: string
          bucket_id: string
          key: string
          name: string
          version: string | null
        }
        ComputedFields: never
        Insert: {
          attempted_at?: string
          bucket_id: string
          key: string
          name: string
          version?: string | null
        }
        Update: {
          attempted_at?: string
          bucket_id?: string
          key?: string
          name?: string
          version?: string | null
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        ComputedFields: never
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          archived_at: string | null
          bucket_id: string | null
          created_at: string | null
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: never
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: never
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        ComputedFields: never
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        ComputedFields: never
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      delete_lifecycle_objects: {
        Args: { object_ids: string[] }
        Returns: {
          id: string
          is_delete_marker: boolean
          metadata: Json
        }[]
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: { delete_markers?: string; noncurrent_versions?: string }
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
          raw_prefix_param?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delete_markers?: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          next_token_archived_at?: string
          next_token_version?: string
          noncurrent_versions?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          archived_at: string
          created_at: string
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
          version: string
        }[]
      }
      operation: { Args: Record<PropertyKey, never>; Returns: string }
      reconcile_lifecycle_state: {
        Args: { policy_changed: boolean; target_bucket_id: string }
        Returns: undefined
      }
      search: {
        Args: {
          bucketname: string
          delete_markers?: string
          levels?: number
          limits?: number
          noncurrent_versions?: string
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          archived_at: string
          created_at: string
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
          version: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          delete_markers?: string
          noncurrent_versions?: string
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
          p_start_after_version?: string
        }
        Returns: {
          archived_at: string
          created_at: string
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
          version: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          delete_markers?: string
          levels?: number
          limits?: number
          noncurrent_versions?: string
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
          start_after_archived_at?: string
          start_after_is_continuation?: boolean
          start_after_version?: string
        }
        Returns: {
          archived_at: string
          created_at: string
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
          version: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  supabase_functions: {
    Tables: {
      hooks: {
        Row: {
          created_at: string
          hook_name: string
          hook_table_id: number
          id: number
          request_id: number | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          hook_name: string
          hook_table_id: number
          id?: number
          request_id?: number | null
        }
        Update: {
          created_at?: string
          hook_name?: string
          hook_table_id?: number
          id?: number
          request_id?: number | null
        }
        Relationships: []
      }
      migrations: {
        Row: {
          inserted_at: string
          version: string
        }
        ComputedFields: never
        Insert: {
          inserted_at?: string
          version: string
        }
        Update: {
          inserted_at?: string
          version?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  supabase_migrations: {
    Tables: {
      schema_migrations: {
        Row: {
          name: string | null
          statements: string[] | null
          version: string
        }
        ComputedFields: never
        Insert: {
          name?: string | null
          statements?: string[] | null
          version: string
        }
        Update: {
          name?: string | null
          statements?: string[] | null
          version?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  vault: {
    Tables: {
      secrets: {
        Row: {
          created_at: string
          description: string
          id: string
          key_id: string | null
          name: string | null
          nonce: string | null
          secret: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          description?: string
          id?: string
          key_id?: string | null
          name?: string | null
          nonce?: string | null
          secret: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          key_id?: string | null
          name?: string | null
          nonce?: string | null
          secret?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      decrypted_secrets: {
        Row: {
          created_at: string | null
          decrypted_secret: string | null
          description: string | null
          id: string | null
          key_id: string | null
          name: string | null
          nonce: string | null
          secret: string | null
          updated_at: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string | null
          decrypted_secret?: never
          description?: string | null
          id?: string | null
          key_id?: string | null
          name?: string | null
          nonce?: string | null
          secret?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          decrypted_secret?: never
          description?: string | null
          id?: string | null
          key_id?: string | null
          name?: string | null
          nonce?: string | null
          secret?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _crypto_aead_det_decrypt: {
        Args: {
          additional: string
          context?: string
          key_id: number
          message: string
          nonce?: string
        }
        Returns: string
      }
      _crypto_aead_det_encrypt: {
        Args: {
          additional: string
          context?: string
          key_id: number
          message: string
          nonce?: string
        }
        Returns: string
      }
      _crypto_aead_det_noncegen: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      create_secret: {
        Args: {
          new_description?: string
          new_key_id?: string
          new_name?: string
          new_secret: string
        }
        Returns: string
      }
      update_secret: {
        Args: {
          new_description?: string
          new_key_id?: string
          new_name?: string
          new_secret?: string
          secret_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  _realtime: {
    Enums: {},
  },
  auth: {
    Enums: {
      aal_level: ["aal1", "aal2", "aal3"],
      code_challenge_method: ["s256", "plain"],
      factor_status: ["unverified", "verified"],
      factor_type: ["totp", "webauthn", "phone", "recovery_code"],
      oauth_authorization_status: ["pending", "approved", "denied", "expired"],
      oauth_client_type: ["public", "confidential"],
      oauth_registration_type: ["dynamic", "manual"],
      oauth_response_type: ["code"],
      one_time_token_type: [
        "confirmation_token",
        "reauthentication_token",
        "recovery_token",
        "email_change_token_new",
        "email_change_token_current",
        "phone_change_token",
      ],
    },
  },
  extensions: {
    Enums: {},
  },
  graphql: {
    Enums: {},
  },
  graphql_public: {
    Enums: {},
  },
  pgbouncer: {
    Enums: {},
  },
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
  realtime: {
    Enums: {
      action: ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "ERROR"],
      equality_op: [
        "eq",
        "neq",
        "lt",
        "lte",
        "gt",
        "gte",
        "in",
        "like",
        "ilike",
        "is",
        "match",
        "imatch",
        "isdistinct",
      ],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
  supabase_functions: {
    Enums: {},
  },
  supabase_migrations: {
    Enums: {},
  },
  vault: {
    Enums: {},
  },
} as const
