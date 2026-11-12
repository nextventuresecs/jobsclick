-- Migration: 20261110000000_private_storage_bucket.sql
-- Phase 1.2 DB Hardening: Initialize private storage bucket for bulk CSV/XLSX imports
-- Hard Invariants: #1 (Zero PII leakage), #5 (service-role only access)

DO $$
BEGIN
    -- Ensure storage.buckets exists (Supabase storage schema)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'private',
            'private',
            false,
            10485760, -- 10 MB limit
            ARRAY[
                'text/csv',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ]
        )
        ON CONFLICT (id) DO UPDATE SET
            public = false,
            file_size_limit = 10485760,
            allowed_mime_types = ARRAY[
                'text/csv',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ];
    END IF;
END $$;
