-- Migration: 20261128000000_private_bucket_allow_pdf.sql
-- Description: Allow PDF uploads in the private bucket. Forward migration; replaces the
-- in-place edit of 20261110000000 (applied migrations must never be modified).

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) THEN
        UPDATE storage.buckets
        SET allowed_mime_types = ARRAY[
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/pdf'
        ]
        WHERE id = 'private';
    END IF;
END $$;
